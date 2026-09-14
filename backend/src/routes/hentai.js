import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import {
  upload, MEDIA_DIR, publicOf, moveFileSync,
  hentaiRootDir, hentaiSerieFolder, hentaiCapFolder,
} from '../services/upload.js';
import { transcodeVideo, hasFFmpeg, fmtDuration, probe } from '../services/transcode.js';
import { slugify, channelSlug } from '../utils/slug.js';

const r = Router();

function splitTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
}

async function getSerie(id) {
  const { rows } = await query('SELECT * FROM hentai WHERE id = $1', [id]);
  return rows[0] || null;
}

async function ensureChannel(nombre) {
  const name = String(nombre || '').trim();
  if (!name) return;
  await query(
    `INSERT INTO channels (nombre, slug) VALUES ($1, $2)
     ON CONFLICT (nombre) DO UPDATE SET slug = COALESCE(channels.slug, EXCLUDED.slug)`,
    [name, channelSlug(name)]
  );
}

function serieDir(serie) {
  return path.join(hentaiRootDir(), hentaiSerieFolder(serie.slug, serie.id));
}

/** Transcodifica en segundo plano el capítulo y actualiza la BD. */
async function finishTranscode({ capId, origPath, destDir }) {
  try {
    if (!hasFFmpeg) return;
    const { renditions, poster, duration } = await transcodeVideo({ inputPath: origPath, destDir });
    const rel = path.relative(MEDIA_DIR, destDir).replace(/\\/g, '/');
    const list = renditions.map((x) => ({ label: x.label, height: x.height, src: `/media/${rel}/${x.file}` }));
    const def = list.find((x) => x.label === '720p') || list[0] || null;

    const thumbsDir = path.join(destDir, 'thumbs');
    let cover = null;
    try { cover = fs.readdirSync(thumbsDir).find((f) => f.startsWith('cover.')) || null; } catch { /* sin thumbs */ }
    const thumb = poster && !cover ? `/media/${rel}/thumbs/poster.jpg` : null;

    await query(
      `UPDATE hentai_capitulos SET
         src = COALESCE($1, src), thumb = COALESCE($2, thumb),
         renditions = $3::jsonb, duracion = $4, updated_at = NOW()
       WHERE id = $5`,
      [def?.src || null, thumb, JSON.stringify(list), fmtDuration(duration), capId]
    );
    fs.rm(origPath, { force: true }, () => {});
    await cacheDel('cache:stats');
    await publishEvent('hentai_updated', { id: capId });
    console.log(`[hentai] capítulo #${capId} listo: ${list.map((x) => x.label).join(', ')}`);
  } catch (err) {
    console.error(`[hentai] transcode capítulo #${capId} falló:`, err.message);
  }
}

// ============================================================
// PÚBLICO
// ============================================================

// GET /api/hentai  -> series con su nº de capítulos
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT h.id, h.slug, h.titulo_es, h.titulo_en, h.desc_es, h.desc_en, h.canal,
              h.thumb, h.cover, h.vistas, h.tags, h.created_at,
              (SELECT COUNT(*)::int FROM hentai_capitulos c WHERE c.hentai_id = h.id AND c.activo = TRUE) AS capitulos
         FROM hentai h
        WHERE h.activo = TRUE
        ORDER BY h.id DESC
        LIMIT 300`
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

// GET /api/hentai/:id  -> serie + capítulos
r.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Hentai no encontrado' });
    const serie = await getSerie(id);
    if (!serie || !serie.activo) return res.status(404).json({ error: 'Hentai no encontrado' });

    const caps = await query(
      `SELECT id, numero, titulo_es, titulo_en, desc_es, desc_en, src, thumb, duracion, renditions, vistas, created_at
         FROM hentai_capitulos
        WHERE hentai_id = $1 AND activo = TRUE
        ORDER BY numero ASC, id ASC`,
      [id]
    );
    res.json({ ...serie, capitulos: caps.rows });
  } catch (e) { next(e); }
});

// ============================================================
// ADMIN (Bearer)
// ============================================================

// GET /api/hentai/admin/list  -> todas las series (incluye inactivas) + nº capítulos
r.get('/admin/list', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT h.*, (SELECT COUNT(*)::int FROM hentai_capitulos c WHERE c.hentai_id = h.id AND c.activo = TRUE) AS capitulos
         FROM hentai h
        ORDER BY h.id DESC
        LIMIT 300`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/hentai  { titulo_es, titulo_en, desc_es, desc_en, canal, tags }
r.post('/', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const titulo = String(b.titulo_es || b.titulo_en || '').trim();
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    const canal = String(b.canal || 'administrador pikante.pe').trim().slice(0, 120);

    const ins = await query(
      `INSERT INTO hentai (slug, titulo_es, titulo_en, desc_es, desc_en, canal, tags)
       VALUES ('tmp-' || gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        titulo,
        String(b.titulo_en || titulo).trim(),
        String(b.desc_es || '').trim(),
        String(b.desc_en || b.desc_es || '').trim(),
        canal,
        splitTags(b.tags),
      ]
    );
    const id = ins.rows[0].id;
    const slug = `${slugify(titulo) || 'anime'}-${id}`;
    await query('UPDATE hentai SET slug = $2 WHERE id = $1', [id, slug]);
    await ensureChannel(canal);

    await publishEvent('hentai_created', { id });
    const serie = await getSerie(id);
    res.status(201).json({ ok: true, serie });
  } catch (e) { next(e); }
});

// PUT /api/hentai/:id
r.put('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const serie = await getSerie(id);
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });
    const b = req.body || {};

    await query(
      `UPDATE hentai SET
         titulo_es = COALESCE($2, titulo_es),
         titulo_en = COALESCE($3, titulo_en),
         desc_es   = COALESCE($4, desc_es),
         desc_en   = COALESCE($5, desc_en),
         canal     = COALESCE($6, canal),
         tags      = COALESCE($7, tags),
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        b.titulo_es ?? null,
        b.titulo_en ?? null,
        b.desc_es ?? null,
        b.desc_en ?? null,
        b.canal ? String(b.canal).trim().slice(0, 120) : null,
        b.tags !== undefined ? splitTags(b.tags) : null,
      ]
    );
    if (b.canal) await ensureChannel(b.canal);

    await publishEvent('hentai_updated', { id });
    res.json({ ok: true, serie: await getSerie(id) });
  } catch (e) { next(e); }
});

