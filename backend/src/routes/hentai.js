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

const MODOS = ['sub', 'es', 'en', 'en_sub'];

function splitTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 120);
}

/** Títulos extras: acepta array o texto separado por comas / saltos de línea. */
function splitTitles(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[\n,]+/);
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 80);
}

function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function getSerie(id) {
  const { rows } = await query('SELECT * FROM hentai WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Metadatos por modo: { sub: {...}, es: {...}, en: {...}, en_sub: {...} } */
async function getModos(hentaiId) {
  const { rows } = await query(
    `SELECT modo, titulo, titulo_alt, titulos_extras, descripcion, tags, tipo, anio, temporada, estado
       FROM hentai_modos WHERE hentai_id = $1`,
    [hentaiId]
  );
  const out = {};
  for (const r of rows) out[r.modo] = r;
  return out;
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

/** Guarda los tags usados en el catálogo propio de hentai (para sugerirlos). */
async function saveHentaiTags(tags) {
  for (const name of splitTags(tags)) {
    const slug = slugify(name) || name.toLowerCase().slice(0, 60);
    await query(
      'INSERT INTO hentai_tags (nombre, slug) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING',
      [name.slice(0, 60), slug]
    );
  }
}

function serieDir(serie) {
  return path.join(hentaiRootDir(), hentaiSerieFolder(serie.slug, serie.id));
}

/** Transcodifica en segundo plano una fuente (modo) y actualiza la BD. */
async function finishTranscode({ fuenteId, origPath, destDir }) {
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
      `UPDATE hentai_capitulo_fuentes SET
         src = COALESCE($1, src), thumb = COALESCE($2, thumb),
         renditions = $3::jsonb, duracion = $4
       WHERE id = $5`,
      [def?.src || null, thumb, JSON.stringify(list), fmtDuration(duration), fuenteId]
    );
    fs.rm(origPath, { force: true }, () => {});
    await cacheDel('cache:stats');
    await publishEvent('hentai_updated', { id: fuenteId });
    console.log(`[hentai] fuente #${fuenteId} lista: ${list.map((x) => x.label).join(', ')}`);
  } catch (err) {
    console.error(`[hentai] transcode fuente #${fuenteId} falló:`, err.message);
  }
}

// ============================================================
// PÚBLICO
// ============================================================

// GET /api/hentai  -> series con su nº de capítulos
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT h.id, h.slug, h.titulo_es, h.titulo_en, h.titulo_ja, h.titulo_romaji, h.desc_es, h.desc_en, h.canal,
              h.thumb, h.cover, h.vistas, h.tags, h.tipo, h.anio, h.temporada, h.estado,
              h.rating, h.votos, h.created_at,
              (SELECT COUNT(*)::int FROM hentai_capitulos c WHERE c.hentai_id = h.id AND c.activo = TRUE) AS capitulos
         FROM hentai h
        WHERE h.activo = TRUE
        ORDER BY h.id DESC
        LIMIT 300`
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

// GET /api/hentai/tags  -> tags propios del hentai
r.get('/tags', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT nombre FROM hentai_tags ORDER BY nombre ASC');
    res.json({ data: rows.map((t) => t.nombre) });
  } catch (e) { next(e); }
});

// GET /api/hentai/:id  -> serie + capítulos (acepta id numérico o slug)
r.get('/:id', async (req, res, next) => {
  try {
    const param = String(req.params.id || '').trim();
    const num = Number(param);
    const serie = (Number.isInteger(num) && num > 0)
      ? await getSerie(num)
      : (await query('SELECT * FROM hentai WHERE slug = $1 LIMIT 1', [param])).rows[0];
    if (!serie || !serie.activo) return res.status(404).json({ error: 'Hentai no encontrado' });
    const id = serie.id;

    const caps = await query(
      `SELECT c.id, c.numero, c.titulo_es, c.titulo_en, c.desc_es, c.desc_en, c.vistas, c.created_at,
              (SELECT COALESCE(json_agg(json_build_object(
                        'id', f.id, 'modo', f.modo, 'src', f.src,
                        'thumb', f.thumb, 'duracion', f.duracion, 'renditions', f.renditions)
                      ORDER BY f.modo), '[]'::json)
                 FROM hentai_capitulo_fuentes f
                WHERE f.capitulo_id = c.id AND f.activo = TRUE) AS fuentes
         FROM hentai_capitulos c
        WHERE c.hentai_id = $1 AND c.activo = TRUE
        ORDER BY c.numero ASC, c.id ASC`,
      [id]
    );
    res.json({ ...serie, capitulos: caps.rows, modos: await getModos(id) });
  } catch (e) { next(e); }
});

// ============================================================
// ADMIN (Bearer)
// ============================================================

// GET /api/hentai/admin/list?q=&page=&limit=&papelera=
r.get('/admin/list', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const q = String(req.query.q || '').trim().toLowerCase();
    const papelera = String(req.query.papelera) === 'true';

    const params = [];
    let where = papelera ? 'h.activo = FALSE' : 'h.activo = TRUE';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (lower(h.titulo_es) LIKE $${params.length}
                 OR lower(COALESCE(h.titulo_en,'')) LIKE $${params.length}
                 OR lower(COALESCE(h.titulo_ja,'')) LIKE $${params.length}
                 OR lower(COALESCE(h.titulo_romaji,'')) LIKE $${params.length}
                 OR lower(COALESCE(h.canal,'')) LIKE $${params.length})`;
    }

    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM hentai h WHERE ${where}`, params);
    const { rows } = await query(
      `SELECT h.*, (SELECT COUNT(*)::int FROM hentai_capitulos c WHERE c.hentai_id = h.id AND c.activo = TRUE) AS capitulos
         FROM hentai h
        WHERE ${where}
        ORDER BY h.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const total = totalQ.rows[0].n;
    res.json({ data: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// POST /api/hentai
r.post('/', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const titulo = String(b.titulo_es || b.titulo_en || '').trim();
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    const canal = String(b.canal || 'administrador pikante.pe').trim().slice(0, 120);

    const ins = await query(
      `INSERT INTO hentai
         (slug, titulo_es, titulo_en, titulo_ja, titulo_romaji, desc_es, desc_en, canal, tags, titulos_extras, tipo, anio, temporada, estado, rating, votos)
       VALUES ('tmp-' || gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        titulo,
        String(b.titulo_en || titulo).trim(),
        b.titulo_ja ? String(b.titulo_ja).trim().slice(0, 200) : null,
        b.titulo_romaji ? String(b.titulo_romaji).trim().slice(0, 200) : null,
        String(b.desc_es || '').trim(),
        String(b.desc_en || b.desc_es || '').trim(),
        canal,
        splitTags(b.tags),
        splitTitles(b.titulos_extras),
        b.tipo ? String(b.tipo).trim().slice(0, 20) : null,
        intOrNull(b.anio),
        b.temporada ? String(b.temporada).trim().slice(0, 40) : null,
        b.estado ? String(b.estado).trim().slice(0, 30) : 'En emisión',
        Number(b.rating) || 0,
        intOrNull(b.votos) || 0,
      ]
    );
    const id = ins.rows[0].id;
    await query('UPDATE hentai SET slug = $2 WHERE id = $1', [id, `${slugify(titulo) || 'anime'}-${id}`]);
    await ensureChannel(canal);

    // metadatos del modo principal (subtitulado ES)
    await query(
      `INSERT INTO hentai_modos (hentai_id, modo, titulo, titulo_alt, titulos_extras, descripcion, tags, tipo, anio, temporada, estado)
       VALUES ($1, 'sub', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (hentai_id, modo) DO NOTHING`,
      [
        id, titulo,
        [b.titulo_ja, b.titulo_romaji].filter(Boolean).join(' / ') || null,
        splitTitles(b.titulos_extras),
        String(b.desc_es || '').trim() || null,
        splitTags(b.tags),
        b.tipo ? String(b.tipo).trim().slice(0, 20) : null,
        intOrNull(b.anio), b.temporada ? String(b.temporada).trim().slice(0, 40) : null,
        b.estado ? String(b.estado).trim().slice(0, 30) : 'En emisión',
      ]
    );

    await saveHentaiTags(b.tags);
    await publishEvent('hentai_created', { id });
    res.status(201).json({ ok: true, serie: await getSerie(id) });
  } catch (e) { next(e); }
});

// PUT /api/hentai/:id  { modo, titulo, titulo_alt, descripcion, tags, tipo, anio, temporada, estado, canal }
r.put('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const serie = await getSerie(id);
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });
    const b = req.body || {};
    const modo = MODOS.includes(b.modo) ? b.modo : 'sub';

    const titulo = b.titulo !== undefined
      ? (String(b.titulo).trim().slice(0, 200) || null)
      : (b.titulo_es !== undefined ? (String(b.titulo_es).trim().slice(0, 200) || null) : null);
    const tituloAlt = b.titulo_alt !== undefined
      ? (String(b.titulo_alt).trim().slice(0, 200) || null)
      : ([b.titulo_ja, b.titulo_romaji].filter(Boolean).join(' / ') || null);
    const descripcion = b.descripcion !== undefined
      ? (String(b.descripcion).trim() || null)
      : (b.desc_es !== undefined ? (String(b.desc_es).trim() || null) : null);
    const tags = b.tags !== undefined ? splitTags(b.tags) : null;
    const titulosExtras = b.titulos_extras !== undefined ? splitTitles(b.titulos_extras) : null;
    const tipo = b.tipo !== undefined ? (String(b.tipo).trim().slice(0, 20) || null) : null;
    const anio = b.anio !== undefined ? intOrNull(b.anio) : null;
    const temporada = b.temporada !== undefined ? (String(b.temporada).trim().slice(0, 40) || null) : null;
    const estado = b.estado !== undefined ? (String(b.estado).trim().slice(0, 30) || null) : null;

    console.log('[hentai] PUT', id, 'modo=', modo, JSON.stringify({ titulo, tituloAlt, tags, titulosExtras, tipo, anio, temporada, estado, canal: b.canal }));

    await query(
      `INSERT INTO hentai_modos (hentai_id, modo, titulo, titulo_alt, titulos_extras, descripcion, tags, tipo, anio, temporada, estado)
       VALUES ($1, $2, $3, $4, $5::text[], $6, COALESCE($7::text[], '{}'::text[]), $8, $9, $10, COALESCE($11, 'En emisión'))
       ON CONFLICT (hentai_id, modo) DO UPDATE SET
         titulo         = COALESCE($3, hentai_modos.titulo),
         titulo_alt     = COALESCE($4, hentai_modos.titulo_alt),
         titulos_extras = CASE WHEN $5::text[] IS NULL THEN hentai_modos.titulos_extras ELSE $5::text[] END,
         descripcion    = COALESCE($6, hentai_modos.descripcion),
         tags           = CASE WHEN $7::text[] IS NULL THEN hentai_modos.tags ELSE $7::text[] END,
         tipo           = COALESCE($8, hentai_modos.tipo),
         anio           = COALESCE($9, hentai_modos.anio),
         temporada      = COALESCE($10, hentai_modos.temporada),
         estado         = COALESCE($11, hentai_modos.estado)`,
      [id, modo, titulo, tituloAlt, titulosExtras, descripcion, tags, tipo, anio, temporada, estado]
    );

    // base del anime: canal + título para los listados
    const canal = b.canal ? String(b.canal).trim().slice(0, 120) : null;
    await query(
      `UPDATE hentai
          SET canal = COALESCE($2, canal),
              titulo_es = COALESCE($3, titulo_es),
              titulos_extras = CASE WHEN $4::text[] IS NULL THEN titulos_extras ELSE $4::text[] END,
              updated_at = NOW()
        WHERE id = $1`,
      [id, canal, titulo, modo === 'sub' ? titulosExtras : null]
    );
    if (canal) await ensureChannel(canal);
    if (tags) await saveHentaiTags(tags);

    await publishEvent('hentai_updated', { id });
    await cacheDel('cache:stats');
    res.json({ ok: true, serie: await getSerie(id), modos: await getModos(id) });
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

// POST /api/hentai/:id/restore  -> saca de la papelera
r.post('/:id/restore', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      'UPDATE hentai SET activo = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Hentai no encontrado' });
    await publishEvent('hentai_updated', { id });
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

// POST /api/hentai/:id/capitulos  (multipart: video, thumb)
//   fields: numero, modo ('sub'|'es'), titulo_es, titulo_en, desc_es, desc_en
r.post('/:id/capitulos', authRequired, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), async (req, res, next) => {
  try {
    const serie = await getSerie(Number(req.params.id));
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });
    const videoFile = req.files?.video?.[0];
    if (!videoFile) return res.status(400).json({ error: 'Falta el archivo de video' });

    const b = req.body || {};
    const modo = MODOS.includes(b.modo) ? b.modo : 'sub';

    let numero = Math.max(1, intOrNull(b.numero) || 0);
    if (!numero) {
      const n = await query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM hentai_capitulos WHERE hentai_id = $1', [serie.id]);
      numero = n.rows[0].n;
    }

    // ¿Existe el capítulo? (para agregar el otro modo al mismo episodio)
    let cap = (await query('SELECT * FROM hentai_capitulos WHERE hentai_id = $1 AND numero = $2', [serie.id, numero])).rows[0];
    if (!cap) {
    const ins = await query(
      `INSERT INTO hentai_capitulos (hentai_id, numero, titulo_es, titulo_en, desc_es, desc_en)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        serie.id,
        numero,
        (b.titulo_es ? String(b.titulo_es).trim().slice(0, 200) : `${serie.titulo_es || serie.titulo_en || 'Anime'} - Capítulo ${numero}`),
        (b.titulo_en ? String(b.titulo_en).trim().slice(0, 200) : `${serie.titulo_en || serie.titulo_es || 'Anime'} - Episode ${numero}`),
        b.desc_es ? String(b.desc_es).trim() : null,
        b.desc_en ? String(b.desc_en).trim() : null,
      ]
    );
      cap = ins.rows[0];
    } else {
      await query('UPDATE hentai_capitulos SET activo = TRUE, updated_at = NOW() WHERE id = $1', [cap.id]);
    }

    // carpeta: hentai/<serie>/cap_XXX/<modo>/
    const destDir = path.join(serieDir(serie), hentaiCapFolder(numero), modo);
    fs.mkdirSync(destDir, { recursive: true });

    const src = path.join(destDir, `original${/\.(mp4|mov|webm|mkv|avi)$/i.test(path.extname(videoFile.filename) || '') ? path.extname(videoFile.filename).toLowerCase() : '.mp4'}`);
    moveFileSync(videoFile.path, src);

    // thumb del modo
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

    const fuente = await query(
      `INSERT INTO hentai_capitulo_fuentes (capitulo_id, modo, src, thumb, duracion, activo)
       VALUES ($1, $2, $3, $4, '00:00', TRUE)
       ON CONFLICT (capitulo_id, modo) DO UPDATE
         SET src = EXCLUDED.src,
             thumb = COALESCE(EXCLUDED.thumb, hentai_capitulo_fuentes.thumb),
             activo = TRUE, created_at = NOW()
       RETURNING id`,
      [cap.id, modo, publicOf(src), thumb]
    );
    const fuenteId = fuente.rows[0].id;

    try {
      const info = await probe(src);
      if (info?.duration) {
        await query('UPDATE hentai_capitulo_fuentes SET duracion = $1 WHERE id = $2', [fmtDuration(info.duration), fuenteId]);
      }
    } catch { /* sin ffprobe */ }

    if (!serie.thumb) {
      await query('UPDATE hentai SET thumb = COALESCE(thumb, $2), cover = COALESCE(cover, $2) WHERE id = $1', [serie.id, thumb || publicOf(src)]);
    }

    await cacheDel('cache:stats');
    await publishEvent('hentai_updated', { id: serie.id });

    res.status(201).json({ ok: true, capitulo: cap, fuenteId, modo, processing: hasFFmpeg });

    finishTranscode({ fuenteId, origPath: src, destDir });
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
    await query('UPDATE hentai_capitulo_fuentes SET activo = FALSE WHERE capitulo_id = $1', [capId]);
    await publishEvent('hentai_updated', { id: capId });
    res.json({ ok: true, id: capId });
  } catch (e) { next(e); }
});

