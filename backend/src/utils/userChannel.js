import { query } from '../db/pool.js';
import { channelSlug } from './slug.js';

/**
 * Garantiza que el usuario tenga su canal/perfil público (vacío si aún no sube nada).
 * Es idempotente: si ya existe, lo devuelve.
 */
export async function ensureUserChannel(user) {
  if (!user || !user.user_key) return null;
  const ex = await query('SELECT id, slug, nombre FROM channels WHERE user_key = $1 LIMIT 1', [user.user_key]);
  if (ex.rows[0]) return ex.rows[0];

  const base = String(user.nombre || user.usuario || 'Usuario').trim().slice(0, 80) || 'Usuario';
  const suffix = String(user.user_key).replace(/[^a-z0-9]/gi, '').slice(-5) || String(Date.now()).slice(-5);
  let nombre = base;
  let slug = channelSlug(base) || `usuario-${suffix}`;

  const dup = await query('SELECT 1 FROM channels WHERE nombre = $1 OR slug = $2 LIMIT 1', [nombre, slug]);
  if (dup.rows[0]) {
    nombre = `${base} ${suffix}`;
    slug = `${slug}-${suffix}`;
  }

  await query(
    `INSERT INTO channels (nombre, slug, user_key) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [nombre, slug, user.user_key]
  );
  const row = await query('SELECT id, slug, nombre FROM channels WHERE user_key = $1 LIMIT 1', [user.user_key]);
  return row.rows[0] || null;
}
