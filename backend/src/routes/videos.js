import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db/pool.js';
import {
  upload, MEDIA_DIR,
  videoFolderName, videoRootDir, publicOf, removeVideoFolder, moveFileSync,
} from '../services/upload.js';
import { authRequired } from '../middleware/auth.js';
import { slugify, channelSlug } from '../utils/slug.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { transcodeVideo, hasFFmpeg, fmtDuration, probe } from '../services/transcode.js';

const r = Router();

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi)$/i;

/** Asegura que exista el canal (perfil público) para un video. */
async function ensureChannel(nombre, adminId = null) {
  const name = String(nombre || '').trim();
  if (!name) return;
  const slug = channelSlug(name);
  await query(
    `INSERT INTO channels (nombre, slug, admin_id) VALUES ($1, $2, $3)
     ON CONFLICT (nombre) DO UPDATE
       SET slug = COALESCE(channels.slug, EXCLUDED.slug),
           admin_id = COALESCE(channels.admin_id, EXCLUDED.admin_id)`,
    [name, slug, adminId]
  );
}

/**
 * Mueve el archivo temporal a la carpeta propia del video y fija src inicial.
 * Devuelve { destDir, folderName, origPath }.
 */
function stageOriginal({ id, isFetiche, collection, videoFile }) {
  const folderName = videoFolderName({ id, isFetiche, collection });
  const destDir = path.join(videoRootDir({ isFetiche, collection }), folderName);
  fs.mkdirSync(destDir, { recursive: true });

  const ext = (path.extname(videoFile.filename) || path.extname(videoFile.originalname) || '.mp4').toLowerCase();
  const origPath = path.join(destDir, `original${VIDEO_EXT.test(ext) ? ext : '.mp4'}`);
  moveFileSync(videoFile.path, origPath);
  return { destDir, folderName, origPath };
}

/** Transcodifica en segundo plano y actualiza la BD al terminar. */
async function finishTranscode({ id, origPath, destDir }) {
  try {
    if (!hasFFmpeg) {
      const src = publicOf(origPath);
      await query(
        `UPDATE videos SET src = $1, descarga = $1, renditions = $2::jsonb, updated_at = NOW() WHERE id = $3`,
        [src, JSON.stringify([{ label: 'original', src }]), id]
      );
      await publishEvent('video_ready', { id });
      return;
    }
    const { renditions, poster, duration } = await transcodeVideo({ inputPath: origPath, destDir });
    const rel = path.relative(MEDIA_DIR, destDir).replace(/\\/g, '/');
    const list = renditions.map((x) => ({ label: x.label, height: x.height, src: `/media/${rel}/${x.file}` }));
    const def = list.find((x) => x.label === '720p') || list[0] || null;

    // si el usuario subió su propia portada (cover.*), se respeta; si no, el poster de FFmpeg
    const thumbsDir = path.join(destDir, 'thumbs');
    let cover = null;
    try { cover = fs.readdirSync(thumbsDir).find((f) => f.startsWith('cover.')) || null; } catch { /* sin carpeta */ }
    const thumb = poster && !cover ? `/media/${rel}/thumbs/poster.jpg` : null;

    await query(
      `UPDATE videos
          SET src = COALESCE($1, src), descarga = COALESCE($1, descarga),
              thumb = COALESCE($2, thumb),
              renditions = $3::jsonb, duracion = $4, updated_at = NOW()
        WHERE id = $5`,
      [def?.src || null, thumb, JSON.stringify(list), fmtDuration(duration), id]
    );

    fs.rm(origPath, { force: true }, () => {});
    await cacheDel('cache:stats');
    await publishEvent('video_ready', { id });
    console.log(`[transcode] video #${id} listo: ${list.map((x) => x.label).join(', ')}`);
  } catch (err) {
    console.error(`[transcode] video #${id} falló:`, err.message);
  }
}

function toBool(v) {
  return v === true || String(v).toLowerCase() === 'true' || v === '1';
}
function splitTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 120);
}

/** Saca la duración real del archivo con ffprobe y la guarda. */
async function setDurationFromFile(id, filePath) {
  try {
    const info = await probe(filePath);
    if (info?.duration) {
      await query('UPDATE videos SET duracion = $1 WHERE id = $2', [fmtDuration(info.duration), id]);
    }
  } catch { /* sin ffprobe: se queda la duración que mandó el cliente */ }
}

