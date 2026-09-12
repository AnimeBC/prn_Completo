import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { cacheGet, cacheSet } from '../db/redis.js';

const r = Router();

// GET /api/stats  (dashboard admin) — cacheado en Redis 60s
r.get('/', authRequired, async (req, res, next) => {
  try {
    const cached = await cacheGet('cache:stats');
    if (cached) return res.json({ ...cached, cached: true });

    const [videos, hentai, packs, community, lives, aportantes] = await Promise.all([
      query('SELECT COUNT(*)::int AS n FROM videos WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM hentai WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM packs WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM community WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM lives WHERE activo = TRUE'),
      query('SELECT COALESCE(SUM(monto_aporte),0)::float AS n FROM aportantes WHERE activo = TRUE'),
    ]);

    const data = {
      videos: videos.rows[0].n,
      hentai: hentai.rows[0].n,
      packs: packs.rows[0].n,
      community: community.rows[0].n,
      lives: lives.rows[0].n,
      aportes_total: aportantes.rows[0].n,
    };

    await cacheSet('cache:stats', data, 60);
    res.json(data);
  } catch (e) { next(e); }
});

export default r;
