import { Router } from 'express';
import { query } from '../db/pool.js';
import { publishEvent, redis } from '../db/redis.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;
const COLA = 'match:cola';
const ENTRADA = 'match:entrada';
const ACTIVO = 'match:activo';
const PAR = 'match:par';
const GENEROS = ['mujer', 'hombre', 'otro', 'no'];

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

function matchIdOf(v) {
  const s = String(v || '').trim().slice(0, 60);
  return /^[A-Za-z0-9_.:-]{6,60}$/.test(s) ? s : null;
}

function nombreDe(user) {
  return user.nombre || user.usuario || 'Anonimo';
}

function clampEdad(v, def) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(99, Math.max(18, n));
}

function normalizaBusca(body) {
  const b = body && typeof body === 'object' ? body : {};
  const genero = GENEROS.includes(String(b.genero || '')) || b.genero === 'any'
    ? String(b.genero)
    : 'any';
  let edadMin = clampEdad(b.edadMin, 18);
  let edadMax = clampEdad(b.edadMax, 99);
  if (edadMin > edadMax) [edadMin, edadMax] = [edadMax, edadMin];
  const intereses = Array.isArray(b.intereses)
    ? b.intereses.slice(0, 12).map((s) => String(s || '').trim().slice(0, 40)).filter(Boolean)
    : [];
  return { genero, edadMin, edadMax, intereses };
}

async function cargarPerfil(userKey) {
  try {
    const { rows } = await query(
      'SELECT edad, genero, intereses FROM match_perfiles WHERE user_key = $1',
      [userKey],
    );
    const row = rows[0];
    if (!row) return null;
    let intereses = [];
    try { intereses = JSON.parse(row.intereses || '[]'); } catch { intereses = []; }
    return { edad: row.edad, genero: row.genero, intereses: Array.isArray(intereses) ? intereses : [] };
  } catch {
    return null;
  }
}

function entradaCola(user, perfil, busca) {
  return JSON.stringify({
    userKey: user.user_key,
    nombre: nombreDe(user),
    avatar: user.avatar || null,
    at: Date.now(),
    edad: perfil.edad,
    genero: perfil.genero,
    busca,
  });
}

function parseEntrada(raw) {
  try {
    const e = JSON.parse(raw);
    if (!e || typeof e.userKey !== 'string') return null;
    if (Date.now() - Number(e.at || 0) > 90000) return null;
    if (!Number(e.edad) || !e.genero) return null;
    return e;
  } catch {
    return null;
  }
}

// Filtros duros: edad mutua + género deseado + intereses si ambos eligieron.
function compatible(a, b) {
  if (!a || !b) return false;
  if (!a.edad || !b.edad || !a.genero || !b.genero) return false;
  const ba = a.busca || {};
  const bb = b.busca || {};
  const gA = ba.genero || 'any';
  const gB = bb.genero || 'any';
  if (gA !== 'any' && gA !== b.genero) return false;
  if (gB !== 'any' && gB !== a.genero) return false;
  const aMin = Number(ba.edadMin) || 18;
  const aMax = Number(ba.edadMax) || 99;
  const bMin = Number(bb.edadMin) || 18;
  const bMax = Number(bb.edadMax) || 99;
  if (b.edad < aMin || b.edad > aMax) return false;
  if (a.edad < bMin || a.edad > bMax) return false;
  const iA = Array.isArray(ba.intereses) ? ba.intereses : [];
  const iB = Array.isArray(bb.intereses) ? bb.intereses : [];
  if (iA.length && iB.length) {
    const set = new Set(iA.map((s) => String(s).toLowerCase()));
    if (!iB.some((s) => set.has(String(s).toLowerCase()))) return false;
  }
  return true;
}

async function matchActivo(userKey) {
  try { return (await redis.hGet(ACTIVO, userKey)) || null; } catch { return null; }
}

async function marcarActivo(userKey, matchId) {
  try {
    await redis.hSet(ACTIVO, userKey, matchId);
    await redis.expire(ACTIVO, 600);
  } catch { /* opcional */ }
}

async function desmarcarActivo(userKey) {
  try { await redis.hDel(ACTIVO, userKey); } catch { /* opcional */ }
}

async function guardarPar(matchId, a, b) {
  try {
    await redis.hSet(PAR, matchId, JSON.stringify({ a, b }));
    await redis.expire(PAR, 600);
  } catch { /* opcional */ }
}

