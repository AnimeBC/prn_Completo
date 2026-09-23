import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { publishEvent, cacheDel, rateLimit } from '../db/redis.js';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { slugify } from '../utils/slug.js';
import {
  MEDIA_DIR, publicOf, packUpload, packFolderName, packRootDir, removePackFolder, moveFileSync,
} from '../services/upload.js';
import { hasFFmpeg, transcodeVideo, transcodeImage, fmtDuration } from '../services/transcode.js';
import { createZipStream } from '../services/zip.js';

const r = Router();

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 horas

function splitTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function newPublicId() {
  return crypto.randomBytes(16).toString('hex'); // 32 chars
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim() || 'unknown';
}

/** Link de descarga automático → página /packs/<public_id>/descargar */
function autoDownload(p, base) {
  const b = base.replace(/\/+$/, '');
  const pub = p.public_id || p.id;
  const d = p.download;
  if (!d || d === '#' || !String(d).includes('/descargar')) return `${b}/packs/${pub}/descargar`;
  return d;
}

async function getPackByPublic(publicId) {
  const key = String(publicId || '').trim();
  if (!key) return null;
  const { rows } = await query('SELECT * FROM packs WHERE public_id = $1 LIMIT 1', [key]);
  return rows[0] || null;
}

/** Valida el token de descarga (?t=) contra la BD. */
async function hasValidToken(req, pack) {
  const t = String(req.query.t || '').trim();
  if (!t) return false;
  const { rows } = await query(
    `SELECT 1 FROM pack_download_tokens
      WHERE token_hash = $1 AND pack_id = $2 AND expires_at > NOW() LIMIT 1`,
    [sha256(t), pack.id]
  );
  return !!rows[0];
}

/** Transcodifica el video de un pack en segundo plano y actualiza pack_media. */
async function finishPackVideo({ mediaId, origPath, destDir }) {
  try {
    if (!hasFFmpeg) return;
    const { renditions, poster, duration } = await transcodeVideo({ inputPath: origPath, destDir });
    const rel = path.relative(MEDIA_DIR, destDir).replace(/\\/g, '/');
    const list = renditions.map((x) => ({ label: x.label, height: x.height, src: `/media/${rel}/${x.file}` }));
    const def = list.find((x) => x.label === '720p') || list[0] || null;
    const thumb = poster ? `/media/${rel}/thumbs/poster.jpg` : null;

    await query(
      `UPDATE pack_media
          SET src = COALESCE($1, src), thumb = COALESCE($2, thumb),
              renditions = $3::jsonb, duracion = $4
        WHERE id = $5`,
      [def?.src || null, thumb, JSON.stringify(list), fmtDuration(duration), mediaId]
    );
    fs.rm(origPath, { force: true }, () => {});
    await publishEvent('pack_media_ready', { mediaId });
  } catch (err) {
    console.error(`[pack] transcode falló (media ${mediaId}):`, err.message);
  }
}

// ============================================================
// Listado (frontend + admin)
// GET /api/packs?q=&page=&limit=&papelera=
// ============================================================
r.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const papelera = req.query.papelera === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
    const offset = (page - 1) * limit;

    const where = [papelera ? 'p.activo = FALSE' : 'p.activo = TRUE'];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(COALESCE(p.titulo_es, p.titulo) ILIKE $${params.length}
                OR COALESCE(p.titulo_en, p.titulo) ILIKE $${params.length}
                OR p.uploader ILIKE $${params.length})`);
    }
    const base = `FROM packs p WHERE ${where.join(' AND ')}`;

    const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
    const { rows } = await query(
      `SELECT p.*,
              COALESCE(u.avatar, c.avatar) AS canal_avatar,
              c.slug AS canal_slug
         FROM packs p
         LEFT JOIN channels c ON c.nombre = p.uploader
         LEFT JOIN users u ON u.user_key = c.user_key
        WHERE ${where.join(' AND ')}
        ORDER BY p.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const base2 = env.frontendUrl.replace(/\/+$/, '');
    const data = rows.map((row) => ({ ...row, download: autoDownload(row, base2) }));

    res.json({ data, total: countRes.rows[0].total, page, limit });
  } catch (e) { next(e); }
});