async function ensureCategoria(nombre) {
  const slug = slugify(nombre);
  const { rows } = await query(
    `INSERT INTO fetiche_categorias (nombre, slug)
     VALUES ($1, $2)
     ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id, nombre`,
    [nombre, slug]
  );
  await cacheDel('cache:fetiche-categorias');
  return rows[0].id;
}

async function linkTags(videoId, names) {
  await query('DELETE FROM video_tags WHERE video_id = $1', [videoId]);
  for (const name of names) {
    const slug = slugify(name);
    const { rows } = await query(
      `INSERT INTO tags (nombre, slug)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [name, slug]
    );
    await query(
      'INSERT INTO video_tags (video_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [videoId, rows[0].id]
    );
  }
}

async function tagsForVideos(ids) {
  if (!ids.length) return {};
  const { rows } = await query(
    `SELECT vt.video_id, t.nombre
       FROM video_tags vt
       JOIN tags t ON t.id = vt.tag_id
      WHERE vt.video_id = ANY($1::int[])
      ORDER BY t.nombre`,
    [ids]
  );
  const map = {};
  for (const row of rows) {
    (map[row.video_id] ||= []).push(row.nombre);
  }
  return map;
}

// GET /api/videos?fetiche=&tendencia=&categoria=&q=&page=&limit=
r.get('/', async (req, res, next) => {
  try {
    const { fetiche, tendencia, categoria, q = '', page = '1', limit = '16', papelera } = req.query;
    const where = [papelera === 'true' ? 'v.activo = FALSE' : 'v.activo = TRUE'];
    const params = [];

    if (fetiche === 'true' || fetiche === 'false') {
      params.push(fetiche === 'true');
      where.push(`v.is_fetiche = $${params.length}`);
    }
    if (categoria) {
      params.push(categoria);
      where.push(`v.fetiche_categoria_id = $${params.length}`);
    }
    if (tendencia === 'true' || tendencia === 'false') {
      params.push(tendencia === 'true');
      where.push(`v.is_tendencia = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(v.titulo_es ILIKE $${params.length} OR v.titulo_en ILIKE $${params.length} OR v.desc_es ILIKE $${params.length})`);
    }

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 16));
    const offset = (p - 1) * l;

    const base = `FROM videos v WHERE ${where.join(' AND ')}`;
    const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
    const { rows } = await query(
      `SELECT v.*, fc.nombre AS fetiche_categoria,
              COALESCE(u.avatar, c.avatar) AS canal_avatar,
              c.slug AS canal_slug
         FROM videos v
         LEFT JOIN fetiche_categorias fc ON fc.id = v.fetiche_categoria_id
         LEFT JOIN channels c ON c.nombre = v.canal
         LEFT JOIN users u ON u.user_key = c.user_key
        WHERE ${where.join(' AND ')}
        ORDER BY v.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, l, offset]
    );

    const tagMap = await tagsForVideos(rows.map((v) => v.id));
    const data = rows.map((v) => ({ ...v, tags: tagMap[v.id] || [] }));

    res.json({ data, total: countRes.rows[0].total, page: p, limit: l });
  } catch (e) { next(e); }
});

