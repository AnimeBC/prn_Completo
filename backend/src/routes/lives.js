import { Router } from 'express';
import { query } from '../db/pool.js';

const r = Router();

// GET /api/lives
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM lives WHERE activo = TRUE ORDER BY id DESC LIMIT 200');
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

export default r;
