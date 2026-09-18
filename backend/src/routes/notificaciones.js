import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { publishEvent } from '../db/redis.js';

const r = Router();

const KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;

function normKey(value) {
  const k = String(value || '').trim();
  return KEY_RE.test(k) ? k : null;
}

/* ------------------------------------------------------------------
 * Helpers que usan las demás rutas para crear notificaciones.
 * ------------------------------------------------------------------ */

/** Crea una notificación. userKey NULL = aviso público del admin. */
export async function crearNotificacion({
  userKey = null,
  tipo = 'sistema',
  titulo,
  texto = null,
  url = null,
  icono = null,
  actor = null,
  meta = {},
} = {}) {
  try {
    if (!titulo) return null;
    const { rows } = await query(
      `INSERT INTO notificaciones
         (user_key, tipo, titulo, texto, url, icono, actor_key, actor_nombre, actor_avatar, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id`,
      [
        userKey || null,
        String(tipo || 'sistema').slice(0, 40),
        String(titulo).slice(0, 160),
        texto ? String(texto).slice(0, 500) : null,
        url ? String(url).slice(0, 300) : null,
        icono ? String(icono).slice(0, 40) : null,
        actor?.user_key || null,
        actor?.usuario || actor?.nombre || null,
        actor?.avatar || null,
        JSON.stringify(meta || {}),
      ]
    );
    try { await publishEvent('notificacion', { userKey, tipo }); } catch { /* redis opcional */ }
    return rows[0]?.id || null;
  } catch (err) {
    console.error('[notif] no se pudo crear:', err.message);
    return null;
  }
}

/** Notifica al dueño de algo, evitando que se auto-notifique. */
export async function notificarDueno(ownerKey, data = {}) {
  if (!ownerKey) return null;
  if (data.actor?.user_key && String(data.actor.user_key) === String(ownerKey)) return null;
  return crearNotificacion({ ...data, userKey: ownerKey });
}

/** Detecta @usuario en un texto y notifica a los mencionados. */
export async function notificarMenciones(texto, { actor = null, url = null, contexto = 'una publicación' } = {}) {
  const t = String(texto || '');
  const names = [...new Set(
    (t.match(/@([A-Za-z0-9_.-]{3,40})/g) || []).map((x) => x.slice(1).toLowerCase())
  )].slice(0, 20);
  if (!names.length) return;
  try {
    const { rows } = await query(
      'SELECT user_key, usuario, nombre FROM users WHERE lower(usuario) = ANY($1::text[]) LIMIT 50',
      [names]
    );
    for (const u of rows) {
      if (actor?.user_key && String(actor.user_key) === String(u.user_key)) continue;
      await crearNotificacion({
        userKey: u.user_key,
        tipo: 'mencion',
        titulo: `${actor?.usuario || actor?.nombre || 'Alguien'} te mencionó`,
        texto: `Te etiquetó en ${contexto}`,
        url,
        icono: 'at-outline',
        actor,
      });
    }
  } catch (err) {
    console.error('[notif] menciones:', err.message);
  }
}

/* ------------------------------------------------------------------
 * Lectura y estado (frontend)
 * ------------------------------------------------------------------ */