// Compatibilidad: /api/packs/legacy/:id → public_id (para redirigir links viejos)
r.get('/legacy/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Pack no encontrado' });
    const { rows } = await query('SELECT public_id FROM packs WHERE id = $1 LIMIT 1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    res.json({ public_id: rows[0].public_id });
  } catch (e) { next(e); }
});

// ============================================================
// Subir pack (Bearer) multipart: thumb + videos[] + images[]
// ============================================================
r.post(
  '/upload',
  authRequired,
  packUpload.fields([
    { name: 'thumb', maxCount: 1 },
    { name: 'videos', maxCount: 20 },
    { name: 'images', maxCount: 40 },
  ]),
  async (req, res, next) => {
    try {
      const b = req.body || {};
      const titleEs = String(b.titleEs || b.title || '').trim();
      const titleEn = String(b.titleEn || titleEs).trim();
      if (!titleEs) return res.status(400).json({ error: 'El título ES es obligatorio' });

      const uploader = String(b.uploader || 'administrador pikante.pe').trim();
      const precio = String(b.precio || 'S/ 0.00').trim();
      const tags = splitTags(b.tags);
      const slugBase = slugify(titleEs) || 'pack';
      const publicId = newPublicId();

      const ins = await query(
        `INSERT INTO packs (public_id, titulo_es, titulo_en, desc_es, desc_en, uploader, precio, tags, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, TRUE)
         RETURNING id`,
        [publicId, titleEs, titleEn, String(b.descEs || '').trim(), String(b.descEn || '').trim(), uploader, precio, tags]
      );
      const id = ins.rows[0].id;
      const slug = `${slugBase}-${id}`;
      const folderName = packFolderName(slugBase, id);
      const packDir = path.join(packRootDir(), folderName);
      const packDirRel = path.relative(MEDIA_DIR, packDir).replace(/\\/g, '/');
      // Link de descarga automático → página de descargas del pack.
      const packUrl = `${env.frontendUrl.replace(/\/+$/, '')}/packs/${publicId}/descargar`;
      await query(
        'UPDATE packs SET slug = $1, download = $2, pack_dir = $3 WHERE id = $4',
        [slug, packUrl, packDirRel, id]
      );
      fs.mkdirSync(packDir, { recursive: true });

      // ---- portada (+ calidades) ----
      let thumbPublic = null;
      const thumbFile = req.files?.thumb?.[0];
      if (thumbFile) {
        const thumbDir = path.join(packDir, 'thumb');
        const { renditions } = await transcodeImage({ inputPath: thumbFile.path, destDir: thumbDir });
        thumbPublic = publicOf(path.join(thumbDir, renditions[0].file));
        fs.rm(thumbFile.path, { force: true }, () => {});
      }

      // ---- videos ----
      const videoFiles = req.files?.videos || [];
      for (let i = 0; i < videoFiles.length; i++) {
        const vf = videoFiles[i];
        const vDir = path.join(packDir, 'videos', `video_${String(i + 1).padStart(2, '0')}`);
        fs.mkdirSync(vDir, { recursive: true });
        const ext = (path.extname(vf.filename) || '.mp4').toLowerCase();
        const origPath = path.join(vDir, `original${ext}`);
        moveFileSync(vf.path, origPath);

        const media = await query(
          `INSERT INTO pack_media (pack_id, tipo, src, thumb, orden, renditions)
           VALUES ($1, 'video', $2, NULL, $3, '[]'::jsonb) RETURNING id`,
          [id, publicOf(origPath), i]
        );
        finishPackVideo({ mediaId: media.rows[0].id, origPath, destDir: vDir });
      }

      // ---- imágenes ----
      const imageFiles = req.files?.images || [];
      for (let i = 0; i < imageFiles.length; i++) {
        const imgDir = path.join(packDir, 'imagenes', `img_${String(i + 1).padStart(2, '0')}`);
        const { renditions } = await transcodeImage({ inputPath: imageFiles[i].path, destDir: imgDir });
        fs.rm(imageFiles[i].path, { force: true }, () => {});

        const main = renditions.find((x) => x.label === '1280') || renditions[0];
        const mini = renditions.find((x) => x.label === '720') || main;
        await query(
          `INSERT INTO pack_media (pack_id, tipo, src, thumb, orden, renditions)
           VALUES ($1, 'foto', $2, $3, $4, $5::jsonb)`,
          [id, publicOf(path.join(imgDir, main.file)), publicOf(path.join(imgDir, mini.file)), i, JSON.stringify(renditions)]
        );
      }

      await query(
        'UPDATE packs SET thumb = $1, fotos = $2, videos = $3 WHERE id = $4',
        [thumbPublic, imageFiles.length, videoFiles.length, id]
      );

      await cacheDel('cache:stats');
      await publishEvent('pack_created', { id });

      const { rows } = await query('SELECT * FROM packs WHERE id = $1', [id]);
      res.status(201).json({ ok: true, pack: rows[0], processing: !!(hasFFmpeg && videoFiles.length) });
    } catch (e) { next(e); }
  }
);