async function leerPar(matchId) {
  try {
    const raw = await redis.hGet(PAR, matchId);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.a && p.b ? p : null;
  } catch { return null; }
}

async function borrarPar(matchId) {
  try { await redis.hDel(PAR, matchId); } catch { /* opcional */ }
}

async function olvidarEntrada(userKey) {
  try {
    const raw = await redis.hGet(ENTRADA, userKey);
    if (raw) {
      await redis.lRem(COLA, 0, raw);
      await redis.hDel(ENTRADA, userKey);
    }
  } catch { /* opcional */ }
}

async function contarCola() {
  try {
    const items = await redis.lRange(COLA, 0, -1);
    return (items || []).filter((raw) => parseEntrada(raw)).length;
  } catch { return 0; }
}

async function contarMatchesHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  try { return Number(await redis.get(`match:count:${hoy}`) || 0); } catch { return 0; }
}

async function bumpMatchesHoy() {
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const k = `match:count:${hoy}`;
    await redis.incr(k);
    await redis.expire(k, 60 * 60 * 48);
  } catch { /* opcional */ }
}

async function publicarFound(matchId, a, b) {
  await publishEvent('match_found', {
    para: a.userKey, matchId, ofertante: false,
    peerKey: b.userKey, peerNombre: b.nombre, peerAvatar: b.avatar,
  });
  await publishEvent('match_found', {
    para: b.userKey, matchId, ofertante: true,
    peerKey: a.userKey, peerNombre: a.nombre, peerAvatar: a.avatar,
  });
  await marcarActivo(a.userKey, matchId);
  await marcarActivo(b.userKey, matchId);
  await guardarPar(matchId, a.userKey, b.userKey);
  await bumpMatchesHoy();
}

async function publicarEnd(para, matchId, motivo) {
  await publishEvent('match_end', { para, matchId, motivo });
}

async function conLock(fn) {
  for (let i = 0; i < 40; i++) {
    try {
      const ok = await redis.set('match:lock', '1', { NX: true, PX: 3000 });
      if (ok) {
        try { return await fn(); } finally {
          try { await redis.del('match:lock'); } catch { /* opcional */ }
        }
      }
    } catch { break; }
    await new Promise((res) => setTimeout(res, 25 + Math.floor(Math.random() * 25)));
  }
  return fn();
}

// Bajo lock: primero intenta emparejar con alguien compatible ya en cola;
// si no, se encola. Asi dos entradas simultaneas nunca se cruzan.
async function intentarEmparejar(user, perfil, busca) {
  const propio = await matchActivo(user.user_key);
  if (propio) return { estado: 'emparejado', matchId: propio };

  return conLock(async () => {
    const luego = await matchActivo(user.user_key);
    if (luego) return { estado: 'emparejado', matchId: luego };

    const mia = entradaCola(user, perfil, busca);
    const miaParsed = JSON.parse(mia);
    const descartados = [];
    let ajena = null;
    let fallback = null; // primera entrada valida incompatible (respaldo)
    let gente = 0;

    for (let i = 0; i < 30 && !ajena; i++) {
      let raw = null;
      try { raw = await redis.lPop(COLA); } catch { raw = null; }
      if (raw == null) break;
      const e = parseEntrada(raw);
      if (!e) continue;
      if (e.userKey === user.user_key) {
        try { await redis.hDel(ENTRADA, user.user_key); } catch { /* opcional */ }
        continue;
      }
      gente++;
      if (compatible(miaParsed, e)) { ajena = e; break; }
      if (!fallback) fallback = { raw, e };
      else descartados.push(raw);
    }

    // Sin pareja compatible: se asocia con cualquiera (fallback) en vez de
    // esperar indefinidamente; los filtros siguen siendo una preferencia.
    const elegido = ajena || (fallback ? fallback.e : null);

    for (const raw of descartados) {
      try { await redis.rPush(COLA, raw); } catch { /* opcional */ }
    }
    // El fallback solo vuelve a la cola si no se llego a elegir.
    if (ajena && fallback) {
      try { await redis.rPush(COLA, fallback.raw); } catch { /* opcional */ }
    }

    if (!elegido) {
      try {
        await redis.rPush(COLA, mia);
        await redis.hSet(ENTRADA, user.user_key, mia);
        await redis.expire(ENTRADA, 120);
      } catch { /* opcional */ }
      return { estado: 'esperando', sinCompat: gente > 0 };
    }

    await olvidarEntrada(user.user_key);
    // La entrada elegida (ajena o fallback) ya salio de la cola con lPop.

    const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await publicarFound(matchId, {
      userKey: elegido.userKey, nombre: elegido.nombre, avatar: elegido.avatar,
    }, {
      userKey: user.user_key, nombre: nombreDe(user), avatar: user.avatar || null,
    });
    return { estado: 'emparejado', matchId, peer: elegido.userKey };
  });
}

