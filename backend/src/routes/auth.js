import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { sendMail, verificationEmailHtml } from '../services/mailer.js';

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

// ============================================================
// PERFIL DE USUARIO (clientes, no admins)
// Identificación por user_key (dispositivo), igual que interacciones.
// ============================================================

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeUserKey(value) {
  const key = String(value || '').trim();
  return USER_KEY_RE.test(key) ? key : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Crea un token de verificación, invalida los anteriores y lo guarda hasheado. */
async function issueVerifyToken(user) {
  await query(
    `DELETE FROM email_tokens WHERE user_id = $1 AND tipo = 'verify' AND used_at IS NULL`,
    [user.id]
  );
  const token = randomToken();
  await query(
    `INSERT INTO email_tokens (user_id, email, token_hash, tipo, expires_at)
     VALUES ($1, $2, $3, 'verify', NOW() + INTERVAL '24 hours')`,
    [user.id, user.email, sha256(token)]
  );
  return token;
}

async function sendVerification(user) {
  const token = await issueVerifyToken(user);
  const link = `${env.app.publicUrl}/api/auth/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'Verifica tu correo — pikante pe',
    html: verificationEmailHtml({ nombre: user.nombre, link }),
    text: `Verifica tu correo de pikante pe: ${link}`,
  });
}

async function getUserStats(userKey) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM video_likes   WHERE user_key = $1 AND tipo = 'like') AS likes,
       (SELECT COUNT(*)::int FROM saved_videos  WHERE user_key = $1)                   AS saved,
       (SELECT COUNT(*)::int FROM subscriptions WHERE user_key = $1)                   AS following,
       (SELECT COUNT(*)::int FROM downloads     WHERE user_key = $1)                   AS downloads`,
    [userKey]
  );
  return rows[0] || { likes: 0, saved: 0, following: 0, downloads: 0 };
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    user_key: u.user_key,
    nombre: u.nombre,
    email: u.email,
    avatar: u.avatar,
    rol: u.rol,
    provider: u.provider || 'local',
    email_verified: !!u.email_verified,
    created_at: u.created_at,
    has_password: !!u.has_password,
  };
}

async function findUserByKey(userKey) {
  const { rows } = await query(
    `SELECT id, user_key, nombre, email, avatar, rol, provider, email_verified, created_at,
            (password_hash IS NOT NULL) AS has_password
       FROM users WHERE user_key = $1`,
    [userKey]
  );
  return rows[0] || null;
}

async function ensureUser(userKey) {
  const existing = await findUserByKey(userKey);
  if (existing) return existing;
  const nombre = `Invitado ${userKey.slice(-4)}`;
  await query(
    `INSERT INTO users (user_key, rol, nombre) VALUES ($1, 'user', $2)
     ON CONFLICT (user_key) DO NOTHING`,
    [userKey, nombre]
  );
  return findUserByKey(userKey);
}

/**
 * Migra la actividad anónima (localStorage -> user_key de invitado) a la
 * cuenta real cuando el usuario inicia sesión o entra con Google.
 */
async function migrateGuestData(guestKey, accountKey) {
  if (!guestKey || !accountKey || guestKey === accountKey) return;

  // sin índice único: solo se cambia el dueño
  await query('UPDATE video_views SET user_key = $2 WHERE user_key = $1', [guestKey, accountKey]);
  await query('UPDATE downloads   SET user_key = $2 WHERE user_key = $1', [guestKey, accountKey]);
  await query('UPDATE shares      SET user_key = $2 WHERE user_key = $1', [guestKey, accountKey]);
  await query('UPDATE reports     SET user_key = $2 WHERE user_key = $1', [guestKey, accountKey]);

  // con índice único (video_id/channel, user_key): copiar y borrar el origen
  await query(
    `INSERT INTO saved_videos (video_id, user_key, created_at)
     SELECT video_id, $2, created_at FROM saved_videos WHERE user_key = $1
     ON CONFLICT (video_id, user_key) DO NOTHING`,
    [guestKey, accountKey]
  );
  await query('DELETE FROM saved_videos WHERE user_key = $1', [guestKey]);

  await query(
    `INSERT INTO video_likes (video_id, user_key, tipo, created_at)
     SELECT video_id, $2, tipo, created_at FROM video_likes WHERE user_key = $1
     ON CONFLICT (video_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = EXCLUDED.created_at`,
    [guestKey, accountKey]
  );
  await query('DELETE FROM video_likes WHERE user_key = $1', [guestKey]);

  await query(
    `INSERT INTO subscriptions (channel, user_key, created_at)
     SELECT channel, $2, created_at FROM subscriptions WHERE user_key = $1
     ON CONFLICT (channel, user_key) DO NOTHING`,
    [guestKey, accountKey]
  );
  await query('DELETE FROM subscriptions WHERE user_key = $1', [guestKey]);

  await query('DELETE FROM users WHERE user_key = $1', [guestKey]);
}