// GET /api/packs/:publicId   (detalle + galería)
r.get('/:publicId', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const media = await query(
      `SELECT id, tipo, src, thumb, orden, renditions, duracion
         FROM pack_media WHERE pack_id = $1 ORDER BY tipo, orden ASC, id ASC`,
      [pack.id]
    );

    pack.download = autoDownload(pack, env.frontendUrl);
    res.json({ ...pack, media: media.rows });
  } catch (e) { next(e); }
});

// PUT /api/packs/:publicId  (Bearer) — edita metadata
r.put('/:publicId', authRequired, async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    const b = req.body || {};

    const { rows } = await query(
      `UPDATE packs SET
         titulo_es = COALESCE($1, titulo_es),
         titulo_en = COALESCE($2, titulo_en),
         desc_es   = COALESCE($3, desc_es),
         desc_en   = COALESCE($4, desc_en),
         uploader  = COALESCE($5, uploader),
         precio    = COALESCE($6, precio),
         tags      = COALESCE($7, tags),
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        b.titleEs ?? null, b.titleEn ?? null, b.descEs ?? null, b.descEn ?? null,
        b.uploader ?? null, b.precio ?? null,
        b.tags !== undefined ? splitTags(b.tags) : null,
        pack.id,
      ]
    );

    const packUrl = `${env.frontendUrl.replace(/\/+$/, '')}/packs/${pack.public_id}/descargar`;
    await query('UPDATE packs SET download = $1 WHERE id = $2', [packUrl, pack.id]);

    await publishEvent('pack_updated', { id: pack.id });
    res.json({ ok: true, pack: rows[0] });
  } catch (e) { next(e); }
});

// POST /api/packs/:publicId/restore  (Bearer)
r.post('/:publicId/restore', authRequired, async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    await query('UPDATE packs SET activo = TRUE, updated_at = NOW() WHERE id = $1', [pack.id]);
    await publishEvent('pack_restored', { id: pack.id });
    res.json({ ok: true, id: pack.public_id });
  } catch (e) { next(e); }
});

// DELETE /api/packs/:publicId  (Bearer) — papelera
r.delete('/:publicId', authRequired, async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    await query('UPDATE packs SET activo = FALSE, updated_at = NOW() WHERE id = $1', [pack.id]);
    await publishEvent('pack_trashed', { id: pack.id });
    res.json({ ok: true, id: pack.public_id, trashed: true });
  } catch (e) { next(e); }
});

// DELETE /api/packs/:publicId/permanent  (Bearer) — borra BD + carpeta
r.delete('/:publicId/permanent', authRequired, async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    removePackFolder(pack.thumb);
    if (!pack.thumb) {
      const m = await query('SELECT src FROM pack_media WHERE pack_id = $1 LIMIT 1', [pack.id]);
      if (m.rows[0]) removePackFolder(m.rows[0].src);
    }
    await query('DELETE FROM packs WHERE id = $1', [pack.id]);
    await publishEvent('pack_deleted', { id: pack.id });
    res.json({ ok: true, id: pack.public_id, permanent: true });
  } catch (e) { next(e); }
});

// ============================================================
// Interacciones
// ============================================================
async function packStats(packId, userKey) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM pack_likes WHERE pack_id = $1 AND tipo = 'like')    AS likes,
       (SELECT COUNT(*)::int FROM pack_likes WHERE pack_id = $1 AND tipo = 'dislike') AS dislikes,
       (SELECT COUNT(*)::int FROM pack_saves WHERE pack_id = $1)                      AS guardados,
       (SELECT COALESCE(vistas,0)     FROM packs WHERE id = $1)                       AS views,
       (SELECT COALESCE(descargas,0)  FROM packs WHERE id = $1)                       AS downloads`,
    [packId]
  );
  const s = rows[0] || { likes: 0, dislikes: 0, guardados: 0, views: 0, downloads: 0 };
  let myVote = null, saved = false;
  if (userKey) {
    const v = await query('SELECT tipo FROM pack_likes WHERE pack_id = $1 AND user_key = $2', [packId, userKey]);
    myVote = v.rows[0]?.tipo || null;
    const sv = await query('SELECT 1 FROM pack_saves WHERE pack_id = $1 AND user_key = $2', [packId, userKey]);
    saved = !!sv.rows[0];
  }
  return { packId, ...s, myVote, saved };
}

