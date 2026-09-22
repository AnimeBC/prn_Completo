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
 * Mensaje de sistema en el chat con el resumen de una llamada.
 * Formato del texto: "llamada|<tipo>|<seg>|<estado>|<autorKey>"
 *   tipo: audio | video     estado: finalizada | cancelada | rechazada | perdida
 * El frontend lo formatea; asi no se guarda texto legible duplicado.
 */
function textoLlamada(tipo, seg, estado, autorKey) {
  const t = tipo === 'video' ? 'video' : 'audio';
  const s = Math.max(0, Math.min(86399, Number(seg) || 0));
  const e = ['finalizada', 'cancelada', 'rechazada', 'perdida'].includes(estado) ? estado : 'finalizada';
  return `llamada|${t}|${s}|${e}|${autorKey}`;
}

/** Inserta el aviso de llamada en el chat de un grupo y lo emite por Redis. */
async function avisoLlamadaGrupo(comunidadId, autorKey, tipo, seg, estado) {
  try {
    const u = await resolveUser(autorKey);
    if (!u) return;
    const ins = await query(
      `INSERT INTO comunidad_mensajes (comunidad_id, user_key, usuario, avatar, texto, tipo)
       VALUES ($1, $2, $3, $4, $5, 'sistema')
       RETURNING id`,
      [comunidadId, autorKey, u.nombre || u.usuario || '', u.avatar || null, textoLlamada(tipo, seg, estado, autorKey)]
    );
    await publishEvent('comunidad_mensaje', { id: ins.rows[0].id, comunidad_id: comunidadId, de: autorKey });
  } catch (e) {
    if (process.env.DEBUG_CALLS) console.log('[calls] avisoLlamadaGrupo error', e?.message);
  }
}

/** Inserta el aviso de llamada en el DM entre dos usuarios y lo emite por Redis. */
async function avisoLlamadaDm(deKey, paraKey, tipo, seg, estado) {
  try {
    const [x, y] = String(deKey) < String(paraKey) ? [String(deKey), String(paraKey)] : [String(paraKey), String(deKey)];
    let conv = await query('SELECT * FROM dm_conversaciones WHERE a_key = $1 AND b_key = $2', [x, y]);
    if (!conv.rows[0]) {
      conv = await query(
        'INSERT INTO dm_conversaciones (a_key, b_key) VALUES ($1, $2) ON CONFLICT (a_key, b_key) DO UPDATE SET updated_at = NOW() RETURNING *',
        [x, y]
      );
    }
    const u = await resolveUser(deKey);
    if (!u) return;
    const ins = await query(
      `INSERT INTO dm_mensajes (conversacion_id, user_key, usuario, avatar, texto, tipo)
       VALUES ($1, $2, $3, $4, $5, 'sistema')
       RETURNING id`,
      [conv.rows[0].id, deKey, u.nombre || u.usuario || '', u.avatar || null, textoLlamada(tipo, seg, estado, deKey)]
    );
    await publishEvent('comunidad_dm', { id: ins.rows[0].id, conversacion_id: conv.rows[0].id, de: deKey, para: paraKey });
  } catch (e) {
    if (process.env.DEBUG_CALLS) console.log('[calls] avisoLlamadaDm error', e?.message);
  }
}

/**
 * GET /api/calls/ice
 * Devuelve los servidores ICE (STUN/TURN) configurados en el backend.
 * STUN siempre; TURN solo si hay variables de entorno.
 */