// GET /api/videos/:id  (acepta id numérico o slug)
r.get('/:id', async (req, res, next) => {
  try {
    const param = String(req.params.id || '').trim();
    const num = Number(param);
    const byId = Number.isInteger(num) && num > 0;
    const { rows } = await query(
      `SELECT v.*, fc.nombre AS fetiche_categoria,
              COALESCE(u.avatar, c.avatar) AS canal_avatar,
              c.slug AS canal_slug
         FROM videos v
         LEFT JOIN fetiche_categorias fc ON fc.id = v.fetiche_categoria_id
         LEFT JOIN channels c ON c.nombre = v.canal
         LEFT JOIN users u ON u.user_key = c.user_key
        WHERE ${byId ? 'v.id = $1' : 'v.slug = $1'}`,
      [byId ? num : param]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Video no encontrado' });
    const tagMap = await tagsForVideos([rows[0].id]);
    res.json({ ...rows[0], tags: tagMap[rows[0].id] || [] });
  } catch (e) { next(e); }
});

// POST /api/videos/upload  (Bearer) multipart
r.post('/upload', authRequired, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || b.titleEn || '').trim();
    if (!title) return res.status(400).json({ error: 'El título (ES) es obligatorio' });

    const videoFile = req.files?.video?.[0];
    if (!videoFile) return res.status(400).json({ error: 'Falta el archivo de video' });

    const isF = toBool(b.isFetiche);
    const isT = toBool(b.isTendencia);
    const duration = String(b.duration || '00:00').slice(0, 20);
    const catName = String(b.feticheCategoria || '').trim();

    let catId = null;
    if (isF && catName) catId = await ensureCategoria(catName);

    const ins = await query(
      `INSERT INTO videos
        (titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, is_fetiche, fetiche_categoria_id, is_tendencia)
       VALUES ($1,$2,$3,$4,$5,'','','',$6,$7,$8,$9)
       RETURNING id`,
      [
        title,
        String(b.titleEn || title).trim(),
        String(b.desc || '').trim(),
        String(b.descEn || b.desc || '').trim(),
        'administrador pikante.pe',
        duration,
        isF,
        catId,
        isT,
      ]
    );
    const id = ins.rows[0].id;

    // asegura el canal para el perfil público
    await ensureChannel('administrador pikante.pe', req.admin?.id);

    // carpeta propia del video: videos/video_011/  (o fetiches/fetiche_04/)
    const { destDir, origPath } = stageOriginal({ id, isFetiche: isF, collection: 'videos', videoFile });
    const src = publicOf(origPath);
    await setDurationFromFile(id, origPath);

    // portada del usuario -> <carpeta>/thumbs/cover.<ext>
    let thumb = null;
    const thumbFile = req.files?.thumb?.[0];
    if (thumbFile) {
      const ext = (path.extname(thumbFile.filename) || '.jpg').toLowerCase();
      const thumbsDir = path.join(destDir, 'thumbs');
      fs.mkdirSync(thumbsDir, { recursive: true });
      const target = path.join(thumbsDir, `cover${ext}`);
      moveFileSync(thumbFile.path, target);
      thumb = publicOf(target);
    }

    await query('UPDATE videos SET src = $1, descarga = $1, thumb = $2 WHERE id = $3', [src, thumb, id]);
    await query('UPDATE videos SET slug = $2 WHERE id = $1', [id, `${slugify(title) || 'video'}-${id}`]);

    const names = [...splitTags(b.tags), ...splitTags(b.tagsEn)];
    await linkTags(id, names);

    await cacheDel('cache:stats');
    await publishEvent('video_created', { id, title, src });

    const { rows } = await query('SELECT * FROM videos WHERE id = $1', [id]);
    res.status(201).json({ ok: true, video: { ...rows[0], tags: names }, processing: hasFFmpeg });

    // transcodifica a calidades en segundo plano
    finishTranscode({ id, origPath, destDir });
  } catch (e) { next(e); }
});

