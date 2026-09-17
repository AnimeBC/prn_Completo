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

const r = Router();

const FILTROS = ['recientes', 'videos', 'fotos', 'populares', 'guardados'];
const TIPOS_MSJ = ['texto', 'foto', 'video', 'audio', 'sticker', 'emoji'];

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
    const whereSql = where.join(' AND ');

    let miembro = 'FALSE';
    let dueno = 'FALSE';
    let solicitud = 'NULL';
    if (userKey) {
      params.push(userKey);
      miembro = `EXISTS (SELECT 1 FROM comunidad_miembros cmx WHERE cmx.comunidad_id = c.id AND cmx.user_key = $${params.length})`;
      dueno = `(c.user_key = $${params.length})`;
      solicitud = `(SELECT cs.estado FROM comunidad_solicitudes cs WHERE cs.comunidad_id = c.id AND cs.user_key = $${params.length} LIMIT 1)`;
    }

    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM comunidades c WHERE ${whereSql}`, params);
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const { rows } = await query(
      `SELECT c.id, c.nombre, c.slug, c.descripcion, c.avatar, c.banner, c.reglas, c.privacidad,
              c.modo_union, c.miembros, c.destacado, c.created_at,
              ${miembro} AS miembro, ${dueno} AS soy_dueno, ${solicitud} AS solicitud,
              (SELECT COUNT(*)::int FROM comunidad_miembros cm
                 JOIN comunidad_presencia pr ON pr.user_key = cm.user_key
                WHERE cm.comunidad_id = c.id
                  AND pr.last_seen > NOW() - INTERVAL '5 minutes') AS activos,
              ((SELECT COALESCE(SUM(jsonb_array_length(p.media)), 0)::int
                  FROM comunidad_posts p WHERE p.comunidad_id = c.id AND p.activo = TRUE)
               + (SELECT COUNT(*)::int FROM comunidad_mensajes m
                  WHERE m.comunidad_id = c.id AND m.activo = TRUE AND m.media IS NOT NULL)) AS archivos
         FROM comunidades c
        WHERE ${whereSql}
        ORDER BY c.destacado DESC, c.miembros DESC, c.id ASC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset]
    );
    const total = totalQ.rows[0].n;
    res.json({ data: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
});

// GET /api/comunidad/grupos/:id  (+ mensajes recientes + si soy miembro)
r.get('/grupos/:id', async (req, res, next) => {
  try {
    const id = intOrNull(req.params.id);
    if (!id) return res.status(404).json({ error: 'Comunidad no encontrada' });
    const userKey = String(req.query.userKey || '').trim();
    const { rows } = await query('SELECT * FROM comunidades WHERE id = $1 AND activo = TRUE', [id]);
    const grupo = rows[0];
    if (!grupo) return res.status(404).json({ error: 'Comunidad no encontrada' });
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
        WHERE cm.comunidad_id = $1 AND pr.last_seen > NOW() - INTERVAL '5 minutes'`,
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

    // Privado o por invitación -> queda como solicitud pendiente
    if (g.rows[0].privacidad === 'privada' || g.rows[0].modo_union === 'invitacion') {
      await query(
        `INSERT INTO comunidad_solicitudes (comunidad_id, user_key, usuario, mensaje)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (comunidad_id, user_key)
         DO UPDATE SET estado = 'pendiente', mensaje = EXCLUDED.mensaje, created_at = NOW()`,
        [id, user.user_key, nameOf(user), String(req.body?.mensaje || '').slice(0, 500) || null]
      );
      await notify('comunidad_solicitud', { comunidad_id: id, user_key: user.user_key });
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
    if (grupo) { params.push(grupo); where.push(`p.comunidad_id = $${params.length}`); }
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
    res.json({ data: rows });
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
      const url = saveFile(f, user.user_key, 'posts');
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
      media = saveFile(req.file, user.user_key, 'stories');
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
    const { rows } = await query(
      `SELECT m.id, m.user_key, m.usuario, m.avatar, m.texto, m.tipo, m.media, m.created_at, m.reply_to,
              r.usuario AS reply_usuario, r.texto AS reply_texto,
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
        ORDER BY m.created_at DESC LIMIT 100`,
      [id, userKey]
    );
    res.json({ data: rows.reverse() });
  } catch (e) { next(e); }
});

// POST /api/comunidad/grupos/:id/mensajes  (multipart: media)
r.post('/grupos/:id/mensajes', communityUpload.single('media'), async (req, res, next) => {
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
    if (rechazarLimite(res, req.file ? [req.file] : [], await limiteSubidaMb(user.user_key))) return;
    let tipo = TIPOS_MSJ.includes(req.body?.tipo) ? req.body.tipo : 'texto';
    let media = null;
    if (req.file) {
      media = saveFile(req.file, user.user_key, 'chat');
      tipo = mediaKind(req.file.mimetype, req.file.originalname);
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
    await notify('comunidad_mensaje', { id: ins.rows[0].id, comunidad_id: id });
  } catch (e) { next(e); }
});

// POST /api/comunidad/mensajes/:msjId/reaccion  { userKey, emoji }
r.post('/mensajes/:msjId/reaccion', async (req, res, next) => {
  try {
    const msjId = intOrNull(req.params.msjId);
    const user = await resolveUser(req.body?.userKey);
    const emoji = String(req.body?.emoji || '').slice(0, 8);
    if (!msjId || !user || !emoji) return res.status(401).json({ error: 'Inicia sesión para reaccionar' });
    const m = await query('SELECT comunidad_id FROM comunidad_mensajes WHERE id = $1 AND activo = TRUE', [msjId]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const comId = m.rows[0].comunidad_id;
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
  } catch (e) { next(e); }
});

// ============================================================
// PRESENCIA (usuarios en línea)
// ============================================================

// GET /api/comunidad/presencia
r.get('/presencia', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT user_key, usuario, avatar, last_seen
         FROM comunidad_presencia
        WHERE last_seen > NOW() - INTERVAL '5 minutes'
        ORDER BY last_seen DESC LIMIT 60`
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
    await query(
      `INSERT INTO comunidad_reportes (tipo, target_id, comunidad_id, user_key, motivo, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tipo, target, intOrNull(b.comunidad_id), user?.user_key || null,
       String(b.motivo || '').slice(0, 80) || null, String(b.detalle || '').slice(0, 2000) || null]
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
      query("SELECT COUNT(*)::int AS n FROM comunidad_presencia WHERE last_seen > NOW() - INTERVAL '5 minutes'"),
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