r.get('/ice', (req, res) => {
  const stun = process.env.STUN_URL || 'stun:stun.l.google.com:19302';
  const iceServers = [
    { urls: stun },
    // STUN extra de respaldo (mejora el descubrimiento de la mejor ruta).
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  // TURN publico de respaldo SOLO si no hay uno propio configurado.
  // Sirve para pruebas; en produccion conviene un TURN propio (coturn).
  if (!process.env.TURN_URL && process.env.TURN_PUBLIC_FALLBACK === '1') {
    iceServers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: [
        process.env.TURN_URL,
        `${process.env.TURN_URL}?transport=tcp`,
      ],
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

    // Solo amigos (amistad aceptada) pueden llamarse 1 a 1.
    const [a, b] = String(user.user_key) < String(otro.user_key)
      ? [String(user.user_key), String(otro.user_key)]
      : [String(otro.user_key), String(user.user_key)];
    const amistad = await query(
      "SELECT 1 FROM amistades WHERE a_key = $1 AND b_key = $2 AND estado = 'aceptado'",
      [a, b]
    );
    if (!amistad.rows[0]) {
      return res.status(403).json({ error: 'Solo puedes llamar a tus amigos' });
    }

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
    // Sincroniza todas las pestanas de ambos (una sola llamada a la vez).
    await publishEvent('call_state', { de: user.user_key, para: otro.user_key, callId, estado: 'sonando', quien: user.user_key });
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
    // Sincroniza TODAS las pestanas de ambos usuarios (cerrar modales abiertos).
    await publishEvent('call_state', { de: user.user_key, para: req.params.otroKey, callId, estado: 'activa', quien: user.user_key });
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
    const upd = await query(
      `UPDATE llamadas SET estado = 'rechazada', finalizada_at = NOW(), updated_at = NOW(),
              duracion_seg = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(aceptada_at, iniciada_at)))::int)
        WHERE call_id = $1 AND estado IN ('sonando', 'activa')
        RETURNING de_key, para_key, tipo, duracion_seg`,
      [callId]
    );
    // Aviso de sistema en el chat (rechazada), solo si la llamada seguia abierta.
    const row = upd.rows[0];
    if (row) await avisoLlamadaDm(row.de_key, row.para_key, row.tipo, row.duracion_seg, 'rechazada');
    await publishEvent('call_reject', { de: user.user_key, para: req.params.otroKey, callId });
    await publishEvent('call_state', { de: user.user_key, para: req.params.otroKey, callId, estado: 'rechazada', quien: user.user_key });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/:otroKey/hangup  { userKey, callId }
r.post('/:otroKey/hangup', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!user || !callId) return res.status(400).json({ error: 'Datos inválidos' });
    const upd = await query(
      `UPDATE llamadas
          SET estado = CASE WHEN estado = 'activa' THEN 'finalizada'
                            WHEN estado = 'sonando' THEN 'cancelada' ELSE estado END,
              duracion_seg = CASE WHEN aceptada_at IS NOT NULL
                                  THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - aceptada_at))::int)
                                  ELSE 0 END,
              finalizada_at = NOW(), updated_at = NOW()
        WHERE call_id = $1 AND estado IN ('sonando', 'activa')
        RETURNING de_key, para_key, tipo, estado, duracion_seg`,
      [callId]
    );
    // Aviso de sistema en el chat 1 a 1 (una sola vez, cuando la llamada se cierra).
    const row = upd.rows[0];
    if (row) {
      const estado = row.estado === 'activa' || row.estado === 'finalizada' ? 'finalizada' : 'cancelada';
      await avisoLlamadaDm(row.de_key, row.para_key, row.tipo, row.duracion_seg, estado);
    }
    await publishEvent('call_hangup', { de: user.user_key, para: req.params.otroKey, callId });
    await publishEvent('call_state', { de: user.user_key, para: req.params.otroKey, callId, estado: 'finalizada', quien: user.user_key });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============================================================
// LLAMADAS GRUPALES (salas en malla P2P)
// ============================================================

function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/calls/grupo/:comunidadId/activa?userKey=
// Devuelve la sala activa del grupo (si hay) para auto-unirse.
// Limpia salas abandonadas (sin participantes unidos o muy antiguas).
r.get('/grupo/:comunidadId/activa', async (req, res, next) => {
  try {
    const comunidadId = intOrNull(req.params.comunidadId);
    if (!comunidadId) return res.json({ sala: null });

    // Cierra salas sin ningun participante unido (nadie en la sala).
    await query(
      `UPDATE llamada_grupo_salas s SET estado = 'finalizada', updated_at = NOW()
        WHERE s.comunidad_id = $1 AND s.estado IN ('sonando', 'activa')
          AND NOT EXISTS (
            SELECT 1 FROM llamada_grupo_participantes p
             WHERE p.call_id = s.call_id AND p.estado = 'unido'
          )`,
      [comunidadId]
    );

    const { rows } = await query(
      `SELECT s.*, (
         SELECT COUNT(*)::int FROM llamada_grupo_participantes p
          WHERE p.call_id = s.call_id AND p.estado = 'unido'
       ) AS participantes
         FROM llamada_grupo_salas s
        WHERE s.comunidad_id = $1 AND s.estado IN ('sonando', 'activa')
        ORDER BY s.created_at DESC LIMIT 1`,
      [comunidadId]
    );
    res.json({ sala: rows[0] || null });
  } catch (e) { next(e); }
});

// POST /api/calls/grupo/:comunidadId/iniciar  { userKey, tipo, callId }
// Solo un miembro del grupo puede iniciar. Notifica a los demas miembros.
r.post('/grupo/:comunidadId/iniciar', async (req, res, next) => {
  try {
    const comunidadId = intOrNull(req.params.comunidadId);
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    const tipo = req.body?.tipo === 'video' ? 'video' : 'audio';
    if (!comunidadId || !user || !callId) return res.status(400).json({ error: 'Datos inválidos' });

    const g = await query('SELECT id, nombre, user_key FROM comunidades WHERE id = $1 AND activo = TRUE', [comunidadId]);
    if (!g.rows[0]) return res.status(404).json({ error: 'Comunidad no encontrada' });
    const miembro = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [comunidadId, user.user_key]);
    if (!miembro.rows[0] && String(g.rows[0].user_key || '') !== String(user.user_key)) {
      return res.status(403).json({ error: 'Solo miembros pueden iniciar la llamada' });
    }

    // Solo UNA llamada por grupo a la vez: si la activa es de OTRO, rechaza
    // (para unirse hay el endpoint /unirse). Si es mia, se reinicia.
    const act = await query(
      `SELECT * FROM llamada_grupo_salas
        WHERE comunidad_id = $1 AND estado IN ('sonando', 'activa')
        ORDER BY created_at DESC LIMIT 1`,
      [comunidadId]
    );
    if (act.rows[0] && String(act.rows[0].iniciador_key) !== String(user.user_key)) {
      if (process.env.DEBUG_CALLS) console.log('[calls] iniciar rechazado: llamada de otro', act.rows[0].call_id);
      return res.status(409).json({ error: 'Ya hay una llamada en curso en este grupo' });
    }
    // Cierra solo salas previas mias (reinicio) y avisa (cierra modales viejos).
    const cerradas = await query(
      `UPDATE llamada_grupo_salas SET estado = 'finalizada', updated_at = NOW()
        WHERE comunidad_id = $1 AND estado IN ('sonando', 'activa') AND iniciador_key = $2
        RETURNING call_id`,
      [comunidadId, user.user_key]
    );
    for (const row of cerradas.rows) {
      await publishEvent('call_grupo_end', { conv: comunidadId, callId: row.call_id, de: user.user_key });
    }
    await query(
      `INSERT INTO llamada_grupo_salas (call_id, comunidad_id, iniciador_key, tipo, estado)
       VALUES ($1, $2, $3, $4, 'sonando')
       ON CONFLICT (call_id) DO UPDATE SET estado = 'sonando', updated_at = NOW()`,
      [callId, comunidadId, user.user_key, tipo]
    );
    await query(
      `INSERT INTO llamada_grupo_participantes (call_id, user_key, estado, joined_at)
       VALUES ($1, $2, 'unido', NOW())
       ON CONFLICT (call_id, user_key) DO UPDATE SET estado = 'unido', joined_at = NOW()`,
      [callId, user.user_key]
    );

    // Solo los miembros del grupo deben recibir el aviso de llamada.
    const mem = await query(
      `SELECT user_key FROM comunidad_miembros WHERE comunidad_id = $1
        UNION SELECT $2::varchar`,
      [comunidadId, g.rows[0].user_key || user.user_key]
    );
    const miembros = mem.rows.map((r) => String(r.user_key));

    await publishEvent('call_grupo_start', {
      conv: comunidadId, callId, tipo, de: user.user_key,
      de_nombre: user.nombre || user.usuario || '', de_avatar: user.avatar || null,
      grupo_nombre: g.rows[0].nombre, miembros,
    });
    if (process.env.DEBUG_CALLS) console.log('[calls] iniciar', { comunidadId, callId, tipo, de: user.user_key, nMiembros: miembros.length });
    res.json({ ok: true, callId, iniciador: user.user_key, tipo });
  } catch (e) { next(e); }
});

// POST /api/calls/grupo/:comunidadId/unirse  { userKey, callId }
// Obligatorio antes de señalizar con los demas peers de la sala.
r.post('/grupo/:comunidadId/unirse', async (req, res, next) => {
  try {
    const comunidadId = intOrNull(req.params.comunidadId);
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!comunidadId || !user || !callId) return res.status(400).json({ error: 'Datos inválidos' });

    const sala = await query(
      "SELECT * FROM llamada_grupo_salas WHERE call_id = $1 AND comunidad_id = $2 AND estado IN ('sonando', 'activa')",
      [callId, comunidadId]
    );
    if (!sala.rows[0]) {
      if (process.env.DEBUG_CALLS) console.log('[calls] unirse: sala no activa', { callId, comunidadId, de: user.user_key });
      return res.status(404).json({ error: 'La llamada ya no está activa' });
    }

    await query(
      `INSERT INTO llamada_grupo_participantes (call_id, user_key, estado, joined_at)
       VALUES ($1, $2, 'unido', NOW())
       ON CONFLICT (call_id, user_key) DO UPDATE SET estado = 'unido', joined_at = NOW()`,
      [callId, user.user_key]
    );
    await query(
      "UPDATE llamada_grupo_salas SET updated_at = NOW(), estado = CASE WHEN estado = 'sonando' THEN 'activa' ELSE estado END WHERE call_id = $1",
      [callId]
    );
    const activos = await query(
      `SELECT p.user_key,
              COALESCE(u.nombre, u.usuario, '') AS usuario,
              u.avatar
         FROM llamada_grupo_participantes p
         LEFT JOIN users u ON u.user_key = p.user_key
        WHERE p.call_id = $1 AND p.estado = 'unido'`,
      [callId]
    );
    await publishEvent('call_grupo_join', {
      conv: comunidadId, callId, de: user.user_key,
      de_nombre: user.nombre || user.usuario || '', de_avatar: user.avatar || null,
    });
    if (process.env.DEBUG_CALLS) console.log('[calls] unirse', {
      comunidadId, callId, de: user.user_key,
      participantes: activos.rows.map((r) => r.user_key),
      iniciador: sala.rows[0].iniciador_key,
    });
    res.json({
      ok: true,
      participantes: activos.rows,
      iniciador: sala.rows[0].iniciador_key,
      tipo: sala.rows[0].tipo,
    });
  } catch (e) { next(e); }
});

// POST /api/calls/grupo/:comunidadId/salir  { userKey, callId }
r.post('/grupo/:comunidadId/salir', async (req, res, next) => {
  try {
    const comunidadId = intOrNull(req.params.comunidadId);
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    if (!comunidadId || !user || !callId) return res.status(400).json({ error: 'Datos inválidos' });

    await query(
      "UPDATE llamada_grupo_participantes SET estado = 'salido' WHERE call_id = $1 AND user_key = $2",
      [callId, user.user_key]
    );
    // Si no quedan participantes unidos, la sala se finaliza.
    const restantes = await query(
      "SELECT COUNT(*)::int AS n FROM llamada_grupo_participantes WHERE call_id = $1 AND estado = 'unido'",
      [callId]
    );
    if (!restantes.rows[0].n) {
      // Duracion real: desde el primer participante que se unio.
      const ini = await query(
        "SELECT MIN(joined_at) AS t FROM llamada_grupo_participantes WHERE call_id = $1 AND joined_at IS NOT NULL",
        [callId]
      );
      const cerr = await query(
        `UPDATE llamada_grupo_salas
            SET estado = 'finalizada', updated_at = NOW(),
                duracion_seg = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE($2::timestamp, created_at)))::int),
                motivo = 'finalizada'
          WHERE call_id = $1
          RETURNING comunidad_id, iniciador_key, tipo, duracion_seg`,
        [callId, ini.rows[0]?.t || null]
      );
      // Aviso en el chat del grupo (una sola vez, al terminar la llamada).
      const s = cerr.rows[0];
      if (s) {
        // Hubo mas de un participante alguna vez? -> finalizada; si no, cancelada.
        const total = await query(
          "SELECT COUNT(*)::int AS n FROM llamada_grupo_participantes WHERE call_id = $1",
          [callId]
        );
        const estado = (total.rows[0]?.n || 0) > 1 ? 'finalizada' : 'cancelada';
        await avisoLlamadaGrupo(s.comunidad_id, s.iniciador_key, s.tipo, s.duracion_seg, estado);
      }
      // Sala finalizada del todo: avisa para cerrar el modal entrante en todos.
      await publishEvent('call_grupo_end', { conv: comunidadId, callId, de: user.user_key });
    } else {
      await publishEvent('call_grupo_leave', { conv: comunidadId, callId, de: user.user_key });
    }
    if (process.env.DEBUG_CALLS) console.log('[calls] salir', { comunidadId, callId, de: user.user_key, quedan: restantes.rows[0].n });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/calls/grupo/:comunidadId/signal  { userKey, callId, paraKey, kind, data }
// Reenvía offer/answer/ice a un peer concreto de la sala.
r.post('/grupo/:comunidadId/signal', async (req, res, next) => {
  try {
    const comunidadId = intOrNull(req.params.comunidadId);
    const user = await resolveUser(req.body?.userKey);
    const callId = callIdOf(req.body?.callId);
    const paraKey = String(req.body?.paraKey || '').trim();
    const kind = String(req.body?.kind || '');
    if (!comunidadId || !user || !callId || !paraKey) return res.status(400).json({ error: 'Datos inválidos' });
    if (!['offer', 'answer', 'ice', 'cam'].includes(kind)) return res.status(400).json({ error: 'kind inválido' });

    // Mantiene viva la sala mientras hay senalizacion.
    await query(
      "UPDATE llamada_grupo_salas SET updated_at = NOW() WHERE call_id = $1 AND estado IN ('sonando', 'activa')",
      [callId]
    );

    await publishEvent('call_grupo_signal', {
      conv: comunidadId, callId, kind,
      de: user.user_key, para: paraKey,
      sdp: req.body?.sdp || null,
      candidate: req.body?.candidate || null,
    });
    if (process.env.DEBUG_CALLS) console.log('[calls] signal', { kind, de: user.user_key, para: paraKey, callId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
