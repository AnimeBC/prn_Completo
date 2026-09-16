import { Router } from 'express';
import { query } from '../db/pool.js';
import { publishEvent } from '../db/redis.js';

const r = Router();

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;

function normalizeUserKey(value) {
  const key = String(value || '').trim();
  return USER_KEY_RE.test(key) ? key : null;
}

async function getAccount(userKey) {
  if (!userKey) return null;
  const { rows } = await query(
    `SELECT user_key, nombre, usuario, avatar, email_verified
       FROM users WHERE user_key = $1 LIMIT 1`,
    [userKey]
  );
  return rows[0] || null;
}

async function getPackId(publicId) {
  const { rows } = await query('SELECT id FROM packs WHERE public_id = $1 LIMIT 1', [String(publicId)]);
  return rows[0]?.id || null;
}

function publicComment(c) {
  return {
    id: c.id,
    video_id: c.video_id,
    parent_id: c.parent_id,
    texto: c.texto,
    likes: Number(c.likes) || 0,
    my_like: !!c.my_like,
    mine: !!c.mine,
    created_at: c.created_at,
    author: {
      name: c.u_nombre || c.u_usuario || c.usuario || 'Usuario',
      usuario: c.u_usuario || null,
      avatar: c.u_avatar || null,
      verified: !!c.u_verified,
    },
  };
}

async function selectComments(where, params, userKey) {
  return query(
    `SELECT c.id, c.video_id, c.parent_id, c.texto, c.usuario, c.created_at, c.user_key,
            u.nombre AS u_nombre, u.usuario AS u_usuario, u.avatar AS u_avatar,
            u.email_verified AS u_verified,
            (SELECT COUNT(*)::int FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes,
            EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_key = $${params.length + 1}) AS my_like
       FROM comments c
       LEFT JOIN users u ON u.user_key = c.user_key
      WHERE ${where} AND c.activo = TRUE
      ORDER BY c.created_at DESC`,
    [...params, userKey]
  );
}

function buildTree(rows, userKey, sort) {
  const list = rows.map((c) => ({ ...publicComment(c), mine: !!userKey && c.user_key === userKey }));
  const byId = new Map(list.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).replies.push(c);
    else roots.push(c);
  }
  roots.sort((a, b) => (
    sort === 'new'
      ? new Date(b.created_at) - new Date(a.created_at)
      : b.likes - a.likes || new Date(b.created_at) - new Date(a.created_at)
  ));
  return { data: roots, total: list.length };
}

async function createComment({ videoId = null, targetType, targetId, req }) {
  const userKey = normalizeUserKey(req.body?.userKey);
  const texto = String(req.body?.texto || '').trim().slice(0, 2000);
  const rawParent = req.body?.parent_id ? Number(req.body.parent_id) : null;
  const parentId = rawParent || null;
  if (!texto) return { error: { status: 400, body: { error: 'El comentario no puede estar vacío' } } };

  const user = await getAccount(userKey);
  if (!user || !user.email_verified) {
    return { error: { status: 401, body: { error: 'Inicia sesión para comentar', code: 'auth_required' } } };
  }

  if (parentId) {
    const p = await query(
      'SELECT id FROM comments WHERE id = $1 AND target_type = $2 AND target_id = $3 AND activo = TRUE',
      [parentId, targetType, targetId]
    );
    if (!p.rows[0]) return { error: { status: 400, body: { error: 'El comentario a responder no existe' } } };
  }

  const name = String(user.nombre || user.usuario || 'Usuario').slice(0, 120);
  const { rows } = await query(
    `INSERT INTO comments (video_id, target_type, target_id, usuario, texto, parent_id, user_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, video_id, parent_id, texto, created_at`,
    [videoId, targetType, targetId, name, texto, parentId, userKey]
  );

  await publishEvent('comment_created', { targetType, targetId });

  return {
    data: {
      ...rows[0],
      likes: 0,
      my_like: false,
      mine: true,
      author: { name, usuario: user.usuario || null, avatar: user.avatar || null, verified: true },
      replies: [],
    },
  };
}

// GET /api/videos/:id/comments?userKey=&sort=top|new
r.get('/videos/:id/comments', async (req, res, next) => {
  try {
    const videoId = Number(req.params.id);
    if (!videoId) return res.status(400).json({ error: 'Video inválido' });
    const userKey = normalizeUserKey(req.query.userKey);
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    const { rows } = await selectComments('c.video_id = $1', [videoId], userKey);
    res.json(buildTree(rows, userKey, sort));
  } catch (e) { next(e); }
});

