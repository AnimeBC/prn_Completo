import { Router } from 'express';
import { query } from '../db/pool.js';

const r = Router();

// GET /api/ajustes/sonido?userKey=  -> { activo, global }
// El sonido está activo por defecto para todos; el usuario puede desactivarlo.
r.get('/sonido', async (req, res, next) => {
  try {
    const { rows } = await query("SELECT valor FROM ajustes WHERE clave = 'sonido_activo'");
    const global = (rows[0]?.valor ?? 'true') !== 'false';
    let activo = global;
    const userKey = String(req.query.userKey || '').trim();
    if (userKey) {
      const u = await query('SELECT sonido_activo FROM users WHERE user_key = $1', [userKey]);
      if (u.rows[0] && u.rows[0].sonido_activo === false) activo = false;
    }
    res.json({ activo, global });
  } catch (e) { next(e); }
});

export default r;
