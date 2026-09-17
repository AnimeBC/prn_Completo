import { Router } from 'express';
import { query } from '../db/pool.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

async function getVideo(id) {
  const vid = Number.parseInt(String(id), 10);
  if (!Number.isInteger(vid) || vid <= 0) return null;
  const { rows } = await query('SELECT id, canal, vistas FROM videos WHERE id = $1', [vid]);
  return rows[0] || null;
}

async function getStats(videoId, userKey, channel) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM video_likes WHERE video_id = $1 AND tipo = 'like')    AS likes,
       (SELECT COUNT(*)::int FROM video_likes WHERE video_id = $1 AND tipo = 'dislike') AS dislikes,
       (SELECT COUNT(*)::int FROM saved_videos WHERE video_id = $1)                     AS saves,
       (SELECT COUNT(*)::int FROM downloads   WHERE video_id = $1)                     AS downloads,
       (SELECT COUNT(*)::int FROM video_views WHERE video_id = $1)                     AS view_events,
       (SELECT COALESCE(vistas,0) FROM videos WHERE id = $1)                           AS views,
       (SELECT COUNT(*)::int FROM subscriptions WHERE channel = $2)                    AS subscribers`,
    [videoId, channel || '']
  );
  const s = rows[0];
  let myVote = null, saved = false, following = false, reported = false;
  if (userKey) {
    const v = await query('SELECT tipo FROM video_likes WHERE video_id = $1 AND user_key = $2', [videoId, userKey]);
    myVote = v.rows[0]?.tipo || null;
    const sv = await query('SELECT 1 FROM saved_videos WHERE video_id = $1 AND user_key = $2', [videoId, userKey]);
    saved = !!sv.rows[0];
    const rp = await query('SELECT 1 FROM reports WHERE video_id = $1 AND user_key = $2 LIMIT 1', [videoId, userKey]);
    reported = !!rp.rows[0];
    if (channel) {
      const f = await query('SELECT 1 FROM subscriptions WHERE channel = $1 AND user_key = $2', [channel, userKey]);
      following = !!f.rows[0];
    }
  }
  return { videoId, channel: channel || null, ...s, myVote, saved, following, reported };
}

// GET /api/videos/:id/interactions?userKey=
r.get('/videos/:id/interactions', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    res.json(await getStats(v.id, req.query.userKey, v.canal));
  } catch (e) { next(e); }
});

// POST /api/videos/:id/like  { userKey, tipo: 'like'|'dislike'|'none' }
r.post('/videos/:id/like', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey, tipo } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    if (tipo === 'like' || tipo === 'dislike') {
      await query(
        `INSERT INTO video_likes (video_id, user_key, tipo) VALUES ($1,$2,$3)
         ON CONFLICT (video_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [v.id, userKey, tipo]
      );
    } else {
      await query('DELETE FROM video_likes WHERE video_id = $1 AND user_key = $2', [v.id, userKey]);
    }

    // refleja conteos en la tabla videos (para el listado)
    await query(
      `UPDATE videos SET
         likes    = (SELECT COUNT(*) FROM video_likes WHERE video_id = $1 AND tipo = 'like'),
         dislikes = (SELECT COUNT(*) FROM video_likes WHERE video_id = $1 AND tipo = 'dislike')
       WHERE id = $1`,
      [v.id]
    );

    await cacheDel('cache:stats');
    await publishEvent('video_like', { id: v.id });
    res.json(await getStats(v.id, userKey, v.canal));
  } catch (e) { next(e); }
});

// POST /api/videos/:id/view  { userKey }
r.post('/videos/:id/view', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();

    await query('INSERT INTO video_views (video_id, user_key, ip) VALUES ($1,$2,$3)', [v.id, userKey || null, ip]);
    await query('UPDATE videos SET vistas = COALESCE(vistas,0) + 1 WHERE id = $1', [v.id]);

    await cacheDel('cache:stats');
    res.json(await getStats(v.id, userKey, v.canal));
  } catch (e) { next(e); }
});