// GET /api/auth/profile?userKey=  -> perfil + estadísticas (siempre fresco)
r.get('/profile', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const user = await ensureUser(userKey);
    res.json({ ok: true, user: publicUser(user), stats: await getUserStats(userKey) });
  } catch (e) { next(e); }
});

// PUT /api/auth/profile  { userKey, nombre, email, avatar }
r.put('/profile', async (req, res, next) => {
  try {
    const { userKey: rawKey, nombre, email, avatar } = req.body || {};
    const userKey = normalizeUserKey(rawKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    await ensureUser(userKey);

    const cleanNombre = nombre === undefined ? null : (String(nombre).trim().slice(0, 120) || null);
    const cleanEmail = email === undefined ? null : (String(email).trim().toLowerCase().slice(0, 150) || null);
    const cleanAvatar = avatar === undefined ? null : (String(avatar).trim().slice(0, 255) || null);

    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Correo inválido' });
    }

    if (cleanEmail) {
      const taken = await query(
        'SELECT user_key FROM users WHERE email = $1 AND user_key <> $2 LIMIT 1',
        [cleanEmail, userKey]
      );
      if (taken.rows[0]) return res.status(409).json({ error: 'Ese correo ya está en uso' });
    }

    await query(
      `UPDATE users SET
         nombre = COALESCE($2, nombre),
         email  = COALESCE($3, email),
         avatar = COALESCE($4, avatar),
         updated_at = NOW()
       WHERE user_key = $1`,
      [userKey, cleanNombre, cleanEmail, cleanAvatar]
    );

    const user = await findUserByKey(userKey);
    await publishEvent('user_profile', { userKey });

    res.json({ ok: true, user: publicUser(user), stats: await getUserStats(userKey) });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/register  { userKey, nombre, email, password }
r.post('/profile/register', async (req, res, next) => {
  try {
    const { userKey: rawKey, nombre, email, password } = req.body || {};
    const userKey = normalizeUserKey(rawKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Correo inválido' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const taken = await query(
      'SELECT user_key FROM users WHERE email = $1 AND user_key <> $2 LIMIT 1',
      [cleanEmail, userKey]
    );
    if (taken.rows[0]) return res.status(409).json({ error: 'Ese correo ya está registrado' });

    await ensureUser(userKey);
    const hash = await bcrypt.hash(String(password), 10);
    await query(
      `UPDATE users SET email = $2, password_hash = $3, provider = 'local',
              email_verified = FALSE,
              nombre = COALESCE(NULLIF($4, ''), nombre), updated_at = NOW()
        WHERE user_key = $1`,
      [userKey, cleanEmail, hash, String(nombre || '').trim().slice(0, 120)]
    );

    const user = await findUserByKey(userKey);
    const mail = await sendVerification(user);

    await publishEvent('user_register', { userKey });

    res.status(201).json({
      ok: true,
      needs_verification: true,
      mail_sent: !!mail.ok,
      user: publicUser(user),
      stats: await getUserStats(userKey),
    });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/resend-verification  { userKey }
r.post('/profile/resend-verification', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const user = await findUserByKey(userKey);
    if (!user || !user.email) return res.status(400).json({ error: 'No hay un correo registrado' });
    if (user.email_verified) return res.json({ ok: true, already_verified: true });

    const mail = await sendVerification(user);
    res.json({ ok: true, mail_sent: !!mail.ok });
  } catch (e) { next(e); }
});

// GET /api/auth/verify-email?token=...  -> verifica y redirige al frontend
r.get('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).send('Token faltante');
    const wantsJson = String(req.headers.accept || '').includes('application/json');

    const { rows } = await query(
      `SELECT id, user_id, expires_at, used_at
         FROM email_tokens
        WHERE token_hash = $1 AND tipo = 'verify'
        LIMIT 1`,
      [sha256(token)]
    );
    const t = rows[0];
    const valid = t && !t.used_at && new Date(t.expires_at) >= new Date();

    if (!valid) {
      if (wantsJson) return res.status(400).json({ ok: false, error: 'Token inválido o expirado' });
      return res.redirect(`${env.frontendUrl}/perfil?verified=0`);
    }

    await query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [t.user_id]);
    await query('UPDATE email_tokens SET used_at = NOW() WHERE id = $1', [t.id]);
    await publishEvent('user_verified', { userId: t.user_id });

    if (wantsJson) return res.json({ ok: true, verified: true });
    res.redirect(`${env.frontendUrl}/perfil?verified=1`);
  } catch (e) { next(e); }
});

// POST /api/auth/profile/login  { email, password }  -> devuelve user_key de la cuenta
r.post('/profile/login', async (req, res, next) => {
  try {
    const { email, password, guestKey: rawGuest } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

    const { rows } = await query(
      `SELECT id, user_key, nombre, email, avatar, rol, provider, email_verified, created_at,
              password_hash, (password_hash IS NOT NULL) AS has_password
         FROM users WHERE email = $1 LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Debes verificar tu correo antes de iniciar sesión',
        code: 'email_not_verified',
      });
    }

    await query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

    const guestKey = normalizeUserKey(rawGuest);
    if (guestKey && guestKey !== user.user_key) {
      await migrateGuestData(guestKey, user.user_key);
      await publishEvent('user_migrate', { from: guestKey, to: user.user_key });
    }

    res.json({ ok: true, user: publicUser(user), stats: await getUserStats(user.user_key) });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/google  { credential, userKey }
// Verifica el ID token de Google Identity Services y crea/vincula la cuenta.
r.post('/profile/google', async (req, res, next) => {
  try {
    const { credential, userKey: rawKey } = req.body || {};
    const currentKey = normalizeUserKey(rawKey);
    if (!credential) return res.status(400).json({ error: 'Falta el token de Google' });

    const gr = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!gr.ok) return res.status(401).json({ error: 'Token de Google inválido' });
    const info = await gr.json();

    if (env.google.clientId && info.aud !== env.google.clientId) {
      return res.status(401).json({ error: 'El token de Google no corresponde a esta aplicación' });
    }
    if (!info.email || info.email_verified === 'false') {
      return res.status(400).json({ error: 'El correo de Google no está verificado' });
    }

    const email = String(info.email).toLowerCase();
    const nombre = info.name || email.split('@')[0];
    const picture = info.picture || null;
    const googleId = String(info.sub || '');

    let user = null;
    const byGoogle = await query('SELECT * FROM users WHERE google_id = $1 LIMIT 1', [googleId]);
    user = byGoogle.rows[0] || null;
    if (!user) {
      const byEmail = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
      user = byEmail.rows[0] || null;
    }
    if (!user && currentKey) {
      const byKey = await query('SELECT * FROM users WHERE user_key = $1 LIMIT 1', [currentKey]);
      user = byKey.rows[0] || null;
    }

    if (user) {
      await query(
        `UPDATE users SET google_id = $2, provider = 'google', email_verified = TRUE,
                email = COALESCE(email, $3), avatar = COALESCE(avatar, $4),
                nombre = COALESCE(NULLIF(nombre, ''), $5),
                last_login = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [user.id, googleId, email, picture, nombre]
      );
      user = await findUserByKey(user.user_key);
    } else {
      const newKey = currentKey || `g_${googleId.slice(0, 20)}`;
      await query(
        `INSERT INTO users (user_key, nombre, email, avatar, rol, provider, google_id, email_verified, last_login)
         VALUES ($1, $2, $3, $4, 'user', 'google', $5, TRUE, NOW())`,
        [newKey, nombre, email, picture, googleId]
      );
      user = await findUserByKey(newKey);
    }

    if (currentKey && currentKey !== user.user_key) {
      await migrateGuestData(currentKey, user.user_key);
    }

    await publishEvent('user_google_login', { userKey: user.user_key });

    res.json({ ok: true, user: publicUser(user), stats: await getUserStats(user.user_key) });
  } catch (e) { next(e); }
});

