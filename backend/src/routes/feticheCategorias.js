import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { slugify } from '../utils/slug.js';
import { cacheGet, cacheSet, cacheDel } from '../db/redis.js';

const r = Router();

// GET /api/fetiche-categorias
r.get('/', async (req, res, next) => {
  try {
    const cached = await cacheGet('cache:fetiche-categorias');
    if (cached) return res.json({ data: cached });
    const { rows } = await query('SELECT id, nombre, slug FROM fetiche_categorias WHERE activo = TRUE ORDER BY nombre ASC');
    await cacheSet('cache:fetiche-categorias', rows.map((c) => c.nombre), 120);
    res.json({ data: rows.map((c) => c.nombre) });
  } catch (e) { next(e); }
});

// POST /api/fetiche-categorias  (Bearer)  { categoria }
r.post('/', authRequired, async (req, res, next) => {
  try {
    const nombre = String(req.body?.categoria || '').trim();
    if (!nombre) return res.status(400).json({ error: 'categoria requerida' });
    const slug = slugify(nombre);
    const { rows } = await query(
      `INSERT INTO fetiche_categorias (nombre, slug)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id, nombre, slug`,
      [nombre, slug]
    );
    await cacheDel('cache:fetiche-categorias');
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

export default r;