// POST /api/hentai/:id/capitulos/reorder  { order: [capId, ...] }
r.post('/:id/capitulos/reorder', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const serie = await getSerie(id);
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });

    const order = Array.isArray(req.body?.order)
      ? req.body.order.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (!order.length) return res.status(400).json({ error: 'Orden inválido' });

    // 1) alejar los números actuales (evita choques del UNIQUE hentai_id+numero)
    await query('UPDATE hentai_capitulos SET numero = -numero WHERE hentai_id = $1', [id]);

    // 2) asignar el nuevo orden y regenerar el título automático
    const base = serie.titulo_es || serie.titulo_en || 'Anime';
    const baseEn = serie.titulo_en || serie.titulo_es || 'Anime';
    for (let i = 0; i < order.length; i++) {
      await query(
        `UPDATE hentai_capitulos
            SET numero = $2, titulo_es = $3, titulo_en = $4, updated_at = NOW()
          WHERE id = $1 AND hentai_id = $5`,
        [order[i], i + 1, `${base} - Capítulo ${i + 1}`, `${baseEn} - Episode ${i + 1}`, id]
      );
    }

    await publishEvent('hentai_updated', { id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/hentai/fuentes/:fuenteId  -> quita solo un modo (sub/es)
r.delete('/fuentes/:fuenteId', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.fuenteId);
    const { rows } = await query(
      'UPDATE hentai_capitulo_fuentes SET activo = FALSE WHERE id = $1 RETURNING id',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Fuente no encontrada' });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

// PUT /api/hentai/fuentes/:fuenteId  (multipart: thumb) -> cambia la miniatura del video
r.put('/fuentes/:fuenteId', authRequired, upload.single('thumb'), async (req, res, next) => {
  try {
    const fuenteId = Number(req.params.fuenteId);
    if (!Number.isInteger(fuenteId) || fuenteId <= 0) return res.status(404).json({ error: 'Fuente no encontrada' });
    const { rows } = await query(
      `SELECT f.id, f.modo, c.hentai_id, c.numero
         FROM hentai_capitulo_fuentes f
         JOIN hentai_capitulos c ON c.id = f.capitulo_id
        WHERE f.id = $1`,
      [fuenteId]
    );
    const fuente = rows[0];
    if (!fuente) return res.status(404).json({ error: 'Fuente no encontrada' });
    const serie = await getSerie(fuente.hentai_id);
    if (!serie) return res.status(404).json({ error: 'Hentai no encontrado' });

    const file = req.file;
    let thumb = null;
    if (file) {
      const dir = path.join(serieDir(serie), hentaiCapFolder(fuente.numero), fuente.modo, 'thumbs');
      fs.mkdirSync(dir, { recursive: true });
      const ext = (path.extname(file.filename || file.originalname) || '.jpg').toLowerCase();
      const target = path.join(dir, `thumb${ext}`);
      moveFileSync(file.path, target);
      thumb = publicOf(target);
    }
    await query('UPDATE hentai_capitulo_fuentes SET thumb = COALESCE($2, thumb) WHERE id = $1', [fuenteId, thumb]);
    await cacheDel('cache:stats');
    await publishEvent('hentai_updated', { id: fuente.hentai_id });
    res.json({ ok: true, thumb });
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

// ============================================================
// INTERACCIONES de capítulos (like/save/report/download)
// ============================================================

function uk(value) {
  const k = String(value || '').trim();
  return k || null;
}

async function getCapStats(capId, userKey) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM hentai_likes WHERE capitulo_id = $1 AND tipo = 'like')    AS likes,
       (SELECT COUNT(*)::int FROM hentai_likes WHERE capitulo_id = $1 AND tipo = 'dislike') AS dislikes,
       (SELECT COUNT(*)::int FROM hentai_saved WHERE capitulo_id = $1)                      AS saves,
       (SELECT COUNT(*)::int FROM hentai_downloads WHERE capitulo_id = $1)                  AS downloads,
       (SELECT COALESCE(vistas, 0) FROM hentai_capitulos WHERE id = $1)                     AS views,
       (SELECT COUNT(*)::int FROM subscriptions s
          JOIN hentai_capitulos c ON c.id = $1
          JOIN hentai h ON h.id = c.hentai_id
         WHERE s.channel = h.canal)                                                          AS subscribers`,
    [capId]
  );
  const s = rows[0] || {};
  let myVote = null, saved = false, following = false, reported = false;
  if (userKey) {
    const v = await query('SELECT tipo FROM hentai_likes WHERE capitulo_id = $1 AND user_key = $2', [capId, userKey]);
    myVote = v.rows[0]?.tipo || null;
    const sv = await query('SELECT 1 FROM hentai_saved WHERE capitulo_id = $1 AND user_key = $2', [capId, userKey]);
    saved = !!sv.rows[0];
    const rp = await query('SELECT 1 FROM hentai_reports WHERE capitulo_id = $1 AND user_key = $2 LIMIT 1', [capId, userKey]);
    reported = !!rp.rows[0];
    const f = await query(
      `SELECT 1 FROM subscriptions s
         JOIN hentai_capitulos c ON c.id = $1
         JOIN hentai h ON h.id = c.hentai_id
        WHERE s.channel = h.canal AND s.user_key = $2`,
      [capId, userKey]
    );
    following = !!f.rows[0];
  }
  return { capituloId: capId, ...s, myVote, saved, following, reported };
}

// GET /api/hentai/capitulos/:capId/interactions?userKey=
r.get('/capitulos/:capId/interactions', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(404).json({ error: 'Capítulo no encontrado' });
    const exists = await query('SELECT id FROM hentai_capitulos WHERE id = $1', [capId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });
    res.json(await getCapStats(capId, uk(req.query.userKey)));
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/like  { userKey, tipo: 'like'|'dislike'|'none' }
r.post('/capitulos/:capId/like', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(404).json({ error: 'Capítulo no encontrado' });
    const exists = await query('SELECT id FROM hentai_capitulos WHERE id = $1', [capId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });

    const userKey = uk(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });
    const tipo = req.body?.tipo;

    if (tipo === 'like' || tipo === 'dislike') {
      await query(
        `INSERT INTO hentai_likes (capitulo_id, user_key, tipo) VALUES ($1, $2, $3)
         ON CONFLICT (capitulo_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [capId, userKey, tipo]
      );
    } else {
      await query('DELETE FROM hentai_likes WHERE capitulo_id = $1 AND user_key = $2', [capId, userKey]);
    }
    await publishEvent('hentai_like', { id: capId });
    res.json(await getCapStats(capId, userKey));
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/save  { userKey }  (toggle)
r.post('/capitulos/:capId/save', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(404).json({ error: 'Capítulo no encontrado' });
    const exists = await query('SELECT id FROM hentai_capitulos WHERE id = $1', [capId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });

    const userKey = uk(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    const cur = await query('SELECT 1 FROM hentai_saved WHERE capitulo_id = $1 AND user_key = $2', [capId, userKey]);
    if (cur.rows[0]) await query('DELETE FROM hentai_saved WHERE capitulo_id = $1 AND user_key = $2', [capId, userKey]);
    else await query('INSERT INTO hentai_saved (capitulo_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [capId, userKey]);

    await publishEvent('hentai_save', { id: capId });
    res.json(await getCapStats(capId, userKey));
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/report  { userKey, motivo, detalle }
r.post('/capitulos/:capId/report', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(404).json({ error: 'Capítulo no encontrado' });
    const exists = await query('SELECT id FROM hentai_capitulos WHERE id = $1', [capId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });

    const userKey = uk(req.body?.userKey);
    const motivo = String(req.body?.motivo || 'otro').trim().slice(0, 60) || 'otro';
    const detalle = req.body?.detalle ? String(req.body.detalle).trim().slice(0, 1000) : null;

    await query(
      `INSERT INTO hentai_reports (capitulo_id, user_key, motivo, detalle) VALUES ($1, $2, $3, $4)`,
      [capId, userKey, motivo, detalle]
    );
    await publishEvent('hentai_report', { id: capId });
    res.json({ ok: true, reported: true });
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/download  { userKey }
r.post('/capitulos/:capId/download', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(404).json({ error: 'Capítulo no encontrado' });
    const exists = await query('SELECT id FROM hentai_capitulos WHERE id = $1', [capId]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Capítulo no encontrado' });

    const userKey = uk(req.body?.userKey);
    await query('INSERT INTO hentai_downloads (capitulo_id, user_key) VALUES ($1, $2)', [capId, userKey]);
    await publishEvent('hentai_download', { id: capId });
    res.json(await getCapStats(capId, userKey));
  } catch (e) { next(e); }
});

export default r;
