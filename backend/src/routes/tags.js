import { Router } from 'express';
import { query } from '../db/pool.js';

const r = Router();

// GET /api/tags
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, nombre, slug FROM tags ORDER BY nombre ASC');
    res.json({ data: rows.map((t) => t.nombre) });
  } catch (e) { next(e); }
});

export default r;