// DELETE /api/hentai/:id  (lógico)
r.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      'UPDATE hentai SET activo = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Hentai no encontrado' });
    await publishEvent('hentai_deleted', { id });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

// POST /api/hentai/:id/cover  (multipart: thumb)
r.post('/:id/cover', authRequired, upload.single('thumb'), async (req, res, next) => {
  try {
    const serie = await getSerie(Number(req.params.id));
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Adjunta la portada' });

    const dir = path.join(serieDir(serie), 'thumbs');
    fs.mkdirSync(dir, { recursive: true });
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const target = path.join(dir, `cover${ext}`);
    moveFileSync(file.path, target);
    const cover = publicOf(target);

    await query('UPDATE hentai SET cover = $2, thumb = COALESCE(thumb, $2), updated_at = NOW() WHERE id = $1', [serie.id, cover]);
    await publishEvent('hentai_updated', { id: serie.id });
    res.json({ ok: true, cover, serie: await getSerie(serie.id) });
  } catch (e) { next(e); }
});

// POST /api/hentai/:id/capitulos  (multipart: video, thumb)  { numero, titulo_es, titulo_en, desc_es, desc_en }
r.post('/:id/capitulos', authRequired, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), async (req, res, next) => {
  try {
    const serie = await getSerie(Number(req.params.id));
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });
    const videoFile = req.files?.video?.[0];
    if (!videoFile) return res.status(400).json({ error: 'Falta el archivo de video' });

    const b = req.body || {};
    let numero = Math.max(1, Number(b.numero) || 0);
    if (!numero) {
      const n = await query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM hentai_capitulos WHERE hentai_id = $1', [serie.id]);
      numero = n.rows[0].n;
    }
    const dup = await query('SELECT id FROM hentai_capitulos WHERE hentai_id = $1 AND numero = $2', [serie.id, numero]);
    if (dup.rows[0]) return res.status(409).json({ error: `Ya existe el capítulo ${numero}` });

    const ins = await query(
      `INSERT INTO hentai_capitulos (hentai_id, numero, titulo_es, titulo_en, desc_es, desc_en)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        serie.id,
        numero,
        b.titulo_es ? String(b.titulo_es).trim().slice(0, 200) : null,
        b.titulo_en ? String(b.titulo_en).trim().slice(0, 200) : null,
        b.desc_es ? String(b.desc_es).trim() : null,
        b.desc_en ? String(b.desc_en).trim() : null,
      ]
    );
    const capId = ins.rows[0].id;

    // carpeta: hentai/<serie>/cap_XX/
    const destDir = path.join(serieDir(serie), hentaiCapFolder(numero));
    fs.mkdirSync(destDir, { recursive: true });

    const ext = (path.extname(videoFile.filename) || path.extname(videoFile.originalname) || '.mp4').toLowerCase();
    const origPath = path.join(destDir, `original${/\.(mp4|mov|webm|mkv|avi)$/i.test(ext) ? ext : '.mp4'}`);
    moveFileSync(videoFile.path, origPath);
    const src = publicOf(origPath);

    // duración (ffprobe) y portada propia del capítulo
    try {
      const info = await probe(origPath);
      if (info?.duration) await query('UPDATE hentai_capitulos SET duracion = $1 WHERE id = $2', [fmtDuration(info.duration), capId]);
    } catch { /* sin ffprobe */ }

    let thumb = null;
    const thumbFile = req.files?.thumb?.[0];
    if (thumbFile) {
      const tdir = path.join(destDir, 'thumbs');
      fs.mkdirSync(tdir, { recursive: true });
      const text = (path.extname(thumbFile.filename) || '.jpg').toLowerCase();
      const target = path.join(tdir, `cover${text}`);
      moveFileSync(thumbFile.path, target);
      thumb = publicOf(target);
    }

    await query('UPDATE hentai_capitulos SET src = $1, thumb = $2 WHERE id = $3', [src, thumb, capId]);
    // portada de la serie si aún no tiene
    if (!serie.thumb) {
      await query('UPDATE hentai SET thumb = COALESCE(thumb, $2) WHERE id = $1', [serie.id, thumb || src]);
    }

    await cacheDel('cache:stats');
    await publishEvent('hentai_updated', { id: serie.id });

    const cap = await query('SELECT * FROM hentai_capitulos WHERE id = $1', [capId]);
    res.status(201).json({ ok: true, capitulo: cap.rows[0], processing: hasFFmpeg });

    finishTranscode({ capId, origPath, destDir });
  } catch (e) { next(e); }
});

// DELETE /api/hentai/capitulos/:capId  (lógico)
r.delete('/capitulos/:capId', authRequired, async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    const { rows } = await query(
      'UPDATE hentai_capitulos SET activo = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
      [capId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });
    await publishEvent('hentai_updated', { id: capId });
    res.json({ ok: true, id: capId });
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/view
r.post('/capitulos/:capId/view', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(400).json({ error: 'Capítulo inválido' });
    await query('UPDATE hentai_capitulos SET vistas = COALESCE(vistas, 0) + 1 WHERE id = $1', [capId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
