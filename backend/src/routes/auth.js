import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { publishEvent, cacheDel } from '../db/redis.js';

const r = Router();

// POST /api/auth/login  { usuario, password }  (usuario puede ser usuario o email)
r.post('/login', async (req, res, next) => {
  try {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const { rows } = await query(
      `SELECT id, usuario, email, password_hash, nombre, rol, activo
         FROM admins
        WHERE usuario = $1 OR email = $1
        LIMIT 1`,
      [String(usuario).trim()]
    );

    const admin = rows[0];
    // mensaje genérico para no filtrar si el usuario existe
    if (!admin || !admin.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const ok = await bcrypt.compare(String(password), admin.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    await query('UPDATE admins SET ultimo_login = NOW() WHERE id = $1', [admin.id]);

    // notifica al sistema (frontend) vía Redis pub/sub
    await cacheDel('cache:stats');
    await publishEvent('admin_login', { id: admin.id, usuario: admin.usuario, rol: admin.rol });

    const token = jwt.sign(
      { id: admin.id, usuario: admin.usuario, rol: admin.rol, nombre: admin.nombre },
      env.jwtSecret,
      { expiresIn: env.jwtExpires }
    );

    res.json({
      ok: true,
      token,
      admin: { id: admin.id, usuario: admin.usuario, email: admin.email, nombre: admin.nombre, rol: admin.rol },
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me  (Bearer token)
r.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, usuario, email, nombre, rol, ultimo_login FROM admins WHERE id = $1',
      [req.admin.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Admin no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

export default r;