// ---- paginación reutilizable para las listas del perfil ----
function paging(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 12));
  return { page, limit, offset: (page - 1) * limit };
}

function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

// GET /api/auth/profile/saved?userKey=&page=&limit=  (Guardados / Favoritos)
r.get('/profile/saved', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const { page, limit, offset } = paging(req);

    const totalQ = await query(
      `SELECT COUNT(*)::int AS n
         FROM saved_videos sv
         JOIN videos v ON v.id = sv.video_id
        WHERE sv.user_key = $1 AND v.activo = TRUE`,
      [userKey]
    );
    const { rows } = await query(
      `SELECT v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal,
              sv.created_at AS saved_at
         FROM saved_videos sv
         JOIN videos v ON v.id = sv.video_id
        WHERE sv.user_key = $1 AND v.activo = TRUE
        ORDER BY sv.created_at DESC
        LIMIT $2 OFFSET $3`,
      [userKey, limit, offset]
    );
    res.json({ data: rows, ...pageMeta(totalQ.rows[0].n, page, limit) });
  } catch (e) { next(e); }
});

// GET /api/auth/profile/likes?userKey=&page=&limit=  (Me gusta)
r.get('/profile/likes', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const { page, limit, offset } = paging(req);

    const totalQ = await query(
      `SELECT COUNT(*)::int AS n
         FROM video_likes vl
         JOIN videos v ON v.id = vl.video_id
        WHERE vl.user_key = $1 AND vl.tipo = 'like' AND v.activo = TRUE`,
      [userKey]
    );
    const { rows } = await query(
      `SELECT v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal,
              vl.created_at AS liked_at
         FROM video_likes vl
         JOIN videos v ON v.id = vl.video_id
        WHERE vl.user_key = $1 AND vl.tipo = 'like' AND v.activo = TRUE
        ORDER BY vl.created_at DESC
        LIMIT $2 OFFSET $3`,
      [userKey, limit, offset]
    );
    res.json({ data: rows, ...pageMeta(totalQ.rows[0].n, page, limit) });
  } catch (e) { next(e); }
});

