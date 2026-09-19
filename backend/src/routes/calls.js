import { Router } from 'express';
import { query } from '../db/pool.js';
import { publishEvent } from '../db/redis.js';

const r = Router();

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;
function normalizeUserKey(value) {
  const key = String(value || '').trim();
  return USER_KEY_RE.test(key) ? key : null;
}

async function resolveUser(userKey) {
  const k = String(userKey || '').trim().slice(0, 80);
  if (!k) return null;
  const { rows } = await query('SELECT user_key, usuario, nombre, avatar FROM users WHERE user_key = $1', [k]);
  return rows[0] || null;
}

function callIdOf(v) {
  const s = String(v || '').trim().slice(0, 60);
  return /^[A-Za-z0-9_.:-]{6,60}$/.test(s) ? s : null;
}

/**
 * GET /api/calls/ice
 * Devuelve los servidores ICE (STUN/TURN) configurados en el backend.
 * STUN siempre; TURN solo si hay variables de entorno.
 */
r.get('/ice', (req, res) => {
  const iceServers = [{ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  res.json({ iceServers });
});

// POST /api/calls/:otroKey/offer  { userKey, callId, tipo, sdp }
r.post('/:otroKey/offer', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const otro = await resolveUser(req.params.otroKey);
    const callId = callIdOf(req.body?.callId);
    const tipo = req.body?.tipo === 'video' ? 'video' : 'audio';
    const sdp = req.body?.sdp;
    if (!user || !otro || !callId || !sdp) return res.status(400).json({ error: 'Datos inválidos' });
    if (String(user.user_key) === String(otro.user_key)) return res.status(400).json({ error: 'No puedes llamarte' });

    await query(
      `INSERT INTO llamadas (call_id, de_key, para_key, tipo, estado)
       VALUES ($1, $2, $3, $4, 'sonando')
       ON CONFLICT (call_id) DO NOTHING`,
      [callId, user.user_key, otro.user_key, tipo]
    );
    await publishEvent('call_offer', {
      de: user.user_key, para: otro.user_key, callId, tipo, sdp,
      de_nombre: user.nombre || user.usuario || '', de_avatar: user.avatar || null,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/:otroKey/answer  { userKey, callId, sdp }
r.post('/:otroKey/answer', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!user || !callId || !req.body?.sdp) return res.status(400).json({ error: 'Datos inválidos' });
    await query(
      `UPDATE llamadas SET estado = 'activa', aceptada_at = NOW(), updated_at = NOW()
        WHERE call_id = $1 AND para_key = $2 AND estado = 'sonando'`,
      [callId, user.user_key]
    );
    await publishEvent('call_answer', { de: user.user_key, para: req.params.otroKey, callId, sdp: req.body.sdp });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/:otroKey/ice  { userKey, callId, candidate }
r.post('/:otroKey/ice', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    const candidate = req.body?.candidate;
    if (!user || !callId) return res.status(400).json({ error: 'Datos inválidos' });
    await publishEvent('call_ice', { de: user.user_key, para: req.params.otroKey, callId, candidate });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/:otroKey/reject  { userKey, callId }
r.post('/:otroKey/reject', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!user || !callId) return res.status(400).json({ error: 'Datos inválidos' });
    await query(
      `UPDATE llamadas SET estado = 'rechazada', finalizada_at = NOW(), updated_at = NOW()
        WHERE call_id = $1 AND estado IN ('sonando', 'activa')`,
      [callId]
    );
    await publishEvent('call_reject', { de: user.user_key, para: req.params.otroKey, callId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/:otroKey/hangup  { userKey, callId }
r.post('/:otroKey/hangup', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!user || !callId) return res.status(400).json({ error: 'Datos inválidos' });
    await query(
      `UPDATE llamadas
          SET estado = CASE WHEN estado = 'activa' THEN 'finalizada'
                            WHEN estado = 'sonando' THEN 'cancelada' ELSE estado END,
              duracion_seg = CASE WHEN aceptada_at IS NOT NULL
                                  THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - aceptada_at))::int)
                                  ELSE 0 END,
              finalizada_at = NOW(), updated_at = NOW()
        WHERE call_id = $1 AND estado IN ('sonando', 'activa')`,
      [callId]
    );
    await publishEvent('call_hangup', { de: user.user_key, para: req.params.otroKey, callId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
