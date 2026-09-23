import { Router } from 'express';
import { query } from '../db/pool.js';
import { cacheGet, cacheSet } from '../db/redis.js';

const r = Router();

// GET /api/community  (lista con caché 60s: cambia poco y la piden todas las visitas)
r.get('/', async (req, res, next) => {
  try {
    const ck = 'cache:community:list';
    const hit = await cacheGet(ck);
    if (hit) return res.json(hit);
    const { rows } = await query('SELECT * FROM community WHERE activo = TRUE ORDER BY id DESC LIMIT 200');
    const payload = { data: rows, total: rows.length };
    await cacheSet(ck, payload, 60);
    res.json(payload);
  } catch (e) { next(e); }
});

export default r;