r.get('/:publicId/interactions', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    res.json(await packStats(pack.id, req.query.userKey));
  } catch (e) { next(e); }
});

r.post('/:publicId/like', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey, tipo } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    if (tipo === 'like' || tipo === 'dislike') {
      await query(
        `INSERT INTO pack_likes (pack_id, user_key, tipo) VALUES ($1, $2, $3)
         ON CONFLICT (pack_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [pack.id, userKey, tipo]
      );
    } else {
      await query('DELETE FROM pack_likes WHERE pack_id = $1 AND user_key = $2', [pack.id, userKey]);
    }
    await query(
      `UPDATE packs SET
         likes    = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = $1 AND tipo = 'like'),
         dislikes = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = $1 AND tipo = 'dislike')
       WHERE id = $1`,
      [pack.id]
    );
    await cacheDel('cache:stats');
    await publishEvent('pack_like', { id: pack.id });
    res.json(await packStats(pack.id, userKey));
  } catch (e) { next(e); }
});

r.post('/:publicId/save', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    const cur = await query('SELECT 1 FROM pack_saves WHERE pack_id = $1 AND user_key = $2', [pack.id, userKey]);
    if (cur.rows[0]) await query('DELETE FROM pack_saves WHERE pack_id = $1 AND user_key = $2', [pack.id, userKey]);
    else await query('INSERT INTO pack_saves (pack_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [pack.id, userKey]);

    await query('UPDATE packs SET guardados = (SELECT COUNT(*) FROM pack_saves WHERE pack_id = $1) WHERE id = $1', [pack.id]);
    await publishEvent('pack_save', { id: pack.id });
    res.json(await packStats(pack.id, userKey));
  } catch (e) { next(e); }
});

r.post('/:publicId/share', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey, red } = req.body || {};
    await query('INSERT INTO pack_shares (pack_id, user_key, red) VALUES ($1, $2, $3)', [pack.id, userKey || null, red || null]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/packs/:publicId/view  { userKey }  (cuenta al abrir el pack; anónimos ok).
// Sin límite: cada apertura cuenta. Evento SSE liviano {id, views} para que
// TODOS parchen el contador al instante en local (sin recargar nada).
r.post('/:publicId/view', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const upd = await query('UPDATE packs SET vistas = COALESCE(vistas, 0) + 1 WHERE id = $1 RETURNING vistas', [pack.id]);
    await cacheDel('cache:stats');
    res.json({ ok: true, vistas: upd.rows[0].vistas });
    try { await publishEvent('pack_view', { id: pack.id, views: upd.rows[0].vistas }); } catch { /* opcional */ }
  } catch (e) { next(e); }
});

// POST /api/packs/:publicId/download   { userKey }   (solo cuenta)
r.post('/:publicId/download', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const { userKey } = req.body || {};
    await query('INSERT INTO pack_downloads (pack_id, user_key) VALUES ($1, $2)', [pack.id, userKey || null]);
    const upd = await query('UPDATE packs SET descargas = COALESCE(descargas, 0) + 1 WHERE id = $1 RETURNING descargas', [pack.id]);

    await cacheDel('cache:stats');
    await publishEvent('pack_download', { id: pack.id });
    res.json({ ok: true, descargas: upd.rows[0].descargas });
  } catch (e) { next(e); }
});

// ============================================================
// Descargas: token, listado de archivos, archivo y ZIP
// ============================================================
const IMG_QUAL_RE = /\/calidades\/[^/]+$/;

function publicToAbs(url) {
  return path.resolve(MEDIA_DIR, String(url || '').replace(/^\/media\//, ''));
}

/** Carpeta real del pack (usa pack_dir; si no, la busca por el id). */
function resolvePackRoot(pack) {
  if (pack.pack_dir) {
    const p = path.resolve(MEDIA_DIR, pack.pack_dir);
    if (fs.existsSync(p)) return p;
  }
  try {
    const pad = String(pack.id).padStart(2, '0');
    const dirs = fs.readdirSync(packRootDir(), { withFileTypes: true });
    const found = dirs.find((d) => d.isDirectory() && d.name.endsWith(`_${pad}`));
    if (found) return path.join(packRootDir(), found.name);
  } catch { /* sin carpeta */ }
  return path.resolve(MEDIA_DIR, 'packs');
}

function safeName(s) {
  return String(s || 'pack')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'pack';
}

async function listPackMedia(packId) {
  const { rows } = await query(
    `SELECT id, tipo, src, thumb, orden, renditions, duracion
       FROM pack_media WHERE pack_id = $1 ORDER BY tipo, orden ASC, id ASC`,
    [packId]
  );
  const fotos = [];
  const videos = [];
  for (const m of rows) {
    const rends = Array.isArray(m.renditions) ? m.renditions : [];
    if (m.tipo === 'foto') {
      const base = String(m.src || '').replace(IMG_QUAL_RE, '');
      const variants = rends.map((x) => ({ label: x.label, url: `${base}/${x.file}`, width: x.width || 0 }));
      fotos.push({ id: m.id, src: m.src, thumb: m.thumb || m.src, variants });
    } else {
      const sorted = [...rends].sort((a, b) => (b.height || 0) - (a.height || 0));
      videos.push({
        id: m.id,
        src: sorted[0]?.src || m.src,
        thumb: m.thumb,
        duracion: m.duracion,
        variants: sorted.map((x) => ({ label: x.label, url: x.src, height: x.height || 0 })),
      });
    }
  }
  return { fotos, videos };
}

// POST /api/packs/:publicId/download-token   { userKey, current? }
r.post('/:publicId/download-token', async (req, res, next) => {
  try {
    const ip = clientIp(req);
    const rl = await rateLimit(`rl:pktoken:${ip}`, 120, 3600);
    if (!rl.allowed) return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento.' });

    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const userKey = String(req.body?.userKey || req.query.userKey || '').trim();
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    // reutiliza el token válido que ya tenga el cliente
    const current = String(req.body?.current || '').trim();
    if (current) {
      const { rows } = await query(
        `SELECT expires_at FROM pack_download_tokens
          WHERE pack_id = $1 AND user_key = $2 AND token_hash = $3 AND expires_at > NOW() LIMIT 1`,
        [pack.id, userKey, sha256(current)]
      );
      if (rows[0]) return res.json({ ok: true, token: current, expiresAt: rows[0].expires_at, reused: true });
    }

    // genera uno nuevo (se guarda solo el hash) y reemplaza el anterior
    const raw = crypto.randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

    await query(
      `INSERT INTO pack_download_tokens (pack_id, user_key, token_hash, expires_at, ip)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pack_id, user_key) DO UPDATE
         SET token_hash = EXCLUDED.token_hash,
             expires_at = EXCLUDED.expires_at,
             created_at = NOW(),
             ip = EXCLUDED.ip`,
      [pack.id, userKey, sha256(raw), expires, ip]
    );
    // limpia tokens expirados (mantiene la tabla chica)
    await query('DELETE FROM pack_download_tokens WHERE expires_at < NOW()');

    res.json({ ok: true, token: raw, expiresAt: expires });
  } catch (e) { next(e); }
});

// GET /api/packs/:publicId/files
r.get('/:publicId/files', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });
    const data = await listPackMedia(pack.id);
    res.json({
      pack: {
        id: pack.id,
        public_id: pack.public_id,
        slug: pack.slug,
        title: pack.titulo_es || pack.titulo_en || pack.titulo,
        titulo_es: pack.titulo_es,
        titulo_en: pack.titulo_en,
        desc_es: pack.desc_es,
        desc_en: pack.desc_en,
        uploader: pack.uploader,
        thumb: pack.thumb,
      },
      ...data,
    });
  } catch (e) { next(e); }
});

// GET /api/packs/:publicId/file?u=...&t=...   (exige token, fuerza descarga)
r.get('/:publicId/file', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const ip = clientIp(req);
    const userKey = String(req.query.userKey || '').trim();
    const rlIp = await rateLimit(`rl:pkdl:${ip}`, 300, 3600);
    const rlUser = userKey ? await rateLimit(`rl:pkdl:u:${userKey}`, 300, 3600) : { allowed: true };
    if (!rlIp.allowed || !rlUser.allowed) return res.status(429).json({ error: 'Demasiadas descargas. Intenta más tarde.' });

    if (!(await hasValidToken(req, pack))) {
      return res.status(401).json({ error: 'Token inválido o expirado', code: 'invalid_token' });
    }

    const u = String(req.query.u || '');
    if (!u.startsWith('/media/')) return res.status(400).json({ error: 'Archivo inválido' });
    const abs = publicToAbs(u);
    const root = resolvePackRoot(pack);
    if (!abs.startsWith(root + path.sep)) return res.status(403).json({ error: 'No permitido' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(abs).size));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(abs)}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (e) { next(e); }
});

// GET /api/packs/:publicId/zip/:tipo?   (tipo = all|fotos|videos)   (exige token)
r.get('/:publicId/zip/:tipo?', async (req, res, next) => {
  try {
    const pack = await getPackByPublic(req.params.publicId);
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const ip = clientIp(req);
    const userKey = String(req.query.userKey || '').trim();
    const rlIp = await rateLimit(`rl:pkzip:${ip}`, 60, 3600);
    const rlUser = userKey ? await rateLimit(`rl:pkzip:u:${userKey}`, 60, 3600) : { allowed: true };
    if (!rlIp.allowed || !rlUser.allowed) return res.status(429).json({ error: 'Demasiadas descargas. Intenta más tarde.' });

    if (!(await hasValidToken(req, pack))) {
      return res.status(401).json({ error: 'Token inválido o expirado', code: 'invalid_token' });
    }

    const tipo = String(req.params.tipo || req.query.tipo || 'all');
    const { fotos, videos } = await listPackMedia(pack.id);
    const folder = safeName(pack.slug || `pack-${pack.id}`);
    const entries = [];

    if (tipo !== 'videos') {
      fotos.forEach((f, i) => entries.push({
        path: publicToAbs(f.src),
        name: `${folder}/fotos/foto_${String(i + 1).padStart(2, '0')}${path.extname(String(f.src).split('?')[0]) || '.jpg'}`,
      }));
    }
    if (tipo !== 'fotos') {
      videos.forEach((v, i) => entries.push({
        path: publicToAbs(v.src),
        name: `${folder}/videos/video_${String(i + 1).padStart(2, '0')}${path.extname(String(v.src).split('?')[0]) || '.mp4'}`,
      }));
    }

    if (!entries.length) return res.status(404).json({ error: 'Este pack no tiene archivos' });

    const valid = entries.filter((e) => {
      try { return fs.statSync(e.path).isFile(); } catch { return false; }
    });
    if (!valid.length) return res.status(404).json({ error: 'Este pack no tiene archivos' });

    let total = 22;
    for (const e of valid) {
      const size = fs.statSync(e.path).size;
      const nameLen = Buffer.byteLength(e.name, 'utf8');
      total += 30 + nameLen + size + 16 + 46 + nameLen;
    }

    await query('INSERT INTO pack_downloads (pack_id, user_key) VALUES ($1, $2)', [pack.id, userKey || null]);
    await query('UPDATE packs SET descargas = COALESCE(descargas, 0) + 1 WHERE id = $1', [pack.id]);
    await cacheDel('cache:stats');
    await publishEvent('pack_download', { id: pack.id });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(total));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="pikantepe-${folder}-${tipo}.zip"`);
    createZipStream(valid).pipe(res);
  } catch (e) { next(e); }
});

export default r;