// POST /api/match/perfil  { userKey, edad, genero, intereses }
r.post('/perfil', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(400).json({ error: 'Datos invalidos' });
    const edad = clampEdad(req.body?.edad, NaN);
    if (Number.isNaN(edad)) return res.status(400).json({ error: 'Edad invalida (18-99)' });
    const genero = GENEROS.includes(String(req.body?.genero || '')) ? String(req.body.genero) : 'no';
    const intereses = Array.isArray(req.body?.intereses)
      ? req.body.intereses.slice(0, 12).map((s) => String(s || '').trim().slice(0, 40)).filter(Boolean)
      : [];
    await query(
      `INSERT INTO match_perfiles (user_key, edad, genero, intereses, actualizado_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_key) DO UPDATE
         SET edad = EXCLUDED.edad, genero = EXCLUDED.genero,
             intereses = EXCLUDED.intereses, actualizado_at = NOW()`,
      [user.user_key, edad, genero, JSON.stringify(intereses)],
    );
    res.json({ ok: true, perfil: { edad, genero, intereses } });
  } catch (e) { next(e); }
});

// GET /api/match/perfil?userKey=
r.get('/perfil', async (req, res, next) => {
  try {
    const k = normalizeUserKey(req.query.userKey);
    if (!k) return res.status(400).json({ error: 'Datos invalidos' });
    const perfil = await cargarPerfil(k);
    res.json({ perfil });
  } catch (e) { next(e); }
});

// POST /api/match/entrar  { userKey, filtros: {genero, edadMin, edadMax, intereses} }
r.post('/entrar', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(400).json({ error: 'Datos invalidos' });
    const perfil = await cargarPerfil(user.user_key);
    if (!perfil) return res.status(400).json({ error: 'perfil_incompleto' });
    const busca = normalizaBusca(req.body?.filtros);
    const resultado = await intentarEmparejar(user, perfil, busca);
    res.json({ ok: true, ...resultado });
  } catch (e) { next(e); }
});

r.post('/salir', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(400).json({ error: 'Datos invalidos' });
    const matchId = matchIdOf(req.body?.matchId) || await matchActivo(user.user_key);
    await olvidarEntrada(user.user_key);
    if (matchId) {
      const par = await leerPar(matchId);
      const peer = par ? (par.a === user.user_key ? par.b : par.a) : null;
      await desmarcarActivo(user.user_key);
      if (peer) {
        await desmarcarActivo(peer);
        await publicarEnd(peer, matchId, 'salio');
      }
      await borrarPar(matchId);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/siguiente', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(400).json({ error: 'Datos invalidos' });
    const matchId = matchIdOf(req.body?.matchId) || await matchActivo(user.user_key);
    if (matchId) {
      const par = await leerPar(matchId);
      const peer = par ? (par.a === user.user_key ? par.b : par.a) : null;
      await desmarcarActivo(user.user_key);
      if (peer) {
        await desmarcarActivo(peer);
        await publicarEnd(peer, matchId, 'siguiente');
      }
      await borrarPar(matchId);
    }
    await olvidarEntrada(user.user_key);
    const perfil = await cargarPerfil(user.user_key);
    if (!perfil) return res.status(400).json({ error: 'perfil_incompleto' });
    const busca = normalizaBusca(req.body?.filtros);
    const resultado = await intentarEmparejar(user, perfil, busca);
    res.json({ ok: true, ...resultado });
  } catch (e) { next(e); }
});