// GET /api/auth/profile/downloads?userKey=&page=&limit=  (Descargas)
r.get('/profile/downloads', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const { page, limit, offset } = paging(req);

    const totalQ = await query(
      `SELECT COUNT(DISTINCT d.video_id)::int AS n
         FROM downloads d
         JOIN videos v ON v.id = d.video_id
        WHERE d.user_key = $1 AND v.activo = TRUE`,
      [userKey]
    );
    const { rows } = await query(
      `SELECT v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal,
              MAX(d.created_at) AS downloaded_at
         FROM downloads d
         JOIN videos v ON v.id = d.video_id
        WHERE d.user_key = $1 AND v.activo = TRUE
        GROUP BY v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal
        ORDER BY MAX(d.created_at) DESC
        LIMIT $2 OFFSET $3`,
      [userKey, limit, offset]
    );
    res.json({ data: rows, ...pageMeta(totalQ.rows[0].n, page, limit) });
  } catch (e) { next(e); }
});

// GET /api/auth/profile/history?userKey=&page=&limit=  (Historial de vistos)
r.get('/profile/history', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const { page, limit, offset } = paging(req);

    const totalQ = await query(
      `SELECT COUNT(DISTINCT vv.video_id)::int AS n
         FROM video_views vv
         JOIN videos v ON v.id = vv.video_id
        WHERE vv.user_key = $1 AND v.activo = TRUE`,
      [userKey]
    );
    const { rows } = await query(
      `SELECT v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal,
              MAX(vv.created_at) AS viewed_at
         FROM video_views vv
         JOIN videos v ON v.id = vv.video_id
        WHERE vv.user_key = $1 AND v.activo = TRUE
        GROUP BY v.id, v.titulo_es, v.titulo_en, v.thumb, v.src, v.duracion, v.vistas, v.canal
        ORDER BY MAX(vv.created_at) DESC
        LIMIT $2 OFFSET $3`,
      [userKey, limit, offset]
    );
    res.json({ data: rows, ...pageMeta(totalQ.rows[0].n, page, limit) });
  } catch (e) { next(e); }
});

// GET /api/auth/profile/subscriptions?userKey=&page=&limit=  (Suscripciones)
r.get('/profile/subscriptions', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const { page, limit, offset } = paging(req);

    const totalQ = await query(
      'SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_key = $1',
      [userKey]
    );
    const { rows } = await query(
      `SELECT channel, created_at
         FROM subscriptions
        WHERE user_key = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userKey, limit, offset]
    );
    res.json({ data: rows, ...pageMeta(totalQ.rows[0].n, page, limit) });
  } catch (e) { next(e); }
});

export default r;