// POST /api/videos/:id/media  (Bearer) — adjunta/reemplaza video y/o portada de un video existente
r.post('/:id/media', authRequired, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Video no encontrado' });
    const cur = await query('SELECT id, src, thumb, is_fetiche FROM videos WHERE id = $1', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Video no encontrado' });

    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumb?.[0];
    if (!videoFile && !thumbFile) return res.status(400).json({ error: 'Adjunta el video o la portada' });

    console.log(`[videos] media id=${id} video=${videoFile ? videoFile.originalname : '-'} thumb=${thumbFile ? thumbFile.originalname : '-'}`);

    const isF = cur.rows[0].is_fetiche;

    let src = cur.rows[0].src || '';
    let thumb = cur.rows[0].thumb || null;
    let stage = null;

    if (videoFile) {
      // borra la carpeta anterior y crea una nueva con el original
      removeVideoFolder(cur.rows[0].src || cur.rows[0].thumb);
      stage = stageOriginal({ id, isFetiche: isF, collection: 'videos', videoFile });
      src = publicOf(stage.origPath);
      thumb = null;
      await setDurationFromFile(id, stage.origPath);
    }
    if (thumbFile) {
      // carpeta raíz del video -> /thumbs/cover.<ext>
      let baseDir = stage ? stage.destDir : null;
      if (!baseDir) {
        const abs = path.resolve(MEDIA_DIR, String(src || '').replace(/^\/media\//, ''));
        const parent = path.dirname(abs);
        baseDir = path.basename(parent) === 'calidades' ? path.dirname(parent) : parent;
      }
      const thumbsDir = path.join(baseDir, 'thumbs');
      fs.mkdirSync(thumbsDir, { recursive: true });
      const ext = (path.extname(thumbFile.filename) || '.jpg').toLowerCase();
      const target = path.join(thumbsDir, `cover${ext}`);
      moveFileSync(thumbFile.path, target);
      thumb = publicOf(target);
    }

    await query('UPDATE videos SET src = $1, descarga = $1, thumb = $2, updated_at = NOW() WHERE id = $3', [src, thumb, id]);

    await publishEvent('video_media', { id, src });
    res.json({ ok: true, id, src, thumb, processing: !!(stage && hasFFmpeg) });

    if (stage) finishTranscode({ id, origPath: stage.origPath, destDir: stage.destDir });
  } catch (e) { next(e); }
});

// PUT /api/videos/:id  (Bearer) JSON
r.put('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Video no encontrado' });
    const b = req.body || {};

    const cur = await query('SELECT * FROM videos WHERE id = $1', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Video no encontrado' });

    let catId = cur.rows[0].fetiche_categoria_id;
    const isF = b.isFetiche !== undefined ? toBool(b.isFetiche) : cur.rows[0].is_fetiche;
    const catName = String(b.feticheCategoria || '').trim();
    if (isF && catName) catId = await ensureCategoria(catName);
    if (!isF) catId = null;

    const { rows } = await query(
      `UPDATE videos SET
         titulo_es = COALESCE($1, titulo_es),
         titulo_en = COALESCE($2, titulo_en),
         desc_es   = COALESCE($3, desc_es),
         desc_en   = COALESCE($4, desc_en),
         duracion  = COALESCE($5, duracion),
         is_fetiche = $6,
         fetiche_categoria_id = $7,
         is_tendencia = $8,
         updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        b.title ?? null,
        b.titleEn ?? null,
        b.desc ?? null,
        b.descEn ?? null,
        b.duration ?? null,
        isF,
        catId,
        b.isTendencia !== undefined ? toBool(b.isTendencia) : cur.rows[0].is_tendencia,
        id,
      ]
    );

    let names = null;
    if (b.tags !== undefined || b.tagsEn !== undefined) {
      names = [...splitTags(b.tags), ...splitTags(b.tagsEn)];
      await linkTags(id, names);
    }

    await cacheDel('cache:stats');
    await publishEvent('video_updated', { id });

    const tagMap = await tagsForVideos([id]);
    res.json({ ok: true, video: { ...rows[0], tags: tagMap[id] || [] } });
  } catch (e) { next(e); }
});

// POST /api/videos/:id/restore  (Bearer) — saca el video de la papelera
r.post('/:id/restore', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('UPDATE videos SET activo = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Video no encontrado' });
    await cacheDel('cache:stats');
    await publishEvent('video_restored', { id });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

// DELETE /api/videos/:id/permanent  (Bearer) — borra definitivamente (BD + archivos)
r.delete('/:id/permanent', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await query('SELECT src, thumb FROM videos WHERE id = $1', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Video no encontrado' });

    // borra la carpeta completa del video (calidades + poster)
    removeVideoFolder(cur.rows[0].src || cur.rows[0].thumb);
    await query('DELETE FROM videos WHERE id = $1', [id]);

    await cacheDel('cache:stats');
    await publishEvent('video_deleted', { id });
    res.json({ ok: true, id, permanent: true });
  } catch (e) { next(e); }
});

// DELETE /api/videos/:id  (Bearer) — mueve a la papelera (soft delete)
r.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query('UPDATE videos SET activo = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Video no encontrado' });

    await cacheDel('cache:stats');
    await publishEvent('video_trashed', { id });

    res.json({ ok: true, id, trashed: true });
  } catch (e) { next(e); }
});

// GET /api/videos/:id/file   (fuerza la descarga del archivo del video)
r.get('/:id/file', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Video no encontrado' });

    const { rows } = await query('SELECT src FROM videos WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Video no encontrado' });

    const src = String(rows[0].src || '');
    if (!src.startsWith('/media/')) return res.status(404).json({ error: 'Archivo no disponible' });

    const abs = path.resolve(MEDIA_DIR, src.replace(/^\/media\//, ''));
    if (!abs.startsWith(MEDIA_DIR)) return res.status(403).json({ error: 'No permitido' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(abs).size));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="pikantepe-video-${id}${path.extname(abs) || '.mp4'}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (e) { next(e); }
});

export default r;