// POST /api/videos/:id/comments  { userKey, texto, parent_id }
r.post('/videos/:id/comments', async (req, res, next) => {
  try {
    const videoId = Number(req.params.id);
    if (!videoId) return res.status(400).json({ error: 'Video inválido' });
    const out = await createComment({ videoId, targetType: 'video', targetId: videoId, req });
    if (out.error) return res.status(out.error.status).json(out.error.body);
    res.status(201).json(out.data);
  } catch (e) { next(e); }
});

// GET /api/packs/:publicId/comments?userKey=&sort=top|new
r.get('/packs/:publicId/comments', async (req, res, next) => {
  try {
    const packId = await getPackId(req.params.publicId);
    if (!packId) return res.status(404).json({ error: 'Pack no encontrado' });
    const userKey = normalizeUserKey(req.query.userKey);
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    const { rows } = await selectComments("c.target_type = 'pack' AND c.target_id = $1", [packId], userKey);
    res.json(buildTree(rows, userKey, sort));
  } catch (e) { next(e); }
});

// POST /api/packs/:publicId/comments  { userKey, texto, parent_id }
r.post('/packs/:publicId/comments', async (req, res, next) => {
  try {
    const packId = await getPackId(req.params.publicId);
    if (!packId) return res.status(404).json({ error: 'Pack no encontrado' });
    const out = await createComment({ targetType: 'pack', targetId: packId, req });
    if (out.error) return res.status(out.error.status).json(out.error.body);
    res.status(201).json(out.data);
  } catch (e) { next(e); }
});

// GET /api/hentai/capitulos/:capId/comments?userKey=&sort=top|new
r.get('/hentai/capitulos/:capId/comments', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(400).json({ error: 'Capítulo inválido' });
    const userKey = normalizeUserKey(req.query.userKey);
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    const { rows } = await selectComments("c.target_type = 'hentai' AND c.target_id = $1", [capId], userKey);
    res.json(buildTree(rows, userKey, sort));
  } catch (e) { next(e); }
});

// POST /api/hentai/capitulos/:capId/comments  { userKey, texto, parent_id }
r.post('/hentai/capitulos/:capId/comments', async (req, res, next) => {
  try {
    const capId = Number(req.params.capId);
    if (!capId) return res.status(400).json({ error: 'Capítulo inválido' });
    const out = await createComment({ targetType: 'hentai', targetId: capId, req });
    if (out.error) return res.status(out.error.status).json(out.error.body);
    res.status(201).json(out.data);
  } catch (e) { next(e); }
});

// POST /api/comments/:id/like  { userKey }  -> alterna el "me gusta"
r.post('/comments/:id/like', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Comentario inválido' });

    const userKey = normalizeUserKey(req.body?.userKey);
    const user = await getAccount(userKey);
    if (!user || !user.email_verified) {
      return res.status(401).json({ error: 'Inicia sesión para dar me gusta', code: 'auth_required' });
    }

    const exists = await query('SELECT id FROM comments WHERE id = $1 AND activo = TRUE', [id]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Comentario no encontrado' });

    const del = await query(
      'DELETE FROM comment_likes WHERE comment_id = $1 AND user_key = $2 RETURNING id',
      [id, userKey]
    );
    const liked = !del.rows[0];
    if (liked) {
      await query(
        'INSERT INTO comment_likes (comment_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userKey]
      );
    }

    const count = await query('SELECT COUNT(*)::int AS n FROM comment_likes WHERE comment_id = $1', [id]);
    const likes = count.rows[0].n;
    await query('UPDATE comments SET likes = $2 WHERE id = $1', [id, likes]);
    await publishEvent('comment_like', { id });

    res.json({ ok: true, my_like: liked, likes });
  } catch (e) { next(e); }
});

// DELETE /api/comments/:id  { userKey }  -> borra (lógico) solo el propio
r.delete('/comments/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Comentario inválido' });

    const userKey = normalizeUserKey(req.body?.userKey || req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const { rows } = await query('SELECT user_key FROM comments WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (rows[0].user_key !== userKey) return res.status(403).json({ error: 'No puedes eliminar este comentario' });

    await query('UPDATE comments SET activo = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    await publishEvent('comment_deleted', { id });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
