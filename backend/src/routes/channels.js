import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db/pool.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { authRequired } from '../middleware/auth.js';
import {
  upload, avatarUpload, publicOf,
  channelFolderName, channelRootDir,
} from '../services/upload.js';
import { transcodeAvatar } from '../services/transcode.js';

const r = Router();

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;

function normalizeUserKey(value) {
  const key = String(value || '').trim();
  return USER_KEY_RE.test(key) ? key : null;
}

/** Normaliza una posición de encuadre tipo "50% 50%". */
function cleanPos(value) {
  if (value === undefined) return undefined;
  const s = String(value || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (!m) return null;
  const x = Math.max(0, Math.min(100, parseFloat(m[1])));
  const y = Math.max(0, Math.min(100, parseFloat(m[2])));
  return `${x}% ${y}%`;
}

async function channelBySlug(slug) {
  const { rows } = await query(
    `SELECT id, nombre, slug, descripcion, avatar, avatar_pos, banner, banner_pos, pais,
            verificado, seguidores, created_at
       FROM channels
      WHERE slug = $1 AND activo = TRUE
      LIMIT 1`,
    [String(slug || '').trim()]
  );
  return rows[0] || null;
}

/** Canal del admin autenticado (o el canal oficial si no tiene uno propio). */
async function mineChannel(req) {
  const adminId = req.admin?.id || null;
  const byAdmin = await query('SELECT * FROM channels WHERE admin_id = $1 ORDER BY id LIMIT 1', [adminId]);
  if (byAdmin.rows[0]) return byAdmin.rows[0];

  const fb = await query(
    `SELECT * FROM channels WHERE nombre ILIKE '%pikante%' ORDER BY id LIMIT 1`
  );
  return fb.rows[0] || null;
}

async function channelStats(nombre) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM videos WHERE canal = $1 AND activo = TRUE) AS videos,
       (SELECT COALESCE(SUM(vistas), 0)::bigint FROM videos WHERE canal = $1 AND activo = TRUE) AS vistas,
       (SELECT COALESCE(SUM(likes), 0)::int FROM videos WHERE canal = $1 AND activo = TRUE) AS likes,
       (SELECT COUNT(*)::int FROM packs WHERE uploader = $1 AND activo = TRUE) AS packs,
       (SELECT COUNT(*)::int FROM hentai WHERE canal = $1 AND activo = TRUE) AS hentai,
       (SELECT COUNT(*)::int FROM subscriptions WHERE channel = $1) AS seguidores`,
    [nombre]
  );
  return rows[0];
}

function channelFolder(ch) {
  return path.join(channelRootDir(), channelFolderName(ch.id));
}

function removeFileInFolder(publicPath, folder) {
  if (!publicPath || !String(publicPath).startsWith('/media/channels/')) return;
  const abs = path.resolve(channelRootDir(), '..', String(publicPath).replace(/^\/media\//, ''));
  if (!abs.startsWith(folder)) return;
  try { fs.rmSync(abs, { force: true }); } catch { /* ignora */ }
}

// ============================================================
// PERFIL DEL CANAL DEL ADMIN (Bearer)
// ============================================================

// GET /api/channels/mine  -> canal del admin + stats
r.get('/mine', authRequired, async (req, res, next) => {
  try {
    const ch = await mineChannel(req);
    if (!ch) return res.status(404).json({ error: 'No tienes un canal asignado' });
    const stats = await channelStats(ch.nombre);
    res.json({
      ok: true,
      channel: {
        id: ch.id, nombre: ch.nombre, slug: ch.slug, descripcion: ch.descripcion,
        avatar: ch.avatar, avatar_pos: ch.avatar_pos, banner: ch.banner, banner_pos: ch.banner_pos,
        pais: ch.pais, verificado: ch.verificado, created_at: ch.created_at, ...stats,
      },
    });
  } catch (e) { next(e); }
});

// PUT /api/channels/mine  { descripcion, pais, avatar, banner, verificado }
r.put('/mine', authRequired, async (req, res, next) => {
  try {
    const ch = await mineChannel(req);
    if (!ch) return res.status(404).json({ error: 'No tienes un canal asignado' });

    const b = req.body || {};
    const descripcion = b.descripcion === undefined ? null : (String(b.descripcion).trim().slice(0, 2000) || null);
    const pais = b.pais === undefined ? null : (String(b.pais).trim().slice(0, 80) || null);
    const avatar = b.avatar === undefined ? null : (String(b.avatar).trim().slice(0, 255) || null);
    const banner = b.banner === undefined ? null : (String(b.banner).trim().slice(0, 255) || null);
    const avatarPos = cleanPos(b.avatar_pos);
    const bannerPos = cleanPos(b.banner_pos);
    const verificado = b.verificado === undefined
      ? null
      : (req.admin?.rol === 'superadmin' ? !!b.verificado : null);

    await query(
      `UPDATE channels SET
         descripcion = COALESCE($2, descripcion),
         pais        = COALESCE($3, pais),
         avatar      = COALESCE($4, avatar),
         banner      = COALESCE($5, banner),
         verificado  = COALESCE($6, verificado),
         avatar_pos  = COALESCE($7, avatar_pos),
         banner_pos  = COALESCE($8, banner_pos),
         updated_at  = NOW()
       WHERE id = $1`,
      [ch.id, descripcion, pais, avatar, banner, verificado, avatarPos, bannerPos]
    );

    await cacheDel('cache:stats');
    await publishEvent('channel_updated', { id: ch.id });

    const stats = await channelStats(ch.nombre);
    const fresh = await query('SELECT * FROM channels WHERE id = $1', [ch.id]);
    const f = fresh.rows[0];
    res.json({
      ok: true,
      channel: {
        id: f.id, nombre: f.nombre, slug: f.slug, descripcion: f.descripcion,
        avatar: f.avatar, avatar_pos: f.avatar_pos, banner: f.banner, banner_pos: f.banner_pos,
        pais: f.pais, verificado: f.verificado, created_at: f.created_at, ...stats,
      },
    });
  } catch (e) { next(e); }
});

// POST /api/channels/mine/avatar  (multipart: avatar)
r.post('/mine/avatar', authRequired, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const ch = await mineChannel(req);
    if (!ch) return res.status(404).json({ error: 'No tienes un canal asignado' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Adjunta una imagen' });

    const folder = channelFolder(ch);
    removeFileInFolder(ch.avatar, folder);

    const { renditions, main } = await transcodeAvatar({ inputPath: file.path, destDir: folder });
    fs.rm(file.path, { force: true }, () => {});
    const chosen = (renditions || []).find((x) => x.size === 400) || (renditions || [])[0];
    const avatarPublic = publicOf(path.join(folder, chosen ? chosen.file : main));

    await query('UPDATE channels SET avatar = $2, updated_at = NOW() WHERE id = $1', [ch.id, avatarPublic]);
    await publishEvent('channel_updated', { id: ch.id });
    res.json({ ok: true, avatar: avatarPublic });
  } catch (e) { next(e); }
});

// POST /api/channels/mine/banner  (multipart: banner)
r.post('/mine/banner', authRequired, upload.single('banner'), async (req, res, next) => {
  try {
    const ch = await mineChannel(req);
    if (!ch) return res.status(404).json({ error: 'No tienes un canal asignado' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Adjunta una imagen' });
    if (!/^image\//.test(file.mimetype) && !/\.(png|jpe?g|webp|avif)$/i.test(file.originalname)) {
      fs.rm(file.path, { force: true }, () => {});
      return res.status(400).json({ error: 'Formato de imagen no permitido (png/jpg/webp/avif)' });
    }

    const folder = channelFolder(ch);
    fs.mkdirSync(folder, { recursive: true });
    removeFileInFolder(ch.banner, folder);

    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const target = path.join(folder, `banner${ext}`);
    try { fs.renameSync(file.path, target); } catch { fs.copyFileSync(file.path, target); fs.rm(file.path, { force: true }, () => {}); }
    const bannerPublic = publicOf(target);

    await query('UPDATE channels SET banner = $2, updated_at = NOW() WHERE id = $1', [ch.id, bannerPublic]);
    await publishEvent('channel_updated', { id: ch.id });
    res.json({ ok: true, banner: bannerPublic });
  } catch (e) { next(e); }
});

// GET /api/channels/:slug?userKey=  -> perfil público del canal
r.get('/:slug', async (req, res, next) => {
  try {
    const ch = await channelBySlug(req.params.slug);
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });

    const userKey = normalizeUserKey(req.query.userKey);

    const stats = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM videos WHERE canal = $1 AND activo = TRUE)        AS videos,
         (SELECT COALESCE(SUM(vistas), 0)::bigint FROM videos WHERE canal = $1 AND activo = TRUE) AS vistas,
         (SELECT COALESCE(SUM(likes), 0)::int FROM videos WHERE canal = $1 AND activo = TRUE)     AS likes,
         (SELECT COUNT(*)::int FROM subscriptions WHERE channel = $1)                 AS seguidores`,
      [ch.nombre]
    );

    let following = false;
    if (userKey) {
      const f = await query(
        'SELECT 1 FROM subscriptions WHERE channel = $1 AND user_key = $2',
        [ch.nombre, userKey]
      );
      following = !!f.rows[0];
    }

    res.json({ ok: true, channel: { ...ch, ...stats.rows[0] }, following });
  } catch (e) { next(e); }
});