// POST /api/videos/:id/save  { userKey }  (toggle)
r.post('/videos/:id/save', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey } = req.body || {};
    if (!userKey) return res.status(400).json({ error: 'userKey requerido' });

    const cur = await query('SELECT 1 FROM saved_videos WHERE video_id = $1 AND user_key = $2', [v.id, userKey]);
    if (cur.rows[0]) await query('DELETE FROM saved_videos WHERE video_id = $1 AND user_key = $2', [v.id, userKey]);
    else await query('INSERT INTO saved_videos (video_id, user_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [v.id, userKey]);

    await publishEvent('video_save', { id: v.id });
    res.json(await getStats(v.id, userKey, v.canal));
  } catch (e) { next(e); }
});

// GET /api/report-motivos  -> catálogo de motivos de reporte
r.get('/report-motivos', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT slug, nombre FROM report_motivos WHERE activo = TRUE ORDER BY id'
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/videos/:id/report  { userKey, motivo, detalle }
r.post('/videos/:id/report', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey, motivo, detalle } = req.body || {};
    const slug = String(motivo || 'otro').trim().slice(0, 60) || 'otro';
    const nota = detalle ? String(detalle).trim().slice(0, 1000) : null;
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim().slice(0, 60) || null;

    await query(
      `INSERT INTO reports (video_id, user_key, motivo, motivo_slug, detalle, estado, ip)
       VALUES ($1, $2, $3, $4, $5, 'pendiente', $6)`,
      [v.id, userKey || null, slug, slug, nota, ip]
    );

    await publishEvent('video_report', { id: v.id });
    res.json({ ok: true, reported: true });
  } catch (e) { next(e); }
});

// GET /api/reports  (admin) -> lista de reportes recibidos
r.get('/reports', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.video_id, r.user_key, r.motivo, r.detalle, r.estado, r.created_at,
              v.titulo_es, v.titulo_en, v.thumb
         FROM reports r
         LEFT JOIN videos v ON v.id = r.video_id
        ORDER BY r.created_at DESC
        LIMIT 200`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/videos/:id/download  { userKey }
r.post('/videos/:id/download', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey } = req.body || {};
    await query('INSERT INTO downloads (video_id, user_key) VALUES ($1,$2)', [v.id, userKey || null]);
    await publishEvent('video_download', { id: v.id });
    res.json(await getStats(v.id, userKey, v.canal));
  } catch (e) { next(e); }
});

// POST /api/videos/:id/share  { userKey, red }
r.post('/videos/:id/share', async (req, res, next) => {
  try {
    const v = await getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: 'Video no encontrado' });
    const { userKey, red } = req.body || {};
    await query('INSERT INTO shares (video_id, user_key, red) VALUES ($1,$2,$3)', [v.id, userKey || null, red || null]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/channels/follow  { channel, userKey }  (toggle)
r.post('/channels/follow', async (req, res, next) => {
  try {
    const { channel, userKey } = req.body || {};
    if (!channel || !userKey) return res.status(400).json({ error: 'channel y userKey requeridos' });

    const cur = await query('SELECT 1 FROM subscriptions WHERE channel = $1 AND user_key = $2', [channel, userKey]);
    let following;
    if (cur.rows[0]) {
      await query('DELETE FROM subscriptions WHERE channel = $1 AND user_key = $2', [channel, userKey]);
      following = false;
    } else {
      await query('INSERT INTO subscriptions (channel, user_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [channel, userKey]);
      following = true;
    }

    const cnt = await query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE channel = $1', [channel]);
    const subs = cnt.rows[0].n;
    await query(
      `INSERT INTO channels (nombre, seguidores) VALUES ($1,$2)
       ON CONFLICT (nombre) DO UPDATE SET seguidores = EXCLUDED.seguidores`,
      [channel, subs]
    );

    await publishEvent('channel_follow', { channel });
    res.json({ ok: true, channel, following, subscribers: subs });
  } catch (e) { next(e); }
});

export default r;
