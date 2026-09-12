import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado: token faltante' });

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}