// GET /api/notificaciones?userKey=&limit=30
// Sin cuenta devuelve solo avisos públicos del admin.
r.get('/', async (req, res, next) => {
  try {
    const userKey = normKey(req.query.userKey);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 60);

    if (!userKey) {
      const { rows } = await query(
        `SELECT id, tipo, titulo, texto, url, icono, actor_nombre, actor_avatar, created_at
           FROM notificaciones
          WHERE user_key IS NULL AND tipo = 'admin'
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit]
      );
      return res.json({ data: rows.map((x) => ({ ...x, leida: false })), noLeidas: 0, guest: true });
    }

    const { rows } = await query(
      `SELECT n.id, n.user_key, n.tipo, n.titulo, n.texto, n.url, n.icono,
              n.actor_key, n.actor_nombre, n.actor_avatar, n.meta, n.created_at,
              (nl.id IS NOT NULL) AS leida
         FROM notificaciones n
         LEFT JOIN notificaciones_leidas nl
                ON nl.notificacion_id = n.id AND nl.user_key = $1
        WHERE n.user_key = $1 OR (n.user_key IS NULL AND n.tipo = 'admin')
        ORDER BY n.created_at DESC
        LIMIT $2`,
      [userKey, limit]
    );

    const { rows: cnt } = await query(
      `SELECT COUNT(*)::int AS n
         FROM notificaciones n
         LEFT JOIN notificaciones_leidas nl
                ON nl.notificacion_id = n.id AND nl.user_key = $1
        WHERE (n.user_key = $1 OR (n.user_key IS NULL AND n.tipo = 'admin'))
          AND nl.id IS NULL`,
      [userKey]
    );

    res.json({ data: rows, noLeidas: cnt[0]?.n || 0 });
  } catch (e) { next(e); }
});

// POST /api/notificaciones/:id/leer  { userKey }
r.post('/:id/leer', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const userKey = normKey(req.body?.userKey);
    if (!id || !userKey) return res.status(400).json({ error: 'Datos inválidos' });
    await query(
      `INSERT INTO notificaciones_leidas (user_key, notificacion_id)
       VALUES ($1, $2) ON CONFLICT (user_key, notificacion_id) DO NOTHING`,
      [userKey, id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/notificaciones/leer-todas  { userKey }
r.post('/leer-todas', async (req, res, next) => {
  try {
    const userKey = normKey(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    await query(
      `INSERT INTO notificaciones_leidas (user_key, notificacion_id)
       SELECT $1, n.id FROM notificaciones n
        WHERE n.user_key = $1 OR (n.user_key IS NULL AND n.tipo = 'admin')
       ON CONFLICT (user_key, notificacion_id) DO NOTHING`,
      [userKey]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------
 * Admin (Bearer): avisos públicos / principales
 * ------------------------------------------------------------------ */

// GET /api/notificaciones/admin
r.get('/admin', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, tipo, titulo, texto, url, icono, actor_nombre, actor_avatar, created_at
         FROM notificaciones
        WHERE user_key IS NULL AND tipo = 'admin'
        ORDER BY created_at DESC
        LIMIT 200`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/notificaciones/admin  { titulo, texto, url, icono }
r.post('/admin', authRequired, async (req, res, next) => {
  try {
    const b = req.body || {};
    const titulo = String(b.titulo || '').trim().slice(0, 160);
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    // Quién publica: el admin logueado (nombre), con el avatar del canal oficial.
    const adminNombre = String(req.admin?.nombre || req.admin?.usuario || 'Administrador').slice(0, 120);
    let actorAvatar = null;
    try {
      const ch = await query('SELECT avatar FROM channels WHERE nombre = $1 LIMIT 1', ['administrador pikante.pe']);
      actorAvatar = ch.rows[0]?.avatar || null;
    } catch { /* opcional */ }
    const { rows } = await query(
      `INSERT INTO notificaciones (user_key, tipo, titulo, texto, url, icono, actor_nombre, actor_avatar)
       VALUES (NULL, 'admin', $1, $2, $3, $4, $5, $6)
       RETURNING id, tipo, titulo, texto, url, icono, actor_nombre, actor_avatar, created_at`,
      [
        titulo,
        b.texto ? String(b.texto).trim().slice(0, 500) : null,
        b.url ? String(b.url).trim().slice(0, 300) : null,
        b.icono ? String(b.icono).trim().slice(0, 40) : 'megaphone-outline',
        adminNombre,
        actorAvatar,
      ]
    );
    try { await publishEvent('notificacion_admin', { id: rows[0].id }); } catch { /* redis opcional */ }
    res.status(201).json({ ok: true, notificacion: rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/notificaciones/admin/:id
r.delete('/admin/:id', authRequired, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Id inválido' });
    await query('DELETE FROM notificaciones WHERE id = $1 AND user_key IS NULL AND tipo = $2', [id, 'admin']);
    try { await publishEvent('notificacion_admin', { id }); } catch { /* redis opcional */ }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