// GET /api/channels/:slug/videos?page=&limit=&sort=recent|popular|oldest&q=
r.get('/:slug/videos', async (req, res, next) => {
  try {
    const ch = await channelBySlug(req.params.slug);
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    const sortRaw = String(req.query.sort || 'recent');
    const sort = sortRaw === 'popular' ? 'popular' : sortRaw === 'oldest' ? 'oldest' : 'recent';
    const q = String(req.query.q || '').trim().toLowerCase();

    const params = [ch.nombre];
    let where = 'canal = $1 AND activo = TRUE';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (lower(titulo_es) LIKE $${params.length} OR lower(titulo_en) LIKE $${params.length})`;
    }

    const orderBy =
      sort === 'popular' ? 'vistas DESC, id DESC'
        : sort === 'oldest' ? 'COALESCE(publicado_en, created_at) ASC, id ASC'
          : 'COALESCE(publicado_en, created_at) DESC, id DESC';

    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM videos WHERE ${where}`, params);
    const { rows } = await query(
      `SELECT id, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga,
              duracion, vistas, likes, dislikes, is_fetiche, is_tendencia, created_at
         FROM videos
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const total = totalQ.rows[0].n;
    res.json({
      data: rows,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      sort,
      q,
    });
  } catch (e) { next(e); }
});

// GET /api/channels/:slug/packs?page=&limit=  -> packs subidos por el canal
r.get('/:slug/packs', async (req, res, next) => {
  try {
    const ch = await channelBySlug(req.params.slug);
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    const totalQ = await query(
      'SELECT COUNT(*)::int AS n FROM packs WHERE uploader = $1 AND activo = TRUE',
      [ch.nombre]
    );
    const { rows } = await query(
      `SELECT id, public_id, slug, titulo_es, titulo_en, titulo, thumb, fotos, videos,
              vistas, descargas, uploader, precio, download, created_at
         FROM packs
        WHERE uploader = $1 AND activo = TRUE
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [ch.nombre, limit, offset]
    );

    const total = totalQ.rows[0].n;
    res.json({ data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// GET /api/channels/:slug/hentai?page=&limit=  -> animes subidos por el canal
r.get('/:slug/hentai', async (req, res, next) => {
  try {
    const ch = await channelBySlug(req.params.slug);
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    const totalQ = await query(
      'SELECT COUNT(*)::int AS n FROM hentai WHERE canal = $1 AND activo = TRUE',
      [ch.nombre]
    );
    const { rows } = await query(
      `SELECT id, titulo_es, titulo_en, desc_es, desc_en, thumb, src, duracion, vistas, created_at
         FROM hentai
        WHERE canal = $1 AND activo = TRUE
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [ch.nombre, limit, offset]
    );

    const total = totalQ.rows[0].n;
    res.json({ data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// POST /api/channels/:slug/follow  { userKey }  -> seguir / dejar de seguir
r.post('/:slug/follow', async (req, res, next) => {
  try {
    const ch = await channelBySlug(req.params.slug);
    if (!ch) return res.status(404).json({ error: 'Canal no encontrado' });

    const userKey = normalizeUserKey(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const cur = await query(
      'SELECT 1 FROM subscriptions WHERE channel = $1 AND user_key = $2',
      [ch.nombre, userKey]
    );
    let following;
    if (cur.rows[0]) {
      await query('DELETE FROM subscriptions WHERE channel = $1 AND user_key = $2', [ch.nombre, userKey]);
      following = false;
    } else {
      await query(
        'INSERT INTO subscriptions (channel, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [ch.nombre, userKey]
      );
      following = true;
    }

    const cnt = await query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE channel = $1', [ch.nombre]);
    const seguidores = cnt.rows[0].n;
    await query('UPDATE channels SET seguidores = $2, updated_at = NOW() WHERE id = $1', [ch.id, seguidores]);

    await publishEvent('channel_follow', { channel: ch.nombre });
    res.json({ ok: true, following, seguidores });
  } catch (e) { next(e); }
});

export default r;
