import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheDel } from '../db/redis.js';

const r = Router();

// GET /api/languages
r.get('/languages', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT code, nombre FROM languages WHERE activo = TRUE ORDER BY code');
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// GET /api/i18n/:lang  -> { "nav.inicio": "Inicio", ... }
r.get('/i18n/:lang', async (req, res, next) => {
  try {
    const lang = String(req.params.lang || 'es').slice(0, 5);
    const cached = await cacheGet(`cache:i18n:${lang}`);
    if (cached) return res.json(cached);

    const { rows } = await query('SELECT key, value FROM translations WHERE lang = $1', [lang]);
    const dict = {};
    for (const row of rows) dict[row.key] = row.value;

    await cacheSet(`cache:i18n:${lang}`, dict, 300);
    res.json(dict);
  } catch (e) { next(e); }
});

// PUT /api/i18n/:lang  (Bearer)  { "clave": "valor", ... }  -> upsert
r.put('/i18n/:lang', authRequired, async (req, res, next) => {
  try {
    const lang = String(req.params.lang || 'es').slice(0, 5);
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
      await query(
        `INSERT INTO translations (lang, key, value) VALUES ($1,$2,$3)
         ON CONFLICT (lang, key) DO UPDATE SET value = EXCLUDED.value`,
        [lang, key, String(value)]
      );
    }
    await cacheDel(`cache:i18n:${lang}`);
    res.json({ ok: true, updated: entries.length });
  } catch (e) { next(e); }
});

export default r;
