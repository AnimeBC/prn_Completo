import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { cacheDel, publishEvent } from '../db/redis.js';
import {
  communityUpload, communityRootDir, communityUserFolder,
  publicOf, moveFileSync, avatarUpload,
} from '../services/upload.js';
import { crearNotificacion, notificarDueno, notificarMenciones } from './notificaciones.js';

const r = Router();

const FILTROS = ['recientes', 'videos', 'fotos', 'populares', 'guardados', 'para-ti'];
const TIPOS_MSJ = ['texto', 'foto', 'video', 'audio', 'sticker', 'emoji', 'album'];

// Un mensaje solo puede editarse/eliminarse (para todos) dentro de estas horas.
const MSJ_EDITABLE_HORAS = 24;
function esEditable(createdAt) {
  if (!createdAt) return true;
  return (Date.now() - new Date(createdAt).getTime()) < MSJ_EDITABLE_HORAS * 3600 * 1000;
}

function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** Usuario real a partir del userKey (evita falsificar el nombre). */
async function resolveUser(userKey) {
  const k = String(userKey || '').trim().slice(0, 80);
  if (!k) return null;
  const { rows } = await query(
    'SELECT user_key, usuario, nombre, avatar FROM users WHERE user_key = $1',
    [k]
  );
  return rows[0] || null;
}
function nameOf(u) {
  if (!u) return 'Usuario';
  return u.usuario || u.nombre || 'Usuario';
}

// Enlace al chat directo con una persona (abre su conversación).
function otroCanalUrl(u) {
  const key = u && u.user_key ? String(u.user_key) : '';
  return key ? `/chat?dm=${encodeURIComponent(key)}` : '/chat';
}

/** true si el usuario es el creador o un moderador del grupo. */
async function esDuenoOMod(comunidadId, userKey) {
  if (!comunidadId || !userKey) return false;
  const g = await query('SELECT user_key FROM comunidades WHERE id = $1', [comunidadId]);
  if (g.rows[0] && String(g.rows[0].user_key || '') === String(userKey)) return true;
  const m = await query(
    "SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2 AND rol IN ('dueno','moderador')",
    [comunidadId, userKey]
  );
  return !!m.rows[0];
}

/** Publica el cambio en Redis (tiempo real) y limpia la caché de comunidad. */
async function notify(type, payload = {}) {
  try { await publishEvent(type, payload); } catch { /* redis opcional */ }
  try { await cacheDel('cache:comunidad*'); } catch { /* opcional */ }
}

const STANDARD_MB = Number(process.env.COMUNIDAD_STANDARD_MB || 200);

/** Límite de subida del usuario: Infinity (sin límite), 200 (estándar) o sus MB. */
async function limiteSubidaMb(userKey) {
  if (!userKey) return STANDARD_MB;
  const { rows } = await query('SELECT subida_mb FROM users WHERE user_key = $1', [userKey]);
  const v = rows[0]?.subida_mb;
  if (v === -1) return Infinity;
  if (v === null || v === undefined) return STANDARD_MB;
  return Number(v);
}

/** Devuelve el archivo que excede el límite, o null. */
function excedeLimite(files, mb) {
  if (!Number.isFinite(mb)) return null;
  for (const f of files || []) {
    if (f && f.size > mb * 1024 * 1024) return f;
  }
  return null;
}

/** Borra los temporales y responde 413 si algún archivo pasa del límite. */
function rechazarLimite(res, files, mb) {
  const f = excedeLimite(files, mb);
  if (!f) return false;
  for (const x of files || []) { try { fs.unlinkSync(x.path); } catch { /* ignore */ } }
  res.status(413).json({
    error: Number.isFinite(mb)
      ? `El archivo pasa de tu límite (${mb} MB). Contacta con el admin para subir tu límite.`
      : 'Archivo demasiado grande.',
  });
  return true;
}

/** Guarda un archivo de la comunidad en la carpeta del usuario. */
function saveFile(file, userKey, tipo) {
  const dir = path.join(communityRootDir(), communityUserFolder(userKey), tipo);
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(file.filename || file.originalname) || '').toLowerCase();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const abs = path.join(dir, name);
  moveFileSync(file.path, abs);
  return publicOf(abs);
}

