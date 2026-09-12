import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db/pool.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { authRequired } from '../middleware/auth.js';
import { slugify } from '../utils/slug.js';
import {
  MEDIA_DIR, publicOf, packUpload, packFolderName, packRootDir, removePackFolder, moveFileSync,
} from '../services/upload.js';
import { hasFFmpeg, transcodeVideo, transcodeImage, fmtDuration } from '../services/transcode.js';

const r = Router();

function splitTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40);
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

    const where = [papelera ? 'activo = FALSE' : 'activo = TRUE'];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(COALESCE(titulo_es, titulo) ILIKE $${params.length}
                OR COALESCE(titulo_en, titulo) ILIKE $${params.length}
                OR uploader ILIKE $${params.length})`);
    }
    const base = `FROM packs WHERE ${where.join(' AND ')}`;

    const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
    const { rows } = await query(
      `SELECT * ${base} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: rows, total: countRes.rows[0].total, page, limit });
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
      const download = String(b.download || '#').trim();
      const tags = splitTags(b.tags);
      const slugBase = slugify(titleEs) || 'pack';

      const ins = await query(
        `INSERT INTO packs (titulo_es, titulo_en, desc_es, desc_en, uploader, precio, download, tags, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, TRUE)
         RETURNING id`,
        [titleEs, titleEn, String(b.descEs || '').trim(), String(b.descEn || '').trim(), uploader, precio, download, tags]
      );
      const id = ins.rows[0].id;
      const slug = `${slugBase}-${id}`;
      await query('UPDATE packs SET slug = $1 WHERE id = $2', [slug, id]);

      const folderName = packFolderName(slugBase, id);
      const packDir = path.join(packRootDir(), folderName);
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

// GET /api/packs/:id   (detalle + galería)
r.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM packs WHERE id = $1', [req.params.id]);
    const pack = rows[0];
    if (!pack) return res.status(404).json({ error: 'Pack no encontrado' });

    const media = await query(
      `SELECT id, tipo, src, thumb, orden, renditions, duracion
         FROM pack_media WHERE pack_id = $1 ORDER BY tipo, orden ASC, id ASC`,
      [pack.id]
    );
    res.json({ ...pack, media: media.rows });
  } catch (e) { next(e); }
});

// PUT /api/packs/:id  (Bearer) — edita metadata
r.put('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE packs SET
         titulo_es = COALESCE($1, titulo_es),
         titulo_en = COALESCE($2, titulo_en),
         desc_es   = COALESCE($3, desc_es),
         desc_en   = COALESCE($4, desc_en),
         uploader  = COALESCE($5, uploader),
         precio    = COALESCE($6, precio),
         download  = COALESCE($7, download),
         tags      = COALESCE($8, tags),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        b.titleEs ?? null, b.titleEn ?? null, b.descEs ?? null, b.descEn ?? null,
        b.uploader ?? null, b.precio ?? null, b.download ?? null,
        b.tags !== undefined ? splitTags(b.tags) : null,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    await publishEvent('pack_updated', { id });
    res.json({ ok: true, pack: rows[0] });
  } catch (e) { next(e); }
});

// POST /api/packs/:id/restore  (Bearer)
r.post('/:id/restore', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE packs SET activo = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    await publishEvent('pack_restored', { id: req.params.id });
    res.json({ ok: true, id: req.params.id });
  } catch (e) { next(e); }
});

// DELETE /api/packs/:id  (Bearer) — papelera
r.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query('UPDATE packs SET activo = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    await publishEvent('pack_trashed', { id: req.params.id });
    res.json({ ok: true, id: req.params.id, trashed: true });
  } catch (e) { next(e); }
});

// DELETE /api/packs/:id/permanent  (Bearer) — borra BD + carpeta
r.delete('/:id/permanent', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, thumb FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    removePackFolder(rows[0].thumb);
    // busca cualquier media para ubicar la carpeta si no había thumb
    if (!rows[0].thumb) {
      const m = await query('SELECT src FROM pack_media WHERE pack_id = $1 LIMIT 1', [req.params.id]);
      if (m.rows[0]) removePackFolder(m.rows[0].src);
    }
    await query('DELETE FROM packs WHERE id = $1', [req.params.id]);
    await publishEvent('pack_deleted', { id: req.params.id });
    res.json({ ok: true, id: req.params.id, permanent: true });
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

r.get('/:id/interactions', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    res.json(await packStats(req.params.id, req.query.userKey));
  } catch (e) { next(e); }
});

r.post('/:id/like', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey, tipo } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    if (tipo === 'like' || tipo === 'dislike') {
      await query(
        `INSERT INTO pack_likes (pack_id, user_key, tipo) VALUES ($1, $2, $3)
         ON CONFLICT (pack_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [rows[0].id, userKey, tipo]
      );
    } else {
      await query('DELETE FROM pack_likes WHERE pack_id = $1 AND user_key = $2', [rows[0].id, userKey]);
    }
    await query(
      `UPDATE packs SET
         likes    = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = $1 AND tipo = 'like'),
         dislikes = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = $1 AND tipo = 'dislike')
       WHERE id = $1`,
      [rows[0].id]
    );
    await cacheDel('cache:stats');
    await publishEvent('pack_like', { id: rows[0].id });
    res.json(await packStats(rows[0].id, userKey));
  } catch (e) { next(e); }
});

r.post('/:id/save', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    const cur = await query('SELECT 1 FROM pack_saves WHERE pack_id = $1 AND user_key = $2', [rows[0].id, userKey]);
    if (cur.rows[0]) await query('DELETE FROM pack_saves WHERE pack_id = $1 AND user_key = $2', [rows[0].id, userKey]);
    else await query('INSERT INTO pack_saves (pack_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, userKey]);

    await query('UPDATE packs SET guardados = (SELECT COUNT(*) FROM pack_saves WHERE pack_id = $1) WHERE id = $1', [rows[0].id]);
    await publishEvent('pack_save', { id: rows[0].id });
    res.json(await packStats(rows[0].id, userKey));
  } catch (e) { next(e); }
});

r.post('/:id/share', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    const { userKey, red } = req.body || {};
    await query('INSERT INTO pack_shares (pack_id, user_key, red) VALUES ($1, $2, $3)', [rows[0].id, userKey || null, red || null]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/packs/:id/view   (suma una vista)
r.post('/:id/view', async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE packs SET vistas = COALESCE(vistas, 0) + 1 WHERE id = $1 RETURNING vistas',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });
    res.json({ ok: true, vistas: rows[0].vistas });
  } catch (e) { next(e); }
});

// POST /api/packs/:id/download   { userKey }
r.post('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM packs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pack no encontrado' });

    const { userKey } = req.body || {};
    await query('INSERT INTO pack_downloads (pack_id, user_key) VALUES ($1, $2)', [rows[0].id, userKey || null]);
    const upd = await query(
      'UPDATE packs SET descargas = COALESCE(descargas, 0) + 1 WHERE id = $1 RETURNING descargas',
      [rows[0].id]
    );

    await cacheDel('cache:stats');
    await publishEvent('pack_download', { id: rows[0].id });
    res.json({ ok: true, descargas: upd.rows[0].descargas });
  } catch (e) { next(e); }
});

export default r;