r.post('/signal', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const matchId = matchIdOf(req.body?.matchId);
    const paraKey = String(req.body?.paraKey || '').trim();
    const kind = String(req.body?.kind || '');
    if (!user || !matchId || !paraKey) return res.status(400).json({ error: 'Datos invalidos' });
    if (!['offer', 'answer', 'ice'].includes(kind)) return res.status(400).json({ error: 'kind invalido' });
    const par = await leerPar(matchId);
    if (!par || (par.a !== user.user_key && par.b !== user.user_key)) {
      return res.status(403).json({ error: 'Match no valido' });
    }
    await publishEvent('match_signal', {
      para: paraKey, de: user.user_key, matchId, kind,
      sdp: req.body?.sdp || null, candidate: req.body?.candidate || null,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/chat', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const matchId = matchIdOf(req.body?.matchId);
    const texto = String(req.body?.texto || '').trim().slice(0, 500);
    if (!user || !matchId || !texto) return res.status(400).json({ error: 'Datos invalidos' });
    const par = await leerPar(matchId);
    if (!par || (par.a !== user.user_key && par.b !== user.user_key)) {
      return res.status(403).json({ error: 'Match no valido' });
    }
    const para = par.a === user.user_key ? par.b : par.a;
    await publishEvent('match_chat', {
      para, de: user.user_key, matchId, texto, nombre: nombreDe(user), at: Date.now(),
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/match/reporte  { userKey, matchId, denunciadoKey, motivo, detalle }
r.post('/reporte', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const matchId = matchIdOf(req.body?.matchId);
    const denunciadoKey = normalizeUserKey(req.body?.denunciadoKey);
    const motivo = String(req.body?.motivo || '').trim().slice(0, 60);
    const detalle = String(req.body?.detalle || '').trim().slice(0, 1000);
    if (!user || !denunciadoKey || !motivo) {
      return res.status(400).json({ error: 'Datos invalidos' });
    }
    if (String(denunciadoKey) === String(user.user_key)) {
      return res.status(400).json({ error: 'No puedes reportarte' });
    }
    if (matchId) {
      const par = await leerPar(matchId);
      if (!par || (par.a !== user.user_key && par.b !== user.user_key)) {
        return res.status(403).json({ error: 'Match no valido' });
      }
    }
    const { rows } = await query(
      `INSERT INTO match_reportes (match_id, denunciante_key, denunciado_key, motivo, detalle, estado)
       VALUES ($1, $2, $3, $4, $5, 'pendiente')
       RETURNING id, created_at`,
      [matchId, user.user_key, denunciadoKey, motivo, detalle || null],
    );
    const notif = await query(
      `INSERT INTO notificaciones (user_key, tipo, titulo, texto, url, icono, actor_nombre, actor_avatar)
       VALUES (NULL, 'admin', $1, $2, $3, $4, $5, NULL)
       RETURNING id`,
      [
        'Reporte en Match',
        `Motivo: ${motivo}. Denunciante: ${user.user_key}. Denunciado: ${denunciadoKey}.${matchId ? ` Match: ${matchId}.` : ''}${detalle ? ` Detalle: ${detalle}` : ''}`,
        '/admin/comunidad',
        'flag-outline',
        'Sistema Match',
      ],
    );
    try { await publishEvent('notificacion_admin', { id: notif.rows[0].id }); } catch { /* opcional */ }
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) { next(e); }
});

// GET /api/match/reportes (admin) — listado de denuncias pendientes
r.get('/reportes', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, match_id, denunciante_key, denunciado_key, motivo, detalle, estado, created_at
         FROM match_reportes
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

r.get('/estado', async (req, res, next) => {
  try {
    const k = normalizeUserKey(req.query.userKey);
    if (!k) return res.status(400).json({ error: 'Datos invalidos' });
    const matchId = await matchActivo(k);
    const par = matchId ? await leerPar(matchId) : null;
    const peerKey = par ? (par.a === k ? par.b : par.a) : null;
    let enCola = false;
    try {
      const raw = await redis.hGet(ENTRADA, k);
      enCola = !!raw && !!parseEntrada(raw);
    } catch { /* opcional */ }
    res.json({ enCola, matchId, peerKey });
  } catch (e) { next(e); }
});

r.get('/stats', async (req, res, next) => {
  try {
    const [enCola, matchesHoy] = await Promise.all([contarCola(), contarMatchesHoy()]);
    let enLinea = 0;
    try {
      const { rows } = await query(
        "SELECT COUNT(*)::int AS n FROM comunidad_presencia WHERE last_seen > NOW() - INTERVAL '2 minutes'",
      );
      enLinea = rows[0]?.n || 0;
    } catch { /* opcional */ }
    res.json({ enLinea, enCola, matchesHoy });
  } catch (e) { next(e); }
});

export default r;