function mediaKind(mimetype = '', name = '') {
  if (/^image\//.test(mimetype) || /\.(gif|png|jpe?g|webp|avif)$/i.test(name)) return 'foto';
  if (/^audio\//.test(mimetype) || /\.(mp3|wav|ogg|m4a|aac)$/i.test(name)) return 'audio';
  return 'video';
}

// ============================================================
// COMUNIDADES (GRUPOS)
// ============================================================

// GET /api/comunidad/temas  -> diseños (gradientes) disponibles para el chat
r.get('/temas', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, nombre, gradient FROM chat_temas WHERE activo = TRUE ORDER BY id');
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// GET /api/comunidad/mi-limite?userKey=  -> { mb: -1 (sin límite) | 200 | N }
r.get('/mi-limite', async (req, res, next) => {
  try {
    const user = await resolveUser(req.query.userKey);
    const mb = await limiteSubidaMb(user?.user_key || '');
    res.json({ mb: Number.isFinite(mb) ? mb : -1 });
  } catch (e) { next(e); }
});

// GET /api/comunidad/grupos?userKey=&q=&page=&limit=&destacados=
r.get('/grupos', async (req, res, next) => {
  try {
    const userKey = String(req.query.userKey || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();
    const soloDestacados = String(req.query.destacados) === 'true';
    const filtro = String(req.query.filtro || 'todas'); // todas | mis | pendientes | publicas | privadas
    const orden = String(req.query.orden || 'miembros'); // miembros | recientes | activos | publicaciones
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const params = [];
    const where = ['c.activo = TRUE'];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(lower(c.nombre) LIKE $${params.length} OR lower(COALESCE(c.descripcion,'')) LIKE $${params.length})`);
    }
    if (soloDestacados) where.push('c.destacado = TRUE');
    if (filtro === 'publicas') where.push("c.privacidad = 'publica' AND c.modo_union = 'libre'");
    if (filtro === 'privadas') where.push("(c.privacidad = 'privada' OR c.modo_union = 'invitacion')");

    // Expresiones base (se usan en el SELECT y para filtrar/ordenar).
    const expMiembro = userKey
      ? 'EXISTS (SELECT 1 FROM comunidad_miembros cmx WHERE cmx.comunidad_id = c.id AND cmx.user_key = $USER)'
      : 'FALSE';
    const expSolicitud = userKey
      ? "(SELECT cs.estado FROM comunidad_solicitudes cs WHERE cs.comunidad_id = c.id AND cs.user_key = $USER LIMIT 1)"
      : 'NULL';
    // En línea real: latido de 60s -> ventana de 2 minutos (antes 5 min
    // hacia que un desconectado seguía pintado "activo" un buen rato).
    const expActivos = `(SELECT COUNT(*)::int FROM comunidad_miembros cm
                 JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
                WHERE cm.comunidad_id = c.id
                  AND pr.last_seen > NOW() - INTERVAL '2 minutes')`;
    const expArchivos = `((SELECT COALESCE(SUM(jsonb_array_length(p.media)), 0)::int
                   FROM comunidad_posts p WHERE p.comunidad_id = c.id AND p.activo = TRUE)
                + (SELECT COUNT(*)::int FROM comunidad_mensajes m
                   WHERE m.comunidad_id = c.id AND m.activo = TRUE AND m.media IS NOT NULL))`;

    // Filtros que dependen del usuario (agregan el userKey al WHERE).
    if (filtro === 'mis' && userKey) {
      params.push(userKey);
      where.push(expMiembro.replace('$USER', `$${params.length}`));
    }
    if (filtro === 'pendientes' && userKey) {
      params.push(userKey);
      where.push(`${expSolicitud.replace('$USER', `$${params.length}`)} = 'pendiente'`);
    }

    const whereSql = where.join(' AND ');
    // Params solo del WHERE del COUNT (sin el userKey del SELECT, salvo los filtros).
    const countParams = [...params];

    let miembro = 'FALSE';
    let dueno = 'FALSE';
    let solicitud = 'NULL';
    const selParams = [...params];
    if (userKey) {
      selParams.push(userKey);
      const uidx = selParams.length;
      miembro = expMiembro.replace('$USER', `$${uidx}`);
      dueno = `(c.user_key = $${uidx})`;
      solicitud = expSolicitud.replace('$USER', `$${uidx}`);
    }

    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM comunidades c WHERE ${whereSql}`, countParams);
    const limitIdx = selParams.length + 1;
    const offsetIdx = selParams.length + 2;

    const orderSql = orden === 'recientes' ? 'c.created_at DESC'
      : orden === 'activos' ? `${expActivos} DESC, c.miembros DESC`
        : orden === 'publicaciones' ? `${expArchivos} DESC, c.miembros DESC`
          : 'c.destacado DESC, c.miembros DESC';

    const { rows } = await query(
      `SELECT c.id, c.nombre, c.slug, c.descripcion, c.avatar, c.banner, c.reglas, c.privacidad,
              c.modo_union, c.miembros, c.destacado, c.created_at,
              ${miembro} AS miembro, ${dueno} AS soy_dueno, ${solicitud} AS solicitud,
              ${expActivos} AS activos,
              ${expArchivos} AS archivos,
              COALESCE(
                c.banner,
                c.avatar,
                (SELECT media->0->>'url' FROM comunidad_posts p
                  WHERE p.comunidad_id = c.id AND p.activo = TRUE
                    AND jsonb_array_length(COALESCE(p.media,'[]'::jsonb)) > 0
                  ORDER BY p.created_at DESC LIMIT 1)
              ) AS portada
         FROM comunidades c
        WHERE ${whereSql}
        ORDER BY ${orderSql}, c.id ASC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...selParams, limit, offset]
    );
    const total = totalQ.rows[0].n;
    res.json({ data: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// GET /api/comunidad/grupos/:id  (+ mensajes recientes + si soy miembro)
r.get('/grupos/:id', async (req, res, next) => {
  try {
    // Acepta id numerico o slug (para URLs tipo /comunidad/grupo/mi-grupo-abc).
    const ref = String(req.params.id || '').trim();
    let id = intOrNull(ref);
    if (!id && !ref) return res.status(404).json({ error: 'Comunidad no encontrada' });
    const userKey = String(req.query.userKey || '').trim();
    const { rows } = id
      ? await query('SELECT * FROM comunidades WHERE id = $1 AND activo = TRUE', [id])
      : await query('SELECT * FROM comunidades WHERE slug = $1 AND activo = TRUE', [ref]);
    const grupo = rows[0];
    if (!grupo) return res.status(404).json({ error: 'Comunidad no encontrada' });
    id = grupo.id;
    let soyMiembro = false;
    let solicitud = null;
    let rol = null;
    if (userKey) {
      const m = await query('SELECT rol FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [id, userKey]);
      soyMiembro = !!m.rows[0];
      rol = m.rows[0]?.rol || null;
      const s = await query('SELECT estado FROM comunidad_solicitudes WHERE comunidad_id = $1 AND user_key = $2', [id, userKey]);
      solicitud = s.rows[0]?.estado || null;
    }
    const soyDueno = !!userKey && String(grupo.user_key || '') === String(userKey);
    const activos = await query(
      `SELECT COUNT(*)::int AS n FROM comunidad_miembros cm
         JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
        WHERE cm.comunidad_id = $1 AND pr.last_seen > NOW() - INTERVAL '2 minutes'`,
      [id]
    );
    const archivos = await query(
      `SELECT ((SELECT COALESCE(SUM(jsonb_array_length(p.media)), 0)::int
                  FROM comunidad_posts p WHERE p.comunidad_id = $1 AND p.activo = TRUE)
             + (SELECT COUNT(*)::int FROM comunidad_mensajes m
                  WHERE m.comunidad_id = $1 AND m.activo = TRUE AND m.media IS NOT NULL)) AS n`,
      [id]
    );
    grupo.activos = activos.rows[0].n;
    grupo.archivos = archivos.rows[0].n;
    res.json({ grupo, soyMiembro, solicitud, rol, soyDueno });
  } catch (e) { next(e); }
});

// GET /api/comunidad/grupos/:id/miembros -> lista de miembros con presencia
// (edad en segundos por el reloj de la BD; el frontend decide "en línea"/"hace X").
r.get('/grupos/:id/miembros', async (req, res, next) => {
  try {
    const gid = intOrNull(req.params.id);
    if (!gid) return res.status(400).json({ error: 'Grupo inválido' });
    const { rows } = await query(
      `SELECT cm.user_key, u.usuario, u.nombre, u.avatar,
              EXTRACT(EPOCH FROM (NOW() - pr.last_seen))::int AS edad
         FROM comunidad_miembros cm
         LEFT JOIN users u ON u.user_key = cm.user_key
         LEFT JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
        WHERE cm.comunidad_id = $1
        ORDER BY (pr.last_seen IS NULL), pr.last_seen DESC NULLS LAST, u.usuario ASC
        LIMIT 300`,
      [gid]
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos  (multipart: avatar)
r.post('/grupos', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const user = await resolveUser(b.userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para crear una comunidad' });
    const nombre = String(b.nombre || '').trim().slice(0, 120);
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const slug = `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${Date.now().toString(36)}`;
    let avatar = null;
    if (req.file) avatar = saveFile(req.file, user.user_key, 'grupos');

    const privacidad = b.privacidad === 'privada' ? 'privada' : 'publica';
    // Los grupos privados SIEMPRE piden permiso (invitación).
    const modoUnion = privacidad === 'privada'
      ? 'invitacion'
      : (b.modo_union === 'invitacion' ? 'invitacion' : 'libre');

    const ins = await query(
      `INSERT INTO comunidades (nombre, slug, descripcion, avatar, reglas, privacidad, modo_union, user_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre, slug, String(b.descripcion || '').trim() || null, avatar,
       String(b.reglas || '').trim() || null, privacidad, modoUnion, user.user_key]
    );
    const grupo = ins.rows[0];
    await query(
      `INSERT INTO comunidad_miembros (comunidad_id, user_key, usuario, rol)
       VALUES ($1, $2, $3, 'dueno')
       ON CONFLICT (comunidad_id, user_key) DO NOTHING`,
      [grupo.id, user.user_key, nameOf(user)]
    );
    await query('UPDATE comunidades SET miembros = 1 WHERE id = $1', [grupo.id]);
    grupo.miembros = 1;
    res.status(201).json({ ok: true, grupo });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos/:id/avatar  (multipart: avatar, body userKey)
// Solo el dueno (o admin) puede cambiar la foto/banner del grupo.
r.post('/grupos/:id/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión' });
    if (!req.file) return res.status(400).json({ error: 'Adjunta una imagen' });
    const g = await query('SELECT user_key FROM comunidades WHERE id = $1 AND activo = TRUE', [id]);
    if (!g.rows[0]) return res.status(404).json({ error: 'Comunidad no encontrada' });
    if (String(g.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo el dueño puede editarla' });
    const avatar = saveFile(req.file, user.user_key, 'grupos');
    await query('UPDATE comunidades SET avatar = $2, updated_at = NOW() WHERE id = $1', [id, avatar]);
    await notify('comunidad_grupo', { id });
    res.json({ ok: true, avatar });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos/:id/banner  (multipart: banner, body userKey)
r.post('/grupos/:id/banner', avatarUpload.single('banner'), async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión' });
    if (!req.file) return res.status(400).json({ error: 'Adjunta una imagen' });
    const g = await query('SELECT user_key FROM comunidades WHERE id = $1 AND activo = TRUE', [id]);
    if (!g.rows[0]) return res.status(404).json({ error: 'Comunidad no encontrada' });
    if (String(g.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo el dueño puede editarla' });
    const banner = saveFile(req.file, user.user_key, 'grupos');
    await query('UPDATE comunidades SET banner = $2, updated_at = NOW() WHERE id = $1', [id, banner]);
    await notify('comunidad_grupo', { id });
    res.json({ ok: true, banner });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos/:id/join
r.post('/grupos/:id/join', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión para unirte' });
    const g = await query('SELECT privacidad, modo_union FROM comunidades WHERE id = $1 AND activo = TRUE', [id]);
    if (!g.rows[0]) return res.status(404).json({ error: 'Comunidad no encontrada' });

    const exists = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [id, user.user_key]);
    if (exists.rows[0]) {
      await query('DELETE FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [id, user.user_key]);
      await query('UPDATE comunidades SET miembros = GREATEST(0, miembros - 1) WHERE id = $1', [id]);
      await notify('comunidad_join', { id });
      return res.json({ ok: true, joined: false });
    }

    // Privado o por invitación -> solicitud pendiente
    if (g.rows[0].privacidad === 'privada' || g.rows[0].modo_union === 'invitacion') {
      const accion = String(req.body?.accion || '').trim();
      const yaPendiente = await query(
        "SELECT 1 FROM comunidad_solicitudes WHERE comunidad_id = $1 AND user_key = $2 AND estado = 'pendiente'",
        [id, user.user_key]
      );
      // Cancelar la solicitud pendiente.
      if (accion === 'cancelar' || yaPendiente.rows[0]) {
        await query('DELETE FROM comunidad_solicitudes WHERE comunidad_id = $1 AND user_key = $2', [id, user.user_key]);
        await notify('comunidad_solicitud', { comunidad_id: id, user_key: user.user_key });
        return res.json({ ok: true, cancelado: true });
      }
      await query(
        `INSERT INTO comunidad_solicitudes (comunidad_id, user_key, usuario, mensaje)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (comunidad_id, user_key)
         DO UPDATE SET estado = 'pendiente', mensaje = EXCLUDED.mensaje, created_at = NOW()`,
        [id, user.user_key, nameOf(user), String(req.body?.mensaje || '').slice(0, 500) || null]
      );
      await notify('comunidad_solicitud', { comunidad_id: id, user_key: user.user_key });
      const gOwner = await query('SELECT user_key, nombre FROM comunidades WHERE id = $1', [id]);
      const solRow = await query('SELECT id FROM comunidad_solicitudes WHERE comunidad_id = $1 AND user_key = $2', [id, user.user_key]);
      await notificarDueno(gOwner.rows[0]?.user_key, {
        tipo: 'solicitud',
        titulo: `${nameOf(user)} quiere unirse a "${gOwner.rows[0]?.nombre || 'tu comunidad'}"`,
        texto: String(req.body?.mensaje || '').trim().slice(0, 300) || null,
        url: `/comunidad?grupo=${id}`,
        icono: 'person-add',
        actor: user,
        meta: { comunidad_id: id, sol_id: solRow.rows[0]?.id || null, tipo: 'solicitud' },
      });
      return res.json({ ok: true, pending: true });
    }

    await query(
      `INSERT INTO comunidad_miembros (comunidad_id, user_key, usuario)
       VALUES ($1, $2, $3) ON CONFLICT (comunidad_id, user_key) DO NOTHING`,
      [id, user.user_key, nameOf(user)]
    );
    await query('UPDATE comunidades SET miembros = miembros + 1 WHERE id = $1', [id]);
    res.json({ ok: true, joined: true });
    await notify('comunidad_join', { id });
  } catch (e) { next(e); }
});

// GET /api/comunidad/grupos/:id/solicitudes?userKey=  (dueño o moderadores)
r.get('/grupos/:id/solicitudes', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const userKey = String(req.query.userKey || '').trim();
    const ok = await esDuenoOMod(id, userKey);
    if (!ok) return res.status(403).json({ error: 'Solo el creador o moderadores' });
    const { rows } = await query(
      'SELECT * FROM comunidad_solicitudes WHERE comunidad_id = $1 ORDER BY created_at DESC LIMIT 100',
      [id]
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/grupos/:id/solicitudes/:solId  { userKey, estado }
r.put('/grupos/:id/solicitudes/:solId', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const solId = intOrNull(req.params.solId);
    const userKey = String(req.body?.userKey || '').trim();
    const estado = ['aprobado', 'rechazado'].includes(req.body?.estado) ? req.body.estado : 'rechazado';
    const ok = await esDuenoOMod(id, userKey);
    if (!ok) return res.status(403).json({ error: 'Solo el creador o moderadores' });
    const sol = await query('SELECT * FROM comunidad_solicitudes WHERE id = $1 AND comunidad_id = $2', [solId, id]);
    if (!sol.rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada' });
    await query('UPDATE comunidad_solicitudes SET estado = $2 WHERE id = $1', [solId, estado]);
    if (estado === 'aprobado') {
      await query(
        `INSERT INTO comunidad_miembros (comunidad_id, user_key, usuario)
         VALUES ($1, $2, $3) ON CONFLICT (comunidad_id, user_key) DO NOTHING`,
        [id, sol.rows[0].user_key, sol.rows[0].usuario]
      );
      await query(
        'UPDATE comunidades SET miembros = (SELECT COUNT(*) FROM comunidad_miembros WHERE comunidad_id = $1) WHERE id = $1',
        [id]
      );
    }
    res.json({ ok: true, estado });
    await notify('comunidad_solicitud', { comunidad_id: id, estado });
    if (estado === 'aprobado' || estado === 'rechazado') {
      const gInfo = await query('SELECT nombre FROM comunidades WHERE id = $1', [id]);
      await crearNotificacion({
        userKey: sol.rows[0].user_key,
        tipo: estado === 'aprobado' ? 'solicitud_aceptada' : 'solicitud_rechazada',
        titulo: estado === 'aprobado' ? 'Aceptaron tu solicitud' : 'Rechazaron tu solicitud',
        texto: `Comunidad: ${gInfo.rows[0]?.nombre || ''}`,
        url: `/comunidad?grupo=${id}`,
        icono: estado === 'aprobado' ? 'checkmark-circle' : 'close-circle',
        meta: { comunidad_id: id, tipo: estado },
      });
    }
  } catch (e) { next(e); }
});

// ============================================================
// FEED (posts)
// ============================================================

// GET /api/comunidad/feed?filtro=&userKey=&grupo=
r.get('/feed', async (req, res, next) => {
  try {
    const filtro = FILTROS.includes(req.query.filtro) ? req.query.filtro : 'recientes';
    const userKey = String(req.query.userKey || '').trim();
    const grupo = intOrNull(req.query.grupo);
    const where = ['p.activo = TRUE'];
    const params = [];
    if (grupo) {
      // Los grupos privados solo dejan ver sus publicaciones a sus miembros.
      const gInfo = await query('SELECT privacidad, modo_union, user_key FROM comunidades WHERE id = $1', [grupo]);
      const gi = gInfo.rows[0];
      if (gi && (gi.privacidad === 'privada' || gi.modo_union === 'invitacion')) {
        let permitido = !!userKey && String(gi.user_key || '') === String(userKey);
        if (!permitido && userKey) {
          const m = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [grupo, userKey]);
          permitido = !!m.rows[0];
        }
        if (!permitido) return res.json({ data: [], privado: true });
      }
      params.push(grupo);
      where.push(`p.comunidad_id = $${params.length}`);
    }
    if (filtro === 'videos') where.push(`p.tipo = 'video'`);
    if (filtro === 'fotos') where.push(`p.tipo = 'foto'`);
    if (filtro === 'guardados') {
      if (!userKey) return res.json({ data: [] });
      params.push(userKey);
      where.push(`EXISTS (SELECT 1 FROM comunidad_post_guardados g WHERE g.post_id = p.id AND g.user_key = $${params.length})`);
    }
    let liked = 'FALSE';
    let saved = 'FALSE';
    if (userKey) {
      params.push(userKey);
      liked = `EXISTS (SELECT 1 FROM comunidad_post_likes l WHERE l.post_id = p.id AND l.user_key = $${params.length})`;
      saved = `EXISTS (SELECT 1 FROM comunidad_post_guardados g2 WHERE g2.post_id = p.id AND g2.user_key = $${params.length})`;
    }
    // ===== Feed personalizado ("Para ti") =====
    // Muestra publicaciones de los grupos/comunidades del usuario y de gente
    // con la que interactua. Sin chat global: solo lo que publican los grupos.
    if (filtro === 'para-ti' && userKey) {
      const base = await query(
        `SELECT p.*, c.nombre AS grupo_nombre,
                ${liked} AS liked, ${saved} AS saved
           FROM comunidad_posts p
           JOIN comunidad_miembros cm ON cm.comunidad_id = p.comunidad_id AND cm.user_key = $1
           JOIN comunidades c ON c.id = p.comunidad_id
          WHERE p.activo = TRUE
          ORDER BY p.created_at DESC
          LIMIT 60`,
        [userKey]
      );
      // Si aun no hay nada de sus grupos, prueba con grupos publicos populares
      // que le puedan interesar (relleno); si tampoco, queda vacio.
      if (base.rows.length === 0) {
        const relleno = await query(
          `SELECT p.*, c.nombre AS grupo_nombre, FALSE AS liked, FALSE AS saved
             FROM comunidad_posts p
             JOIN comunidades c ON c.id = p.comunidad_id
            WHERE p.activo = TRUE AND c.activo = TRUE
            ORDER BY p.likes DESC, p.created_at DESC
            LIMIT 20`
        );
        return res.json({ data: relleno.rows, vacio: relleno.rows.length === 0 });
      }
      return res.json({ data: base.rows, vacio: false });
    }

    params.push(80);
    const limitIdx = params.length;

    const order = filtro === 'populares' ? 'p.likes DESC, p.created_at DESC' : 'p.created_at DESC';
    const { rows } = await query(
      `SELECT p.*, c.nombre AS grupo_nombre,
              ${liked} AS liked, ${saved} AS saved
         FROM comunidad_posts p
         LEFT JOIN comunidades c ON c.id = p.comunidad_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${order}
        LIMIT $${limitIdx}`,
      params
    );
    res.json({ data: rows, vacio: rows.length === 0 });
  } catch (e) { next(e); }
});

// POST /api/comunidad/posts  (multipart: media[])
r.post('/posts', communityUpload.array('media', 6), async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para publicar' });
    const texto = String(req.body?.texto || '').trim().slice(0, 4000);
    const grupo = intOrNull(req.body?.grupo);
    const files = req.files || [];
    if (!texto && !files.length) return res.status(400).json({ error: 'Escribe algo o adjunta un archivo' });
    if (rechazarLimite(res, files, await limiteSubidaMb(user.user_key))) return;

    // No se publica en grupos privados sin ser miembro.
    if (grupo) {
      const g = await query('SELECT privacidad, user_key FROM comunidades WHERE id = $1', [grupo]);
      if (g.rows[0] && g.rows[0].privacidad === 'privada') {
        const esDueno = String(g.rows[0].user_key || '') === String(user.user_key);
        const m = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [grupo, user.user_key]);
        if (!m.rows[0] && !esDueno) return res.status(403).json({ error: 'Debes ser miembro para publicar en este grupo' });
      }
    }

    const media = [];
    for (const f of files) {
      const kind = mediaKind(f.mimetype, f.originalname);
      const url = saveFile(f, user.user_key, `posts/${kind}`);
      media.push({ url, tipo: kind });
    }
    const tipo = media.length === 0 ? 'texto'
      : media.some((m) => m.tipo === 'video') ? 'video'
      : media.some((m) => m.tipo === 'audio') ? 'audio'
      : 'foto';

    const ins = await query(
      `INSERT INTO comunidad_posts (comunidad_id, user_key, usuario, avatar, texto, tipo, media)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [grupo, user.user_key, nameOf(user), user.avatar || null, texto || null, tipo, JSON.stringify(media)]
    );
    res.status(201).json({ ok: true, post: ins.rows[0] });
    await notify('comunidad_post', { id: ins.rows[0].id, grupo });
    await notificarMenciones(texto, { actor: user, url: `/comunidad?post=${ins.rows[0].id}`, contexto: 'una publicación' });
  } catch (e) { next(e); }
});

// POST /api/comunidad/posts/:id/like  (toggle)
r.post('/posts/:id/like', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión para reaccionar' });
    const exists = await query('SELECT 1 FROM comunidad_post_likes WHERE post_id = $1 AND user_key = $2', [id, user.user_key]);
    if (exists.rows[0]) {
      await query('DELETE FROM comunidad_post_likes WHERE post_id = $1 AND user_key = $2', [id, user.user_key]);
      await query('UPDATE comunidad_posts SET likes = GREATEST(0, likes - 1) WHERE id = $1', [id]);
      return res.json({ ok: true, liked: false });
    }
    await query('INSERT INTO comunidad_post_likes (post_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.user_key]);
    await query('UPDATE comunidad_posts SET likes = likes + 1 WHERE id = $1', [id]);
    res.json({ ok: true, liked: true });
    await notify('comunidad_post_like', { id });
    const post = await query('SELECT user_key, texto FROM comunidad_posts WHERE id = $1', [id]);
    await notificarDueno(post.rows[0]?.user_key, {
      tipo: 'like',
      titulo: `A ${nameOf(user)} le gustó tu publicación`,
      texto: post.rows[0]?.texto || null,
      url: `/comunidad?post=${id}`,
      icono: 'heart',
      actor: user,
      meta: { post_id: id },
    });
  } catch (e) { next(e); }
});

// POST /api/comunidad/posts/:id/save  (toggle)
r.post('/posts/:id/save', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión para guardar' });
    const exists = await query('SELECT 1 FROM comunidad_post_guardados WHERE post_id = $1 AND user_key = $2', [id, user.user_key]);
    if (exists.rows[0]) {
      await query('DELETE FROM comunidad_post_guardados WHERE post_id = $1 AND user_key = $2', [id, user.user_key]);
      return res.json({ ok: true, saved: false });
    }
    await query('INSERT INTO comunidad_post_guardados (post_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user.user_key]);
    res.json({ ok: true, saved: true });
    await notify('comunidad_post_save', { id });
  } catch (e) { next(e); }
});

// POST /api/comunidad/posts/:id/share
r.post('/posts/:id/share', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Post inválido' });
    await query('UPDATE comunidad_posts SET compartidos = compartidos + 1 WHERE id = $1', [id]);
    res.json({ ok: true });
    await notify('comunidad_post_share', { id });
  } catch (e) { next(e); }
});

// GET /api/comunidad/posts/:id/comments
r.get('/posts/:id/comments', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.json({ data: [] });
    const { rows } = await query(
      `SELECT id, user_key, usuario, avatar, texto, created_at
         FROM comunidad_post_comentarios
        WHERE post_id = $1 AND activo = TRUE
        ORDER BY created_at ASC LIMIT 200`,
      [id]
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/comunidad/posts/:id/comments  { userKey, texto }
r.post('/posts/:id/comments', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    if (!id || !user || !texto) return res.status(401).json({ error: 'Inicia sesión para comentar' });
    const ins = await query(
      `INSERT INTO comunidad_post_comentarios (post_id, user_key, usuario, avatar, texto)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, user_key, usuario, avatar, texto, created_at`,
      [id, user.user_key, nameOf(user), user.avatar || null, texto]
    );
    await query('UPDATE comunidad_posts SET comentarios = comentarios + 1 WHERE id = $1', [id]);
    res.status(201).json({ ok: true, comentario: ins.rows[0] });
    await notify('comunidad_comment', { post_id: id, id: ins.rows[0].id });
    const post = await query('SELECT user_key FROM comunidad_posts WHERE id = $1', [id]);
    await notificarDueno(post.rows[0]?.user_key, {
      tipo: 'comentario',
      titulo: `${nameOf(user)} comentó tu publicación`,
      texto,
      url: `/comunidad?post=${id}`,
      icono: 'chatbubble-ellipses',
      actor: user,
      meta: { post_id: id },
    });
    await notificarMenciones(texto, { actor: user, url: `/comunidad?post=${id}`, contexto: 'un comentario' });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/posts/:id  (autor o admin)
r.delete('/posts/:id', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Post inválido' });
    await query('UPDATE comunidad_posts SET activo = FALSE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============================================================
// HISTORIAS (stories)
// ============================================================

// GET /api/comunidad/stories
r.get('/stories', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, user_key, usuario, avatar, tipo, media, texto, vistas, created_at, expires_at
         FROM comunidad_stories
        WHERE activo = TRUE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/comunidad/stories  (multipart: media)
r.post('/stories', communityUpload.single('media'), async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para subir una historia' });
    const reqFiles = req.file ? [req.file] : [];
    if (rechazarLimite(res, reqFiles, await limiteSubidaMb(user.user_key))) return;
    const texto = String(req.body?.texto || '').trim().slice(0, 500);
    let media = null;
    let tipo = 'texto';
    if (req.file) {
      tipo = mediaKind(req.file.mimetype, req.file.originalname) === 'video' ? 'video' : 'foto';
      media = saveFile(req.file, user.user_key, `stories/${tipo}`);
    }
    if (!media && !texto) return res.status(400).json({ error: 'Adjunta una foto/video o escribe algo' });
    const ins = await query(
      `INSERT INTO comunidad_stories (user_key, usuario, avatar, tipo, media, texto)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_key, usuario, avatar, tipo, media, texto, created_at, expires_at`,
      [user.user_key, nameOf(user), user.avatar || null, tipo, media, texto || null]
    );
    res.status(201).json({ ok: true, story: ins.rows[0] });
    await notify('comunidad_story', { id: ins.rows[0].id });
  } catch (e) { next(e); }
});

// POST /api/comunidad/stories/:id/view
r.post('/stories/:id/view', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const userKey = String(req.body?.userKey || '').trim();
    if (!id) return res.status(400).json({ error: 'Historia inválida' });
    if (userKey) {
      const ins = await query(
        'INSERT INTO comunidad_story_vistas (story_id, user_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [id, userKey]
      );
      if (ins.rows[0]) await query('UPDATE comunidad_stories SET vistas = vistas + 1 WHERE id = $1', [id]);
    } else {
      await query('UPDATE comunidad_stories SET vistas = vistas + 1 WHERE id = $1', [id]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/comunidad/stories/:id/reaccion  { userKey, emoji, texto }
r.post('/stories/:id/reaccion', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    const emoji = String(req.body?.emoji || '').slice(0, 8);
    const texto = String(req.body?.texto || '').slice(0, 500);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión para reaccionar' });
    if (!emoji && !texto) return res.status(400).json({ error: 'Reacción vacía' });
    await query(
      'INSERT INTO comunidad_story_reacciones (story_id, user_key, emoji, texto) VALUES ($1, $2, $3, $4)',
      [id, user.user_key, emoji || null, texto || null]
    );
    res.status(201).json({ ok: true });
    await notify('comunidad_story_reaccion', { id, emoji: emoji || '' });
    const st = await query('SELECT user_key FROM comunidad_stories WHERE id = $1', [id]);
    await notificarDueno(st.rows[0]?.user_key, {
      tipo: 'reaccion',
      titulo: `${nameOf(user)} reaccionó a tu historia`,
      texto: emoji || texto || null,
      url: '/comunidad',
      icono: 'sparkles',
      actor: user,
      meta: { story_id: id },
    });
  } catch (e) { next(e); }
});

// ============================================================
// CHAT DE GRUPOS
// ============================================================

// GET /api/comunidad/grupos/:id/mensajes?userKey=  (lectura para todos; escribir solo miembros)
r.get('/grupos/:id/mensajes', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.json({ data: [] });
    const userKey = String(req.query.userKey || '').trim();
    const before = intOrNull(req.query.before);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const { rows } = await query(
      `SELECT m.id, m.user_key, m.usuario, m.avatar, m.texto, m.tipo, m.media, m.created_at, m.reply_to,
              m.editado, m.eliminado,
              r.usuario AS reply_usuario, r.texto AS reply_texto,
              (SELECT COUNT(*)::int FROM comunidad_chat_leido cl
                 WHERE cl.comunidad_id = m.comunidad_id AND cl.user_key <> m.user_key
                   AND cl.ultimo_leido >= m.created_at) AS leidos,
              (SELECT MIN(cl.ultimo_leido) FROM comunidad_chat_leido cl
                 WHERE cl.comunidad_id = m.comunidad_id AND cl.user_key <> m.user_key
                   AND cl.ultimo_leido >= m.created_at) AS visto_en,
              (SELECT COALESCE(json_agg(json_build_object('emoji', x.emoji, 'n', x.n, 'mi', x.mi) ORDER BY x.emoji), '[]'::json)
                 FROM (
                   SELECT emoji, COUNT(*)::int AS n, BOOL_OR(user_key = $2) AS mi
                     FROM comunidad_mensaje_reacciones
                    WHERE mensaje_id = m.id
                    GROUP BY emoji
                 ) x) AS reacciones
         FROM comunidad_mensajes m
         LEFT JOIN comunidad_mensajes r ON r.id = m.reply_to
        WHERE m.comunidad_id = $1 AND m.activo = TRUE
          AND NOT ($2 = ANY(COALESCE(m.oculto_para, '{}'::text[])))
          AND ($3::int IS NULL OR m.id < $3)
        ORDER BY m.created_at DESC, m.id DESC LIMIT $4`,
      [id, userKey, before, limit]
    );
    // NO se marca leido aqui: solo el chat ACTIVO marca leido (POST /chats/:id/leido).
    res.json({ data: rows.reverse(), hasMore: rows.length === limit });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos/:id/mensajes  (multipart: media x N)
r.post('/grupos/:id/mensajes', communityUpload.array('media', 10), async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const user = await resolveUser(req.body?.userKey);
    if (!id || !user) return res.status(401).json({ error: 'Inicia sesión para escribir' });
    // En grupos privados solo escriben los miembros (o el dueño).
    const g = await query('SELECT privacidad, user_key FROM comunidades WHERE id = $1', [id]);
    const grupoInfo = g.rows[0];
    if (!grupoInfo) return res.status(404).json({ error: 'Comunidad no encontrada' });
    if (grupoInfo.privacidad === 'privada') {
      const esDueno = String(grupoInfo.user_key || '') === String(user.user_key);
      const m = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [id, user.user_key]);
      if (!m.rows[0] && !esDueno) return res.status(403).json({ error: 'Debes ser miembro para escribir en este grupo' });
    }
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    const files = Array.isArray(req.files) ? req.files : [];
    if (rechazarLimite(res, files, await limiteSubidaMb(user.user_key))) return;
    let tipo = TIPOS_MSJ.includes(req.body?.tipo) ? req.body.tipo : 'texto';
    let media = null;
    if (files.length) {
      const saved = files.map((f) => {
        const kind = mediaKind(f.mimetype, f.originalname);
        return { kind, path: saveFile(f, user.user_key, `chat/${kind}`) };
      });
      // 1 archivo = string simple (compatibilidad); varios = JSON array (album).
      media = saved.length === 1 ? saved[0].path : JSON.stringify(saved.map((x) => x.path));
      tipo = saved.length === 1 ? saved[0].kind : 'album';
    }
    if (!media && !texto) return res.status(400).json({ error: 'Mensaje vacío' });
    const replyTo = intOrNull(req.body?.reply_to);
    const ins = await query(
      `INSERT INTO comunidad_mensajes (comunidad_id, user_key, usuario, avatar, texto, tipo, media, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_key, usuario, avatar, texto, tipo, media, created_at, reply_to`,
      [id, user.user_key, nameOf(user), user.avatar || null, texto || null, tipo, media, replyTo]
    );
    res.status(201).json({ ok: true, mensaje: ins.rows[0] });
    await notify('comunidad_mensaje', { id: ins.rows[0].id, comunidad_id: id, de: user.user_key });
    // No se notifica por cada mensaje del chat de grupo (evita spam).
    // Solo si es una respuesta directa a tu mensaje.
    if (replyTo) {
      const rp = await query('SELECT user_key FROM comunidad_mensajes WHERE id = $1', [replyTo]);
      await notificarDueno(rp.rows[0]?.user_key, {
        tipo: 'respuesta',
        titulo: `${nameOf(user)} respondió a tu mensaje`,
        texto: texto || `[${tipo}]`,
        url: `/comunidad?grupo=${id}`,
        icono: 'return-down-forward',
        actor: user,
      });
    }
  } catch (e) { next(e); }
});

// PUT /api/comunidad/grupos/:id/mensajes/:msjId  { userKey, texto }  (editar)
r.put('/grupos/:id/mensajes/:msjId', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey);
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    if (!id || !msjId || !user) return res.status(401).json({ error: 'Inicia sesión' });
    if (!texto) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    const m = await query('SELECT user_key, created_at FROM comunidad_mensajes WHERE id = $1 AND comunidad_id = $2 AND activo = TRUE', [msjId, id]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (String(m.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo puedes editar tus mensajes' });
    if (!esEditable(m.rows[0].created_at)) return res.status(403).json({ error: 'El mensaje es muy antiguo para editarse' });
    await query('UPDATE comunidad_mensajes SET texto = $2, media = NULL, editado = TRUE WHERE id = $1', [msjId, texto]);
    await notify('comunidad_mensaje', { id: msjId, comunidad_id: id });
    res.json({ ok: true, texto });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/grupos/:id/mensajes/:msjId  { userKey }  (deja rastro)
r.delete('/grupos/:id/mensajes/:msjId', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey || req.query.userKey);
    if (!id || !msjId || !user) return res.status(401).json({ error: 'Inicia sesión' });
    const paraTodos = req.body?.paraTodos === true;
    const m = await query('SELECT user_key, created_at FROM comunidad_mensajes WHERE id = $1 AND comunidad_id = $2 AND activo = TRUE', [msjId, id]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (paraTodos) {
      if (String(m.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo puedes eliminar para todos tus mensajes' });
      if (!esEditable(m.rows[0].created_at)) return res.status(403).json({ error: 'El mensaje es muy antiguo para eliminarse' });
      await query('UPDATE comunidad_mensajes SET eliminado = TRUE, texto = NULL, media = NULL WHERE id = $1', [msjId]);
    } else {
      await query(
        `UPDATE comunidad_mensajes SET oculto_para = array_append(COALESCE(oculto_para, '{}'::text[]), $2) WHERE id = $1`,
        [msjId, user.user_key]
      );
    }
    await notify('comunidad_mensaje', { id: msjId, comunidad_id: id });
    res.json({ ok: true, paraTodos });
  } catch (e) { next(e); }
});

// POST /api/comunidad/mensajes/:msjId/reaccion  { userKey, emoji }
r.post('/mensajes/:msjId/reaccion', async (req, res, next) => {
  try {
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey);
    const emoji = String(req.body?.emoji || '').slice(0, 8);
    if (!msjId || !user || !emoji) return res.status(401).json({ error: 'Inicia sesión para reaccionar' });
    const m = await query('SELECT comunidad_id, user_key FROM comunidad_mensajes WHERE id = $1 AND activo = TRUE', [msjId]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const comId = m.rows[0].comunidad_id;
    const msjOwner = m.rows[0].user_key;
    // Solo miembros (o dueño) pueden reaccionar en grupos privados.
    if (comId) {
      const g = await query('SELECT privacidad, user_key FROM comunidades WHERE id = $1', [comId]);
      if (g.rows[0] && g.rows[0].privacidad === 'privada') {
        const esDueno = String(g.rows[0].user_key || '') === String(user.user_key);
        const mm = await query('SELECT 1 FROM comunidad_miembros WHERE comunidad_id = $1 AND user_key = $2', [comId, user.user_key]);
        if (!mm.rows[0] && !esDueno) return res.status(403).json({ error: 'Debes ser miembro para reaccionar' });
      }
    }
    const existing = await query('SELECT emoji FROM comunidad_mensaje_reacciones WHERE mensaje_id = $1 AND user_key = $2', [msjId, user.user_key]);
    if (existing.rows[0]?.emoji === emoji) {
      await query('DELETE FROM comunidad_mensaje_reacciones WHERE mensaje_id = $1 AND user_key = $2', [msjId, user.user_key]);
      return res.json({ ok: true, quitada: true });
    }
    await query(
      `INSERT INTO comunidad_mensaje_reacciones (mensaje_id, user_key, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (mensaje_id, user_key) DO UPDATE SET emoji = EXCLUDED.emoji`,
      [msjId, user.user_key, emoji]
    );
    res.json({ ok: true });
    await notify('comunidad_reaccion', { id: msjId, comunidad_id: comId });
    await notificarDueno(msjOwner, {
      tipo: 'reaccion',
      titulo: `${nameOf(user)} reaccionó a tu mensaje`,
      texto: emoji,
      url: `/comunidad?grupo=${comId || ''}`,
      icono: 'happy-outline',
      actor: user,
      meta: { mensaje_id: msjId },
    });
  } catch (e) { next(e); }
});

// ============================================================
// CHATS (bandeja estilo Messenger): conversaciones del usuario
// ============================================================

// GET /api/comunidad/chats?userKey=  -> grupos donde participa + último mensaje
r.get('/chats', async (req, res, next) => {
  try {
    const userKey = String(req.query.userKey || '').trim();
    if (!userKey) return res.json({ data: [] });
    const { rows } = await query(
      `WITH mis AS (
         SELECT c.id FROM comunidades c WHERE c.user_key = $1 AND c.activo = TRUE
         UNION
         SELECT cm.comunidad_id FROM comunidad_miembros cm WHERE cm.user_key = $1
       )
       SELECT c.id, c.slug, c.nombre, c.avatar, c.descripcion, c.privacidad, c.miembros,
              (SELECT COUNT(*)::int FROM comunidad_miembros cm
                 JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
                WHERE cm.comunidad_id = c.id
                  AND pr.last_seen > NOW() - INTERVAL '2 minutes') AS activos,
              m.texto AS ultimo_texto, m.tipo AS ultimo_tipo, m.usuario AS ultimo_usuario,
              m.user_key AS ultimo_user_key, m.media AS ultimo_media, m.created_at AS ultimo_creado,
              (SELECT COUNT(*)::int
                 FROM comunidad_mensajes msg
                WHERE msg.comunidad_id = c.id AND msg.activo = TRUE
                  AND msg.user_key <> $1
                  AND msg.created_at > COALESCE(cl.ultimo_leido, 'epoch'::timestamptz)
              ) AS no_leidos
         FROM comunidades c
         JOIN mis ON mis.id = c.id
         LEFT JOIN comunidad_chat_leido cl ON cl.comunidad_id = c.id AND cl.user_key = $1
         LEFT JOIN LATERAL (
           SELECT texto, tipo, usuario, user_key, media, created_at
             FROM comunidad_mensajes
            WHERE comunidad_id = c.id AND activo = TRUE
            ORDER BY created_at DESC LIMIT 1
         ) m ON TRUE
        WHERE c.activo = TRUE
        ORDER BY COALESCE(m.created_at, c.created_at) DESC
        LIMIT 60`,
      [userKey]
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// POST /api/comunidad/chats/:id/leido  { userKey }
r.post('/chats/:id/leido', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const userKey = String(req.body?.userKey || '').trim();
    if (!id || !userKey) return res.status(400).json({ error: 'Datos inválidos' });
    await query(
      `INSERT INTO comunidad_chat_leido (comunidad_id, user_key, ultimo_leido)
       VALUES ($1, $2, NOW())
       ON CONFLICT (comunidad_id, user_key) DO UPDATE SET ultimo_leido = NOW()`,
      [id, userKey]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============================================================
// MENSAJES DIRECTOS (1 a 1, para los "amigos")
// ============================================================

function dmPar(a, b) {
  const x = String(a); const y = String(b);
  return x < y ? [x, y] : [y, x];
}

async function dmConversacion(a, b, crear = false) {
  const [x, y] = dmPar(a, b);
  const found = await query('SELECT * FROM dm_conversaciones WHERE a_key = $1 AND b_key = $2', [x, y]);
  if (found.rows[0]) return found.rows[0];
  if (!crear) return null;
  const ins = await query(
    `INSERT INTO dm_conversaciones (a_key, b_key) VALUES ($1, $2)
     ON CONFLICT (a_key, b_key) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [x, y]
  );
  return ins.rows[0];
}

/** Inserta un aviso del sistema en el chat (ej. cambió el diseño / apodos). */
async function insertarSistema(conv, user, codigo) {
  try {
    await query(
      `INSERT INTO dm_mensajes (conversacion_id, user_key, usuario, avatar, texto, tipo)
       VALUES ($1, $2, $3, $4, $5, 'sistema')`,
      [conv.id, user.user_key, nameOf(user), user.avatar || null, codigo]
    );
  } catch { /* opcional */ }
}

// GET /api/comunidad/dm/chats?userKey=  -> conversaciones 1a1 con último mensaje
r.get('/dm/chats', async (req, res, next) => {
  try {
    const userKey = String(req.query.userKey || '').trim();
    if (!userKey) return res.json({ data: [] });
    const { rows } = await query(
      `SELECT c.id,
              CASE WHEN c.a_key = $1 THEN c.b_key ELSE c.a_key END AS otro_key,
              u.usuario AS otro_usuario, u.nombre AS otro_nombre, u.avatar AS otro_avatar,
              (SELECT ch.slug FROM channels ch
                WHERE ch.user_key = CASE WHEN c.a_key = $1 THEN c.b_key ELSE c.a_key END
                LIMIT 1) AS otro_canal_slug,
              m.texto AS ultimo_texto, m.tipo AS ultimo_tipo, m.user_key AS ultimo_user_key,
              m.created_at AS ultimo_creado,
              (SELECT COUNT(*)::int FROM dm_mensajes dm
                WHERE dm.conversacion_id = c.id AND dm.activo = TRUE AND dm.user_key <> $1
                  AND dm.created_at > COALESCE(dl.ultimo_leido, 'epoch'::timestamptz)) AS no_leidos
         FROM dm_conversaciones c
         LEFT JOIN users u ON u.user_key = CASE WHEN c.a_key = $1 THEN c.b_key ELSE c.a_key END
         LEFT JOIN dm_leido dl ON dl.conversacion_id = c.id AND dl.user_key = $1
         LEFT JOIN LATERAL (
           SELECT texto, tipo, user_key, created_at FROM dm_mensajes
            WHERE conversacion_id = c.id AND activo = TRUE
            ORDER BY created_at DESC LIMIT 1
         ) m ON TRUE
        WHERE c.a_key = $1 OR c.b_key = $1
        ORDER BY COALESCE(m.created_at, c.updated_at) DESC
        LIMIT 60`,
      [userKey]
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// GET /api/comunidad/dm/:otroKey/mensajes?userKey=
r.get('/dm/:otroKey/mensajes', async (req, res, next) => {
  try {
    const userKey = String(req.query.userKey || '').trim();
    const otroKey = String(req.params.otroKey || '').trim();
    if (!userKey || !otroKey) return res.json({ data: [] });
    const before = intOrNull(req.query.before);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
    const conv = await dmConversacion(userKey, otroKey, false);
    if (!conv) return res.json({ data: [] });
    const { rows } = await query(
      `SELECT m.id, m.user_key, m.usuario, m.avatar, m.texto, m.tipo, m.media, m.created_at, m.reply_to,
              m.editado, m.eliminado,
              r.usuario AS reply_usuario, r.texto AS reply_texto,
              EXISTS(SELECT 1 FROM dm_leido dl
                      WHERE dl.conversacion_id = m.conversacion_id AND dl.user_key <> m.user_key
                        AND dl.ultimo_leido >= m.created_at) AS leido,
              (SELECT MIN(dl.ultimo_leido) FROM dm_leido dl
                WHERE dl.conversacion_id = m.conversacion_id AND dl.user_key <> m.user_key
                  AND dl.ultimo_leido >= m.created_at) AS visto_en,
              (SELECT COALESCE(json_agg(json_build_object('emoji', x.emoji, 'n', x.n, 'mi', x.mi) ORDER BY x.emoji), '[]'::json)
                 FROM (
                   SELECT emoji, COUNT(*)::int AS n, BOOL_OR(user_key = $2) AS mi
                     FROM dm_mensaje_reacciones WHERE mensaje_id = m.id GROUP BY emoji
                 ) x) AS reacciones
         FROM dm_mensajes m
         LEFT JOIN dm_mensajes r ON r.id = m.reply_to
        WHERE m.conversacion_id = $1 AND m.activo = TRUE
          AND NOT ($2 = ANY(COALESCE(m.oculto_para, '{}'::text[])))
          AND ($3::int IS NULL OR m.id < $3)
        ORDER BY m.created_at DESC, m.id DESC LIMIT $4`,
      [conv.id, userKey, before, limit]
    );
    const ap = (await query('SELECT a_alias, b_alias FROM dm_apodos WHERE conversacion_id = $1', [conv.id])).rows[0] || {};
    const esA = String(conv.a_key) === String(userKey);
    const miApodo = (esA ? ap.a_alias : ap.b_alias) || null;
    const suApodo = (esA ? ap.b_alias : ap.a_alias) || null;
    const tema = {
      gradient: conv.tema_gradient || '',
      color: conv.tema_color || '',
      emoji: conv.tema_emoji || '',
    };
    const otroUsuarioKey = String(conv.a_key) === String(userKey) ? conv.b_key : conv.a_key;
    const canal = (await query('SELECT slug FROM channels WHERE user_key = $1 LIMIT 1', [otroUsuarioKey])).rows[0] || null;
    // NO se marca leido aqui: solo el chat ACTIVO marca leido (POST /dm/:otroKey/leido).
    res.json({ data: rows.reverse(), hasMore: rows.length === limit, miApodo, suApodo, tema, canal_slug: canal ? canal.slug : null });
  } catch (e) { next(e); }
});

// POST /api/comunidad/dm/:otroKey/mensajes  (multipart: media x N)  { userKey, texto, tipo, reply_to }
r.post('/dm/:otroKey/mensajes', communityUpload.array('media', 10), async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para escribir' });
    const otro = await resolveUser(req.params.otroKey);
    if (!otro) return res.status(404).json({ error: 'Usuario no encontrado' });
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    const files = Array.isArray(req.files) ? req.files : [];
    if (rechazarLimite(res, files, await limiteSubidaMb(user.user_key))) return;

    let tipo = TIPOS_MSJ.includes(req.body?.tipo) ? req.body.tipo : 'texto';
    let media = null;
    if (files.length) {
      const saved = files.map((f) => {
        const kind = mediaKind(f.mimetype, f.originalname);
        return { kind, path: saveFile(f, user.user_key, `dm/${kind}`) };
      });
      // 1 archivo = string simple (compatibilidad); varios = JSON array (album).
      media = saved.length === 1 ? saved[0].path : JSON.stringify(saved.map((x) => x.path));
      tipo = saved.length === 1 ? saved[0].kind : 'album';
    }
    if (!media && !texto) return res.status(400).json({ error: 'Mensaje vacío' });

    const conv = await dmConversacion(user.user_key, otro.user_key, true);
    // ¿Es el PRIMER mensaje que esta persona le envía? Solo ahí se notifica
    // (para no crear una alerta por cada mensaje).
    const previo = await query(
      'SELECT 1 FROM dm_mensajes WHERE conversacion_id = $1 AND user_key = $2 AND activo = TRUE LIMIT 1',
      [conv.id, user.user_key]
    );
    const esPrimero = !previo.rows[0];

    const replyTo = intOrNull(req.body?.reply_to);
    const ins = await query(
      `INSERT INTO dm_mensajes (conversacion_id, user_key, usuario, avatar, texto, tipo, media, reply_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_key, usuario, avatar, texto, tipo, media, created_at, reply_to`,
      [conv.id, user.user_key, nameOf(user), user.avatar || null, texto || null, tipo, media, replyTo]
    );
    await query('UPDATE dm_conversaciones SET updated_at = NOW() WHERE id = $1', [conv.id]);
    res.status(201).json({ ok: true, mensaje: ins.rows[0] });
    await notify('comunidad_dm', { conv: conv.id, de: user.user_key, para: otro.user_key });
    // Aviso de "persona nueva": UNA sola vez por persona, aunque se borre la
    // conversación o se reinicie. Se comprueba que no exista ya esa notificación.
    if (esPrimero && String(otro.user_key) !== String(user.user_key)) {
      const yaAvisado = await query(
        `SELECT 1 FROM notificaciones
          WHERE user_key = $1 AND tipo = 'mensaje' AND actor_key = $2
          LIMIT 1`,
        [otro.user_key, user.user_key]
      );
      if (!yaAvisado.rows[0]) {
        await crearNotificacion({
          userKey: otro.user_key,
          tipo: 'mensaje',
          titulo: `${nameOf(user)} quiere hablar contigo`,
          texto: texto || `[${tipo}]`,
          url: otroCanalUrl(user),
          icono: 'mail',
          actor: user,
          meta: { dm: true, de: user.user_key },
        });
      }
    }
  } catch (e) { next(e); }
});

// PUT /api/comunidad/dm/:otroKey/mensajes/:msjId  { userKey, texto }  (editar DM)
r.put('/dm/:otroKey/mensajes/:msjId', async (req, res, next) => {
  try {
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey);
    const otroKey = String(req.params.otroKey || '').trim();
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    if (!msjId || !user || !otroKey) return res.status(401).json({ error: 'Inicia sesión' });
    if (!texto) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    const conv = await dmConversacion(user.user_key, otroKey, false);
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
    const m = await query('SELECT user_key, created_at FROM dm_mensajes WHERE id = $1 AND conversacion_id = $2 AND activo = TRUE', [msjId, conv.id]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (String(m.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo puedes editar tus mensajes' });
    if (!esEditable(m.rows[0].created_at)) return res.status(403).json({ error: 'El mensaje es muy antiguo para editarse' });
    await query('UPDATE dm_mensajes SET texto = $2, media = NULL, editado = TRUE WHERE id = $1', [msjId, texto]);
    await notify('comunidad_dm', { conv: conv.id });
    res.json({ ok: true, texto });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/dm/:otroKey/mensajes/:msjId  { userKey }  (deja rastro)
r.delete('/dm/:otroKey/mensajes/:msjId', async (req, res, next) => {
  try {
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey || req.query.userKey);
    const otroKey = String(req.params.otroKey || '').trim();
    if (!msjId || !user || !otroKey) return res.status(401).json({ error: 'Inicia sesión' });
    const conv = await dmConversacion(user.user_key, otroKey, false);
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
    const paraTodos = req.body?.paraTodos === true;
    const m = await query('SELECT user_key, created_at FROM dm_mensajes WHERE id = $1 AND conversacion_id = $2 AND activo = TRUE', [msjId, conv.id]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (paraTodos) {
      if (String(m.rows[0].user_key) !== String(user.user_key)) return res.status(403).json({ error: 'Solo puedes eliminar para todos tus mensajes' });
      if (!esEditable(m.rows[0].created_at)) return res.status(403).json({ error: 'El mensaje es muy antiguo para eliminarse' });
      await query('UPDATE dm_mensajes SET eliminado = TRUE, texto = NULL, media = NULL WHERE id = $1', [msjId]);
    } else {
      await query(
        `UPDATE dm_mensajes SET oculto_para = array_append(COALESCE(oculto_para, '{}'::text[]), $2) WHERE id = $1`,
        [msjId, user.user_key]
      );
    }
    await notify('comunidad_dm', { conv: conv.id });
    res.json({ ok: true, paraTodos });
  } catch (e) { next(e); }
});

// POST /api/comunidad/dm/:otroKey/tema  { userKey, gradient, color, emoji }
//   El tema es COMPARTIDO: ambos lo ven. Genera avisos si cambia fondo/icono.
r.post('/dm/:otroKey/tema', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const otroKey = String(req.params.otroKey || '').trim();
    if (!user || !otroKey) return res.status(401).json({ error: 'Inicia sesión' });
    const gradient = String(req.body?.gradient || '').slice(0, 300) || null;
    const color = String(req.body?.color || '').slice(0, 20) || null;
    const emoji = String(req.body?.emoji || '').trim().slice(0, 8) || null;
    const conv = await dmConversacion(user.user_key, otroKey, true);

    const fondoCambio = (conv.tema_gradient || null) !== gradient || (conv.tema_color || null) !== color;
    const emojiCambio = (conv.tema_emoji || null) !== emoji;

    await query(
      'UPDATE dm_conversaciones SET tema_gradient = $2, tema_color = $3, tema_emoji = $4 WHERE id = $1',
      [conv.id, gradient, color, emoji]
    );
    if (fondoCambio) await insertarSistema(conv, user, 'diseno');
    if (emojiCambio) await insertarSistema(conv, user, `icono|${emoji || ''}`);

    await notify('comunidad_dm', { conv: conv.id, tema: true });
    res.json({ ok: true, tema: { gradient: gradient || '', color: color || '', emoji: emoji || '' } });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/dm/:otroKey/apodo  { userKey, alias }  (compartido entre ambos)
r.put('/dm/:otroKey/apodo', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    const otroKey = String(req.params.otroKey || '').trim();
    if (!user || !otroKey) return res.status(401).json({ error: 'Inicia sesión' });
    const mi = String(req.body?.miApodo || '').trim().slice(0, 60) || null;
    const su = String(req.body?.suApodo || '').trim().slice(0, 60) || null;
    const conv = await dmConversacion(user.user_key, otroKey, true);
    const esA = String(conv.a_key) === String(user.user_key);
    const aAlias = esA ? mi : su;
    const bAlias = esA ? su : mi;
    const prev = (await query('SELECT a_alias, b_alias FROM dm_apodos WHERE conversacion_id = $1', [conv.id])).rows[0] || {};
    await query(
      `INSERT INTO dm_apodos (conversacion_id, a_alias, b_alias, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (conversacion_id) DO UPDATE SET a_alias = EXCLUDED.a_alias, b_alias = EXCLUDED.b_alias, updated_at = NOW()`,
      [conv.id, aAlias, bAlias]
    );
    // Aviso en el chat (mensaje de sistema) si cambió algún apodo.
    if ((prev.a_alias || null) !== aAlias || (prev.b_alias || null) !== bAlias) {
      await insertarSistema(conv, user, 'apodos');
    }
    await notify('comunidad_dm', { conv: conv.id, apodo: true });
    res.json({ ok: true, miApodo: mi, suApodo: su });
  } catch (e) { next(e); }
});

// POST /api/comunidad/dm/:otroKey/leido  { userKey }
r.post('/dm/:otroKey/leido', async (req, res, next) => {
  try {
    const userKey = String(req.body?.userKey || '').trim();
    const otroKey = String(req.params.otroKey || '').trim();
    if (!userKey || !otroKey) return res.status(400).json({ error: 'Datos inválidos' });
    const conv = await dmConversacion(userKey, otroKey, false);
    if (conv) {
      await query(
        `INSERT INTO dm_leido (conversacion_id, user_key, ultimo_leido) VALUES ($1, $2, NOW())
         ON CONFLICT (conversacion_id, user_key) DO UPDATE SET ultimo_leido = NOW()`,
        [conv.id, userKey]
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/comunidad/dm/mensajes/:msjId/reaccion  { userKey, emoji }
r.post('/dm/mensajes/:msjId/reaccion', async (req, res, next) => {
  try {
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey);
    const emoji = String(req.body?.emoji || '').slice(0, 8);
    if (!msjId || !user || !emoji) return res.status(401).json({ error: 'Inicia sesión para reaccionar' });
    const existe = await query('SELECT 1 FROM dm_mensajes WHERE id = $1 AND activo = TRUE', [msjId]);
    if (!existe.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const prev = await query('SELECT emoji FROM dm_mensaje_reacciones WHERE mensaje_id = $1 AND user_key = $2', [msjId, user.user_key]);
    if (prev.rows[0]?.emoji === emoji) {
      await query('DELETE FROM dm_mensaje_reacciones WHERE mensaje_id = $1 AND user_key = $2', [msjId, user.user_key]);
      return res.json({ ok: true, quitada: true });
    }
    await query(
      `INSERT INTO dm_mensaje_reacciones (mensaje_id, user_key, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (mensaje_id, user_key) DO UPDATE SET emoji = EXCLUDED.emoji`,
      [msjId, user.user_key, emoji]
    );
    res.json({ ok: true });
    await notify('comunidad_dm', { msj: msjId });
  } catch (e) { next(e); }
});

// GET /api/comunidad/usuarios?q=&userKey=  -> buscar usuarios (para mensajes)
r.get('/usuarios', async (req, res, next) => {
  try {
    const me = String(req.query.userKey || '').trim();
    if (!me) return res.json({ data: [] });
    const q = String(req.query.q || '').trim().toLowerCase();
    const params = [me];
    let where = 'user_key <> $1 AND email_verified = TRUE';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (lower(usuario) LIKE $${params.length} OR lower(COALESCE(nombre,'')) LIKE $${params.length})`;
    }
    const { rows } = await query(
      `SELECT id, usuario, nombre, avatar
         FROM users
        WHERE ${where}
        ORDER BY (usuario IS NULL), usuario ASC
        LIMIT 20`,
      params
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// GET /api/comunidad/amigos?userKey=&q=&page=&limit=&filtro=todos|favoritos|pendientes|sugerencias
// Lista de amistades aceptadas (amigos) o pendientes/sugerencias.
// Buscador + paginado (scroll infinito).
r.get('/amigos', async (req, res, next) => {
  try {
    const me = String(req.query.userKey || '').trim();
    if (!me) return res.json({ data: [], total: 0, page: 1, pages: 1 });
    const q = String(req.query.q || '').trim().toLowerCase();
    const filtro = ['favoritos', 'pendientes', 'sugerencias'].includes(req.query.filtro) ? req.query.filtro : 'todos';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const offset = (page - 1) * limit;

    const like = q ? `%${q}%` : null;

    // Todos: cualquier persona verificada de la plataforma (con estado de amistad).
    if (filtro === 'todos') {
      const params = [me];
      if (like) params.push(like);
      const likeP = like ? `$${params.length}` : 'NULL';
      const orden = req.query.orden === 'nuevos' ? 'nuevos' : 'alfabetico';
      const base = `
         FROM users u
         LEFT JOIN channels ch ON ch.user_key = u.user_key
        WHERE u.email_verified = TRUE
          AND u.user_key <> $1
          ${like ? `AND (lower(COALESCE(u.usuario,'')) LIKE ${likeP} OR lower(COALESCE(u.nombre,'')) LIKE ${likeP})` : ''}`;
      const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
      const { rows } = await query(
        `SELECT u.user_key, u.usuario, u.nombre, u.avatar,
                ch.slug AS canal_slug, ch.pais AS canal_pais, ch.seguidores AS canal_seguidores,
                (SELECT am.estado FROM amistades am
                  WHERE (am.a_key = u.user_key AND am.b_key = $1)
                     OR (am.b_key = u.user_key AND am.a_key = $1)
                  LIMIT 1) AS amistad_estado,
                (SELECT am.solicitante FROM amistades am
                  WHERE (am.a_key = u.user_key AND am.b_key = $1)
                     OR (am.b_key = u.user_key AND am.a_key = $1)
                  LIMIT 1) AS amistad_solicitante,
                FALSE AS favorito
                ${base}
          ORDER BY ${orden === 'nuevos' ? 'u.created_at DESC NULLS LAST' : "(u.usuario IS NULL), u.usuario ASC"}
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      const total = countRes.rows[0]?.total || 0;
      return res.json({ data: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    // Sugerencias: personas verificadas sin amistad aceptada conmigo.
    if (filtro === 'sugerencias') {
      const params = [me];
      if (like) params.push(like);
      const likeP = like ? `$${params.length}` : 'NULL';
      const base = `
         FROM users u
         LEFT JOIN channels ch ON ch.user_key = u.user_key
        WHERE u.email_verified = TRUE
          AND u.user_key <> $1
          AND NOT EXISTS (
            SELECT 1 FROM amistades am
             WHERE am.estado = 'aceptado'
               AND ((am.a_key = $1 AND am.b_key = u.user_key) OR (am.b_key = $1 AND am.a_key = u.user_key))
          )${like ? ` AND (lower(COALESCE(u.usuario,'')) LIKE ${likeP} OR lower(COALESCE(u.nombre,'')) LIKE ${likeP})` : ''}`;
      const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
      const { rows } = await query(
        `SELECT u.user_key, u.usuario, u.nombre, u.avatar,
                ch.slug AS canal_slug, ch.pais AS canal_pais, ch.seguidores AS canal_seguidores,
                FALSE AS favorito
                ${base}
          ORDER BY (ch.seguidores IS NULL), ch.seguidores DESC, u.usuario ASC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      const total = countRes.rows[0]?.total || 0;
      return res.json({ data: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    }

    // Pendientes: solicitudes que YO recibí (el otro es el solicitante).
    const estado = filtro === 'pendientes' ? 'pendiente' : 'aceptado';
    const params = [me, me];
    let extra = '';
    if (like) {
      params.push(like);
      extra += ` AND (lower(COALESCE(u.usuario,'')) LIKE $${params.length} OR lower(COALESCE(u.nombre,'')) LIKE $${params.length})`;
    }
    if (filtro === 'favoritos') {
      extra += ' AND ((am.a_key = $1 AND am.favorito_a = TRUE) OR (am.b_key = $1 AND am.favorito_b = TRUE))';
    }
    if (filtro === 'pendientes') extra += ' AND am.solicitante <> $1';

    const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
    const { rows } = await query(
      `SELECT u.user_key, u.usuario, u.nombre, u.avatar,
              ch.slug AS canal_slug, ch.pais AS canal_pais, ch.seguidores AS canal_seguidores,
              ((am.a_key = $1 AND am.favorito_a = TRUE) OR (am.b_key = $1 AND am.favorito_b = TRUE)) AS favorito
              ${base}
        ORDER BY favorito DESC, (u.usuario IS NULL), u.usuario ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const total = countRes.rows[0]?.total || 0;
    res.json({ data: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// GET /api/comunidad/buscar?q=&userKey=&filtro=todos|personas|comunidad|publicaciones&page=&limit=
// Busca personas, comunidades y publicaciones. Paginado para scroll infinito.
r.get('/buscar', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const me = String(req.query.userKey || '').trim();
    const filtro = ['personas', 'comunidad', 'grupos', 'publicaciones'].includes(req.query.filtro)
      ? req.query.filtro : 'todos';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(30, Math.max(5, Number(req.query.limit) || 12));
    const limP = Math.min(30, Math.max(1, Number(req.query.limitPersonas) || limit));
    const limG = Math.min(30, Math.max(1, Number(req.query.limitGrupos) || limit));
    const limM = Math.min(30, Math.max(1, Number(req.query.limitPosts) || limit));
    const offset = (page - 1) * limit;
    const like = `%${q}%`;
    const out = { personas: [], grupos: [], posts: [] };
    const buscaPersonas = filtro === 'todos' || filtro === 'personas';
    const buscaGrupos = filtro === 'todos' || filtro === 'comunidad' || filtro === 'grupos';
    const buscaPosts = filtro === 'todos' || filtro === 'publicaciones';

    if (!q) return res.json({ data: out, page, hasMore: false });

    // Personas (con datos de su canal + estado de amistad)
    if (buscaPersonas) {
      const params = [like];
      let extra = '';
      if (me) { params.push(me); extra = ` AND u.user_key <> $${params.length}`; }
      const meParam = me ? `$${params.length}` : 'NULL';
      const { rows } = await query(
        `SELECT u.user_key, u.usuario, u.nombre, u.avatar,
                ch.slug AS canal_slug, ch.descripcion AS canal_desc, ch.pais AS canal_pais,
                ch.seguidores AS canal_seguidores,
                (SELECT am.estado FROM amistades am
                  WHERE (am.a_key = u.user_key AND am.b_key = ${meParam})
                     OR (am.b_key = u.user_key AND am.a_key = ${meParam})
                  LIMIT 1) AS amistad_estado,
                (SELECT am.solicitante FROM amistades am
                  WHERE (am.a_key = u.user_key AND am.b_key = ${meParam})
                     OR (am.b_key = u.user_key AND am.a_key = ${meParam})
                  LIMIT 1) AS amistad_solicitante
           FROM users u
           LEFT JOIN channels ch ON ch.user_key = u.user_key
          WHERE u.email_verified = TRUE
            AND (lower(COALESCE(u.usuario,'')) LIKE $1 OR lower(COALESCE(u.nombre,'')) LIKE $1)${extra}
          ORDER BY (u.usuario IS NULL), u.usuario ASC
          LIMIT ${limP} OFFSET ${offset}`,
        params
      );
      out.personas = rows;
    }

    // Comunidades (con contador de en línea real, como en las tarjetas).
    if (buscaGrupos) {
      const { rows } = await query(
        `SELECT c.id, c.nombre, c.slug, c.avatar, c.privacidad, c.modo_union, c.miembros,
                (SELECT COUNT(*)::int FROM comunidad_miembros cm
                   JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
                  WHERE cm.comunidad_id = c.id
                    AND pr.last_seen > NOW() - INTERVAL '2 minutes') AS activos
           FROM comunidades c
          WHERE c.activo = TRUE
            AND (lower(c.nombre) LIKE $1 OR lower(COALESCE(c.descripcion,'')) LIKE $1)
          ORDER BY c.miembros DESC
          LIMIT ${limG} OFFSET ${offset}`,
        [like]
      );
      out.grupos = rows;
    }

    // Publicaciones
    if (buscaPosts) {
      const params = [like];
      let likedExpr = 'FALSE';
      let savedExpr = 'FALSE';
      if (me) {
        params.push(me);
        likedExpr = `EXISTS (SELECT 1 FROM comunidad_post_likes l WHERE l.post_id = p.id AND l.user_key = $${params.length})`;
        savedExpr = `EXISTS (SELECT 1 FROM comunidad_post_guardados g2 WHERE g2.post_id = p.id AND g2.user_key = $${params.length})`;
      }
      const { rows } = await query(
        `SELECT p.*, c.nombre AS grupo_nombre,
                ${likedExpr} AS liked, ${savedExpr} AS saved
           FROM comunidad_posts p
           LEFT JOIN comunidades c ON c.id = p.comunidad_id
          WHERE p.activo = TRUE
            AND (lower(COALESCE(p.texto,'')) LIKE $1 OR lower(COALESCE(p.usuario,'')) LIKE $1)
          ORDER BY p.created_at DESC
          LIMIT ${limM} OFFSET ${offset}`,
        params
      );
      out.posts = rows;
    }

    const total = out.personas.length + out.grupos.length + out.posts.length;
    res.json({ data: out, page, hasMore: total >= limit });
  } catch (e) { next(e); }
});

// POST /api/comunidad/mensajes-directos  { userKey, ids: [..], texto }
// Envía un mensaje en masa: crea una notificación personal para cada usuario.
r.post('/mensajes-directos', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para enviar mensajes' });
    const texto = String(req.body?.texto || '').trim().slice(0, 1000);
    if (!texto) return res.status(400).json({ error: 'Escribe un mensaje' });
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map((n) => Number.parseInt(String(n), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 100);
    if (!ids.length) return res.status(400).json({ error: 'Elige al menos un destinatario' });

    const { rows } = await query(
      'SELECT user_key FROM users WHERE id = ANY($1::int[]) AND user_key <> $2',
      [ids, user.user_key]
    );
    let enviados = 0;
    for (const u of rows) {
      const id = await crearNotificacion({
        userKey: u.user_key,
        tipo: 'mensaje',
        titulo: `${nameOf(user)} te envió un mensaje`,
        texto,
        url: '/chat',
        icono: 'mail',
        actor: user,
        meta: { directo: true },
      });
      if (id) enviados += 1;
    }
    res.json({ ok: true, enviados });
  } catch (e) { next(e); }
});

// ============================================================
// PRESENCIA (usuarios en línea)
// ============================================================

// ============================================================
// AMISTADES (solicitudes, amigos y favoritos)
// ============================================================
function parAmistad(a, b) {
  const x = String(a); const y = String(b);
  return x < y ? [x, y] : [y, x];
}

// GET /api/comunidad/amistad/:userKey?me=  -> estado entre dos usuarios
r.get('/amistad/:userKey', async (req, res, next) => {
  try {
    const me = String(req.query.me || '').trim();
    const otro = String(req.params.userKey || '').trim();
    if (!me || !otro) return res.json({ estado: null });
    if (me === otro) return res.json({ estado: 'yo' });
    const [a, b] = parAmistad(me, otro);
    const { rows } = await query('SELECT * FROM amistades WHERE a_key = $1 AND b_key = $2', [a, b]);
    const row = rows[0];
    if (!row) return res.json({ estado: null });
    const soyA = String(row.a_key) === String(me);
    return res.json({
      estado: row.estado,
      solicitante: row.solicitante,
      miSolicitud: String(row.solicitante) === String(me),
      favorito: soyA ? row.favorito_a : row.favorito_b,
    });
  } catch (e) { next(e); }
});

// POST /api/comunidad/amistad/:userKey  { userKey: me, accion }
r.post('/amistad/:userKey', async (req, res, next) => {
  try {
    const me = String(req.body?.userKey || '').trim();
    const otro = String(req.params.userKey || '').trim();
    const accion = String(req.body?.accion || '').trim();
    if (!me || !otro || me === otro) return res.status(400).json({ error: 'Datos inválidos' });
    const [a, b] = parAmistad(me, otro);
    const soyA = a === me;

    if (accion === 'solicitar') {
      // Si ya hay una solicitud pendiente del mismo solicitante, no duplica aviso.
      const prev = await query('SELECT solicitante, estado FROM amistades WHERE a_key = $1 AND b_key = $2', [a, b]);
      const yaPendiente = prev.rows[0]?.estado === 'pendiente' && String(prev.rows[0]?.solicitante) === String(me);
      if (prev.rows[0]?.estado === 'aceptado') return res.json({ ok: true, yaAmigos: true });

      await query(
        `INSERT INTO amistades (a_key, b_key, solicitante, estado) VALUES ($1, $2, $3, 'pendiente')
         ON CONFLICT (a_key, b_key) DO UPDATE SET solicitante = $3, estado = 'pendiente', updated_at = NOW()
         WHERE amistades.estado <> 'aceptado'`,
        [a, b, me]
      );

      if (!yaPendiente) {
        try {
          const u = await query('SELECT user_key, usuario, nombre, avatar FROM users WHERE user_key = $1', [me]);
          const actor = u.rows[0] || null;
          // Borra avisos de amistad viejos no leidos de este mismo actor (evita repetidos).
          await query(
            `DELETE FROM notificaciones
              WHERE user_key = $1 AND tipo = 'amistad' AND actor_key = $2
                AND NOT EXISTS (
                  SELECT 1 FROM notificaciones_leidas nl
                   WHERE nl.notificacion_id = notificaciones.id AND nl.user_key = $1
                )`,
            [otro, me]
          );
          await crearNotificacion({
            userKey: otro,
            tipo: 'amistad',
            titulo: 'Nueva solicitud de amistad',
            texto: `${nameOf(actor || {})} quiere ser tu amigo`,
            url: otroCanalUrl({ user_key: me }),
            icono: 'person-add',
            actor,
            meta: { de: me, amistad: true },
          });
        } catch { /* opcional */ }
      }
      return res.json({ ok: true, pendiente: true });
    } else if (accion === 'cancelar') {
      // Elimina la solicitud pendiente sin importar quien la creo: da igual
      // cancelar (el que invito) o rechazar (el invitado). Ambos casos la
      // solicitud deja de existir y el perfil actualiza su estado.
      await query("DELETE FROM amistades WHERE a_key = $1 AND b_key = $2 AND estado = 'pendiente'", [a, b]);
      // No desaparece el aviso: pasa a ser registro "Solicitud cancelada"
      // sin botones de aceptar/cancelar (solo ver perfil).
      await query(
        `UPDATE notificaciones
            SET titulo = 'Solicitud cancelada',
                meta = (COALESCE(meta, '{}'::jsonb) - 'amistad') || '{"cancelada": true}'::jsonb
          WHERE tipo = 'amistad' AND user_key IN ($1, $2) AND actor_key IN ($1, $2)
            AND lower(titulo) LIKE '%solicitud%' AND lower(titulo) NOT LIKE '%aceptad%'`,
        [me, otro]
      );
    } else if (accion === 'aceptar') {
      await query("UPDATE amistades SET estado = 'aceptado', updated_at = NOW() WHERE a_key = $1 AND b_key = $2 AND estado = 'pendiente'", [a, b]);
      // Limpia los avisos de solicitud pendiente (leidos o no) en ambos lados.
      await query(
        `DELETE FROM notificaciones
          WHERE tipo = 'amistad' AND user_key IN ($1, $2) AND actor_key IN ($1, $2)
            AND lower(titulo) LIKE '%solicitud%' AND lower(titulo) NOT LIKE '%aceptad%'`,
        [me, otro]
      );
      try {
        const u = await query('SELECT user_key, usuario, nombre, avatar FROM users WHERE user_key = $1', [me]);
        await crearNotificacion({
          userKey: otro,
          tipo: 'amistad',
          titulo: 'Solicitud aceptada',
          texto: `${nameOf(u.rows[0] || {})} aceptó tu solicitud de amistad`,
          url: otroCanalUrl({ user_key: me }),
          icono: 'people',
          actor: u.rows[0] || null,
          meta: { de: me },
        });
      } catch { /* opcional */ }
    } else if (accion === 'rechazar') {
      await query("DELETE FROM amistades WHERE a_key = $1 AND b_key = $2 AND estado = 'pendiente'", [a, b]);
      await query(
        `DELETE FROM notificaciones
          WHERE tipo = 'amistad' AND user_key IN ($1, $2) AND actor_key IN ($1, $2)`,
        [me, otro]
      );
    } else if (accion === 'eliminar') {
      await query('DELETE FROM amistades WHERE a_key = $1 AND b_key = $2', [a, b]);
    } else if (accion === 'favorito' || accion === 'nofavorito') {
      const col = soyA ? 'favorito_a' : 'favorito_b';
      await query(`UPDATE amistades SET ${col} = $3, updated_at = NOW() WHERE a_key = $1 AND b_key = $2`, [a, b, accion === 'favorito']);
    } else {
      return res.status(400).json({ error: 'Acción inválida' });
    }

    await notify('amistad', { de: me, para: otro });
    // Aviso dirigido a ambos (el SSE lo reenvia a todos; cada cliente filtra
    // y recarga sus notificaciones al instante).
    try { await publishEvent('notificacion', { userKey: me, tipo: 'amistad' }); } catch { /* opcional */ }
    try { await publishEvent('notificacion', { userKey: otro, tipo: 'amistad' }); } catch { /* opcional */ }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/canal-slug/:userKey  -> slug del canal publico del usuario
// (para enlazar a /canal/<slug>; el userKey no sirve como slug).
r.get('/canal-slug/:userKey', async (req, res, next) => {
  try {
    const userKey = String(req.params.userKey || '').trim();
    if (!userKey) return res.json({ slug: null });
    const { rows } = await query(
      'SELECT slug FROM channels WHERE user_key = $1 AND activo = TRUE LIMIT 1',
      [userKey]
    );
    res.json({ slug: rows[0]?.slug || null });
  } catch (e) { next(e); }
});

// GET /api/comunidad/presencia -> actividad real desde la BD (last_seen).
// Devuelve la edad en SEGUNDOS (reloj de la BD -> sin problemas de zona
// horaria) y 7 dias de historial para que el frontend muestre "hace X" a los
// desconectados y "en línea" solo si edad < 2 min (latido global cada 60s).
r.get('/presencia', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT user_key, usuario, avatar, last_seen,
              EXTRACT(EPOCH FROM (NOW() - last_seen))::int AS edad
         FROM comunidad_presencia
        WHERE last_seen > NOW() - INTERVAL '7 days'
        ORDER BY last_seen DESC LIMIT 200`
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

// POST /api/comunidad/presencia  (heartbeat)
r.post('/presencia', async (req, res, next) => {
  try {
    const user = await resolveUser(req.body?.userKey);
    if (!user) return res.json({ ok: false });
    await query(
      `INSERT INTO comunidad_presencia (user_key, usuario, avatar, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_key) DO UPDATE SET usuario = EXCLUDED.usuario,
         avatar = EXCLUDED.avatar, last_seen = NOW()`,
      [user.user_key, nameOf(user), user.avatar || null]
    );
    res.json({ ok: true });
    await notify('comunidad_presencia', { user_key: user.user_key });
  } catch (e) { next(e); }
});

// ============================================================
// REPORTES
// ============================================================

// POST /api/comunidad/reportes  { userKey, tipo, target_id, motivo, detalle }
r.post('/reportes', async (req, res, next) => {
  try {
    const b = req.body || {};
    const user = await resolveUser(b.userKey);
    const tipo = ['post', 'comentario', 'mensaje', 'story', 'comunidad'].includes(b.tipo) ? b.tipo : 'post';
    const target = intOrNull(b.target_id);
    if (!target) return res.status(400).json({ error: 'Objetivo inválido' });
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim().slice(0, 60) || null;
    await query(
      `INSERT INTO comunidad_reportes (tipo, target_id, comunidad_id, user_key, motivo, detalle, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tipo, target, intOrNull(b.comunidad_id), user?.user_key || null,
       String(b.motivo || '').slice(0, 80) || null, String(b.detalle || '').slice(0, 2000) || null, ip]
    );
    res.status(201).json({ ok: true });
    await notify('comunidad_reporte', { tipo, target });
  } catch (e) { next(e); }
});

// ============================================================
// ADMIN (Bearer) — moderación de TODO
// ============================================================

// GET /api/comunidad/admin/resumen
r.get('/admin/resumen', authRequired, async (req, res, next) => {
  try {
    const [grupos, posts, mensajes, stories, reportes, enLinea, solicitudes] = await Promise.all([
      query('SELECT COUNT(*)::int AS n FROM comunidades WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM comunidad_posts WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM comunidad_mensajes WHERE activo = TRUE'),
      query('SELECT COUNT(*)::int AS n FROM comunidad_stories WHERE activo = TRUE AND expires_at > NOW()'),
      query("SELECT COUNT(*)::int AS n FROM comunidad_reportes WHERE estado = 'pendiente'"),
      query("SELECT COUNT(*)::int AS n FROM comunidad_presencia WHERE last_seen > NOW() - INTERVAL '2 minutes'"),
      query("SELECT COUNT(*)::int AS n FROM comunidad_solicitudes WHERE estado = 'pendiente'"),
    ]);
    res.json({
      grupos: grupos.rows[0].n, posts: posts.rows[0].n, mensajes: mensajes.rows[0].n,
      stories: stories.rows[0].n, reportes: reportes.rows[0].n, enLinea: enLinea.rows[0].n,
      solicitudes: solicitudes.rows[0].n,
    });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/usuarios?q=&rol=&page=&limit=
r.get('/admin/usuarios', authRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const rol = String(req.query.rol || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const params = [];
    const where = ['1=1'];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(lower(COALESCE(u.usuario,'')) LIKE $${params.length} OR lower(COALESCE(u.nombre,'')) LIKE $${params.length} OR lower(COALESCE(u.email,'')) LIKE $${params.length})`);
    }
    if (rol) { params.push(rol); where.push(`u.rol = $${params.length}`); }
    const whereSql = where.join(' AND ');
    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${whereSql}`, params);
    const { rows } = await query(
      `SELECT u.id, u.user_key, u.usuario, u.nombre, u.email, u.rol, u.subida_mb, u.email_verified, u.created_at
         FROM users u WHERE ${whereSql}
        ORDER BY u.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = totalQ.rows[0].n;
    res.json({ data: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/admin/usuarios/:id  { subida_mb: null | -1 | N }
r.put('/admin/usuarios/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: 'Usuario inválido' });
    const b = req.body || {};
    let val = null;
    if (b.subida_mb === null || b.subida_mb === '' || b.subida_mb === undefined) {
      val = null; // estándar (200 MB)
    } else {
      const n = Number(b.subida_mb);
      val = Number.isFinite(n) ? (n < 0 ? -1 : Math.round(n)) : null;
    }
    await query('UPDATE users SET subida_mb = $2 WHERE id = $1', [id, val]);
    res.json({ ok: true, subida_mb: val });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/grupos
r.get('/admin/grupos', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM comunidad_posts p WHERE p.comunidad_id = c.id AND p.activo = TRUE) AS posts,
              (SELECT COUNT(*)::int FROM comunidad_mensajes m WHERE m.comunidad_id = c.id AND m.activo = TRUE) AS mensajes
         FROM comunidades c ORDER BY c.activo DESC, c.id DESC LIMIT 200`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/admin/grupos/:id  { reglas, privacidad, activo, nombre, descripcion }
r.put('/admin/grupos/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const b = req.body || {};
    if (!id) return res.status(400).json({ error: 'Comunidad inválida' });
    await query(
      `UPDATE comunidades SET
         reglas      = COALESCE($2, reglas),
         privacidad  = COALESCE($3, privacidad),
         activo      = COALESCE($4, activo),
         nombre      = COALESCE($5, nombre),
         descripcion = COALESCE($6, descripcion),
         modo_union  = COALESCE($7, modo_union),
         destacado   = COALESCE($8, destacado),
         updated_at  = NOW()
       WHERE id = $1`,
      [id, b.reglas !== undefined ? String(b.reglas).slice(0, 4000) : null,
       b.privacidad !== undefined ? (b.privacidad === 'privada' ? 'privada' : 'publica') : null,
       b.activo !== undefined ? !!b.activo : null,
       b.nombre !== undefined ? String(b.nombre).slice(0, 120) : null,
       b.descripcion !== undefined ? String(b.descripcion).slice(0, 2000) : null,
       b.modo_union !== undefined ? (b.modo_union === 'invitacion' ? 'invitacion' : 'libre') : null,
       b.destacado !== undefined ? !!b.destacado : null]
    );
    await cacheDel('cache:comunidad');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/solicitudes?estado=
r.get('/admin/solicitudes', authRequired, async (req, res, next) => {
  try {
    const estado = String(req.query.estado || '').trim();
    const params = [];
    let where = '1=1';
    if (estado) { params.push(estado); where = `s.estado = $${params.length}`; }
    const { rows } = await query(
      `SELECT s.*, c.nombre AS grupo_nombre
         FROM comunidad_solicitudes s
         LEFT JOIN comunidades c ON c.id = s.comunidad_id
        WHERE ${where}
        ORDER BY s.created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/admin/solicitudes/:id  { estado: 'aprobado'|'rechazado'|'pendiente' }
r.put('/admin/solicitudes/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const b = req.body || {};
    const estado = ['aprobado', 'rechazado', 'pendiente'].includes(b.estado) ? b.estado : 'rechazado';
    const sol = await query('SELECT * FROM comunidad_solicitudes WHERE id = $1', [id]);
    const s = sol.rows[0];
    if (!s) return res.status(404).json({ error: 'Solicitud no encontrada' });
    await query('UPDATE comunidad_solicitudes SET estado = $2 WHERE id = $1', [id, estado]);
    if (estado === 'aprobado') {
      await query(
        `INSERT INTO comunidad_miembros (comunidad_id, user_key, usuario)
         VALUES ($1, $2, $3) ON CONFLICT (comunidad_id, user_key) DO NOTHING`,
        [s.comunidad_id, s.user_key, s.usuario]
      );
      await query(
        'UPDATE comunidades SET miembros = (SELECT COUNT(*) FROM comunidad_miembros WHERE comunidad_id = $1) WHERE id = $1',
        [s.comunidad_id]
      );
    }
    if (estado === 'aprobado' || estado === 'rechazado') {
      const gInfo = await query('SELECT nombre FROM comunidades WHERE id = $1', [s.comunidad_id]);
      await crearNotificacion({
        userKey: s.user_key,
        tipo: estado === 'aprobado' ? 'solicitud_aceptada' : 'solicitud_rechazada',
        titulo: estado === 'aprobado' ? 'Aceptaron tu solicitud' : 'Rechazaron tu solicitud',
        texto: `Comunidad: ${gInfo.rows[0]?.nombre || ''}`,
        url: `/comunidad?grupo=${s.comunidad_id}`,
        icono: estado === 'aprobado' ? 'checkmark-circle' : 'close-circle',
        meta: { comunidad_id: s.comunidad_id, tipo: estado },
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/posts?q=&grupo=&page=
r.get('/admin/posts', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const grupo = intOrNull(req.query.grupo);
    const q = String(req.query.q || '').trim().toLowerCase();
    const params = [];
    const where = ['1=1'];
    if (grupo) { params.push(grupo); where.push(`p.comunidad_id = $${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(lower(p.usuario) LIKE $${params.length} OR lower(COALESCE(p.texto,'')) LIKE $${params.length})`); }

    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM comunidad_posts p WHERE ${where.join(' AND ')}`, params);
    const { rows } = await query(
      `SELECT p.*, c.nombre AS grupo_nombre
         FROM comunidad_posts p LEFT JOIN comunidades c ON c.id = p.comunidad_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const total = totalQ.rows[0].n;
    res.json({ data: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/admin/posts/:id
r.delete('/admin/posts/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    await query('UPDATE comunidad_posts SET activo = FALSE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/mensajes?grupo=&q=
r.get('/admin/mensajes', authRequired, async (req, res, next) => {
  try {
    const grupo = intOrNull(req.query.grupo);
    const q = String(req.query.q || '').trim().toLowerCase();
    const params = [];
    const where = ['m.activo = TRUE'];
    if (grupo) { params.push(grupo); where.push(`m.comunidad_id = $${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(lower(m.usuario) LIKE $${params.length} OR lower(COALESCE(m.texto,'')) LIKE $${params.length})`); }
    params.push(100);
    const { rows } = await query(
      `SELECT m.*, c.nombre AS grupo_nombre
         FROM comunidad_mensajes m LEFT JOIN comunidades c ON c.id = m.comunidad_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/admin/mensajes/:id
r.delete('/admin/mensajes/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    await query('UPDATE comunidad_mensajes SET activo = FALSE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/stories
r.get('/admin/stories', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM comunidad_stories ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// DELETE /api/comunidad/admin/stories/:id
r.delete('/admin/stories/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    await query('UPDATE comunidad_stories SET activo = FALSE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/comunidad/admin/reportes?estado=
r.get('/admin/reportes', authRequired, async (req, res, next) => {
  try {
    const estado = String(req.query.estado || '').trim();
    const params = [];
    let where = '1=1';
    if (estado) { params.push(estado); where = `estado = $${params.length}`; }
    const { rows } = await query(
      `SELECT * FROM comunidad_reportes WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  } catch (e) { next(e); }
});

// PUT /api/comunidad/admin/reportes/:id  { estado, nota_admin }
r.put('/admin/reportes/:id', authRequired, async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    const b = req.body || {};
    const estado = ['pendiente', 'revisado', 'descartado'].includes(b.estado) ? b.estado : 'revisado';
    await query(
      `UPDATE comunidad_reportes SET estado = $2, nota_admin = COALESCE($3, nota_admin), revisado_en = NOW() WHERE id = $1`,
      [id, estado, b.nota_admin !== undefined ? String(b.nota_admin).slice(0, 2000) : null]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
