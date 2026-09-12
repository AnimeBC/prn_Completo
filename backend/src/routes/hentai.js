import { Router } from 'express';
import { query } from '../db/pool.js';

const r = Router();

// GET /api/hentai
r.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM hentai WHERE activo = TRUE ORDER BY id DESC LIMIT 200');
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

// GET /api/hentai/:id
r.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Hentai no encontrado' });
    const { rows } = await query('SELECT * FROM hentai WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Hentai no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

export default r;
