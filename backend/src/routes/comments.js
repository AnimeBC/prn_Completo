import { Router } from 'express';
import { query } from '../db/pool.js';

const r = Router();

// GET /api/videos/:id/comments  -> árbol de comentarios
r.get('/videos/:id/comments', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, video_id, usuario, texto, likes, parent_id, created_at
         FROM comments
        WHERE video_id = $1 AND activo = TRUE
        ORDER BY likes DESC, created_at DESC`,
      [req.params.id]
    );
    const byId = new Map();
    const roots = [];
    for (const c of rows) byId.set(c.id, { ...c, replies: [] });
    for (const c of rows) {
      if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id).replies.push(byId.get(c.id));
      else roots.push(byId.get(c.id));
    }
    res.json({ data: roots, total: rows.length });
  } catch (e) { next(e); }
});

// POST /api/videos/:id/comments  { usuario, texto, parent_id }
r.post('/videos/:id/comments', async (req, res, next) => {
  try {
    const { usuario = 'Anónimo', texto, parent_id = null } = req.body || {};
    if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto requerido' });
    const { rows } = await query(
      `INSERT INTO comments (video_id, usuario, texto, parent_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, usuario, String(texto).trim(), parent_id]
    );
    res.status(201).json({ ...rows[0], replies: [] });
  } catch (e) { next(e); }
});

export default r;
