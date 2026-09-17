import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { authRequired } from '../middleware/auth.js';
import { publishEvent, cacheDel } from '../db/redis.js';
import { sendMail, verificationCodeEmailHtml } from '../services/mailer.js';
import { avatarUpload, avatarFolderName, removeAvatarFolder, publicOf, DIRS } from '../services/upload.js';
import { transcodeAvatar } from '../services/transcode.js';

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

// POST /api/auth/mail-test  (Bearer)  { to }  -> envía un correo de prueba
r.post('/mail-test', authRequired, async (req, res, next) => {
  try {
    const to = String(req.body?.to || env.mail.user || '').trim();
    if (!to) return res.status(400).json({ error: 'Indica un correo destino' });
    const out = await sendMail({
      to,
      subject: 'Prueba SMTP - pikante pe',
      html: '<p>Correo de prueba de pikante pe. Si lo recibes, el SMTP ya funciona.</p>',
      text: 'Correo de prueba de pikante pe. Si lo recibes, el SMTP ya funciona.',
    });
    res.json({ ok: !!out.ok, to, error: out.error || null });
  } catch (e) { next(e); }
});

// ============================================================
// PERFIL DE USUARIO (clientes, no admins)
// Identificación por user_key (dispositivo), igual que interacciones.
// ============================================================

const USER_KEY_RE = /^[A-Za-z0-9_.:-]{4,80}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USUARIO_RE = /^[A-Za-z0-9_.-]{3,30}$/;

function normalizeUserKey(value) {
  const key = String(value || '').trim();
  return USER_KEY_RE.test(key) ? key : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Crea un código de 6 dígitos, invalida los anteriores y lo guarda hasheado. */
async function issueCode(user) {
  await query(
    `DELETE FROM email_tokens WHERE user_id = $1 AND tipo = 'verify_code'`,
    [user.id]
  );
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await query(
    `INSERT INTO email_tokens (user_id, email, token_hash, tipo, expires_at)
     VALUES ($1, $2, $3, 'verify_code', NOW() + INTERVAL '15 minutes')`,
    [user.id, user.email, sha256(code)]
  );
  return code;
}

async function sendVerification(user) {
  const code = await issueCode(user);
  return sendMail({
    to: user.email,
    subject: 'Tu código de verificación — pikante pe',
    html: verificationCodeEmailHtml({ nombre: user.nombre, code }),
    text: `Tu código de verificación de pikante pe es: ${code} (válido 15 minutos).`,
  });
}

/**
 * Revisa si un usuario/email ya existen. `selfKey` excluye la propia cuenta
 * (para poder editar sin que choque consigo misma).
 */
async function availability({ usuario, email, selfKey }) {
  const out = {};
  if (usuario !== undefined) {
    const u = String(usuario || '').trim().toLowerCase();
    if (!u) out.usuario = { available: false, reason: 'empty' };
    else if (!USUARIO_RE.test(u)) out.usuario = { available: false, reason: 'invalid' };
    else {
      const { rows } = await query(
        `SELECT user_key FROM users
          WHERE lower(usuario) = $1 AND ($2::text IS NULL OR user_key <> $2) LIMIT 1`,
        [u, selfKey]
      );
      out.usuario = rows[0] ? { available: false, reason: 'taken' } : { available: true, reason: null };
    }
  }
  if (email !== undefined) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) out.email = { available: false, reason: 'empty' };
    else if (!EMAIL_RE.test(e)) out.email = { available: false, reason: 'invalid' };
    else {
      const { rows } = await query(
        `SELECT user_key FROM users
          WHERE lower(email) = $1 AND ($2::text IS NULL OR user_key <> $2) LIMIT 1`,
        [e, selfKey]
      );
      out.email = rows[0] ? { available: false, reason: 'taken' } : { available: true, reason: null };
    }
  }
  return out;
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
    usuario: u.usuario || null,
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
    `SELECT id, user_key, nombre, usuario, email, avatar, rol, provider, email_verified, created_at,
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
// Si el userKey no tiene cuenta, devuelve un invitado VIRTUAL sin crear fila en la BD:
// los invitados guardan su actividad en el navegador y la suben al registrarse.
r.get('/profile', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const existing = await findUserByKey(userKey);
    if (!existing) {
      const guest = {
        user_key: userKey,
        nombre: `Invitado ${userKey.slice(-4)}`,
        rol: 'user',
        provider: 'local',
        email_verified: false,
      };
      return res.json({
        ok: true,
        virtual: true,
        user: { ...publicUser(guest), virtual: true },
        stats: { likes: 0, saved: 0, following: 0, downloads: 0 },
      });
    }
    res.json({ ok: true, user: publicUser(existing), stats: await getUserStats(userKey) });
  } catch (e) { next(e); }
});

// GET /api/auth/check?usuario=&email=&userKey=  -> disponibilidad en tiempo real
r.get('/check', async (req, res, next) => {
  try {
    const selfKey = normalizeUserKey(req.query.userKey);
    const hasUsuario = req.query.usuario !== undefined;
    const hasEmail = req.query.email !== undefined;
    if (!hasUsuario && !hasEmail) return res.status(400).json({ error: 'Nada que verificar' });

    const out = await availability({
      usuario: hasUsuario ? req.query.usuario : undefined,
      email: hasEmail ? req.query.email : undefined,
      selfKey,
    });
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

// PUT /api/auth/profile  { userKey, nombre, usuario, email, avatar }
r.put('/profile', async (req, res, next) => {
  try {
    const { userKey: rawKey, nombre, usuario, email, avatar } = req.body || {};
    const userKey = normalizeUserKey(rawKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const exists = await findUserByKey(userKey);
    if (!exists) return res.status(401).json({ error: 'Inicia sesión para guardar tu perfil' });

    const cleanNombre = nombre === undefined ? null : (String(nombre).trim().slice(0, 120) || null);
    const cleanUsuario = usuario === undefined ? null : (String(usuario).trim().toLowerCase().slice(0, 40) || null);
    const cleanEmail = email === undefined ? null : (String(email).trim().toLowerCase().slice(0, 150) || null);
    const cleanAvatar = avatar === undefined ? null : (String(avatar).trim().slice(0, 255) || null);

    if (cleanUsuario && !USUARIO_RE.test(cleanUsuario)) {
      return res.status(400).json({ error: 'Nombre de usuario inválido (3-30: letras, números, . _ -)' });
    }
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Correo inválido' });
    }

    if (cleanUsuario) {
      const taken = await query(
        `SELECT user_key FROM users WHERE lower(usuario) = $1 AND user_key <> $2 LIMIT 1`,
        [cleanUsuario, userKey]
      );
      if (taken.rows[0]) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' });
    }

    if (cleanEmail) {
      const taken = await query(
        'SELECT user_key FROM users WHERE lower(email) = $1 AND user_key <> $2 LIMIT 1',
        [cleanEmail, userKey]
      );
      if (taken.rows[0]) return res.status(409).json({ error: 'Ese correo ya está en uso' });
    }

    await query(
      `UPDATE users SET
         nombre  = COALESCE($2, nombre),
         usuario = COALESCE($5, usuario),
         email   = COALESCE($3, email),
         avatar  = COALESCE($4, avatar),
         updated_at = NOW()
       WHERE user_key = $1`,
      [userKey, cleanNombre, cleanEmail, cleanAvatar, cleanUsuario]
    );

    const user = await findUserByKey(userKey);
    await publishEvent('user_profile', { userKey });

    res.json({ ok: true, user: publicUser(user), stats: await getUserStats(userKey) });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/import-guest  { userKey, data }
// Sube (una sola vez) la actividad que el invitado guardó en su navegador.
// Se llama al registrarse / iniciar sesión / entrar con Google.
r.post('/profile/import-guest', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const user = await findUserByKey(userKey);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para importar tus datos' });

    const d = req.body?.data || {};
    const MAX = 3000;
    const asMap = (o) => (o && typeof o === 'object' ? o : {});
    const asIds = (a) => (Array.isArray(a) ? a : [])
      .map((x) => Number.parseInt(String(x), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX);
    const uniq = (a) => [...new Set(a)];

    const existingIds = async (table, ids) => {
      if (!ids.length) return [];
      const { rows } = await query(`SELECT id FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
      return rows.map((row) => row.id);
    };

    const out = { videoLikes: 0, videoSaved: 0, videoDownloads: 0, following: 0, packLikes: 0, packSaved: 0, packDownloads: 0, hentaiLikes: 0, hentaiSaved: 0, hentaiDownloads: 0 };

    // ---- videos ----
    const vLikes = asMap(d?.videos?.likes);
    const vLikeIds = [];
    const vLikeTipos = [];
    for (const [k, tipo] of Object.entries(vLikes)) {
      const id = Number.parseInt(String(k), 10);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (tipo !== 'like' && tipo !== 'dislike') continue;
      vLikeIds.push(id);
      vLikeTipos.push(tipo);
      if (vLikeIds.length >= MAX) break;
    }
    const vLikeValid = await existingIds('videos', uniq(vLikeIds));
    const okIds = [];
    const okTipos = [];
    for (let i = 0; i < vLikeIds.length; i += 1) {
      if (vLikeValid.includes(vLikeIds[i])) { okIds.push(vLikeIds[i]); okTipos.push(vLikeTipos[i]); }
    }
    if (okIds.length) {
      await query(
        `INSERT INTO video_likes (video_id, user_key, tipo)
         SELECT x, $2, t FROM UNNEST($1::int[], $3::text[]) AS v(x, t)
         ON CONFLICT (video_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [okIds, userKey, okTipos]
      );
      await query(
        `UPDATE videos SET
           likes    = (SELECT COUNT(*) FROM video_likes WHERE video_id = videos.id AND tipo = 'like'),
           dislikes = (SELECT COUNT(*) FROM video_likes WHERE video_id = videos.id AND tipo = 'dislike')
         WHERE id = ANY($1::int[])`,
        [uniq(okIds)]
      );
      out.videoLikes = okIds.length;
    }

    const vSaved = await existingIds('videos', uniq(asIds(d?.videos?.saved)));
    if (vSaved.length) {
      await query(
        `INSERT INTO saved_videos (video_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x ON CONFLICT DO NOTHING`,
        [vSaved, userKey]
      );
      out.videoSaved = vSaved.length;
    }

    const vDown = await existingIds('videos', uniq(asIds(d?.videos?.downloads)));
    if (vDown.length) {
      await query(
        `INSERT INTO downloads (video_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x
         WHERE NOT EXISTS (SELECT 1 FROM downloads dl WHERE dl.video_id = x AND dl.user_key = $2)`,
        [vDown, userKey]
      );
      out.videoDownloads = vDown.length;
    }

    // ---- canales seguidos ----
    const channels = (Array.isArray(d?.following) ? d.following : [])
      .map((c) => String(c || '').trim().slice(0, 120)).filter(Boolean).slice(0, MAX);
    const uniqChannels = [...new Set(channels)];
    if (uniqChannels.length) {
      await query(
        `INSERT INTO subscriptions (channel, user_key)
         SELECT x, $2 FROM UNNEST($1::text[]) AS x ON CONFLICT DO NOTHING`,
        [uniqChannels, userKey]
      );
      await query(
        `UPDATE channels SET seguidores = (SELECT COUNT(*) FROM subscriptions WHERE channel = channels.nombre)
         WHERE nombre = ANY($1::text[])`,
        [uniqChannels]
      );
      out.following = uniqChannels.length;
    }

    // ---- packs ----
    const pLikes = asMap(d?.packs?.likes);
    const pIds = [];
    const pTipos = [];
    for (const [k, tipo] of Object.entries(pLikes)) {
      const id = Number.parseInt(String(k), 10);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (tipo !== 'like' && tipo !== 'dislike') continue;
      pIds.push(id); pTipos.push(tipo);
      if (pIds.length >= MAX) break;
    }
    const pValid = await existingIds('packs', uniq(pIds));
    const pOkIds = [];
    const pOkTipos = [];
    for (let i = 0; i < pIds.length; i += 1) {
      if (pValid.includes(pIds[i])) { pOkIds.push(pIds[i]); pOkTipos.push(pTipos[i]); }
    }
    if (pOkIds.length) {
      await query(
        `INSERT INTO pack_likes (pack_id, user_key, tipo)
         SELECT x, $2, t FROM UNNEST($1::int[], $3::text[]) AS v(x, t)
         ON CONFLICT (pack_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [pOkIds, userKey, pOkTipos]
      );
      out.packLikes = pOkIds.length;
    }
    const pSaved = await existingIds('packs', uniq(asIds(d?.packs?.saved)));
    if (pSaved.length) {
      await query(
        `INSERT INTO pack_saves (pack_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x ON CONFLICT DO NOTHING`,
        [pSaved, userKey]
      );
      out.packSaved = pSaved.length;
    }
    const pDown = await existingIds('packs', uniq(asIds(d?.packs?.downloads)));
    if (pDown.length) {
      const ins = await query(
        `INSERT INTO pack_downloads (pack_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x
         WHERE NOT EXISTS (SELECT 1 FROM pack_downloads dl WHERE dl.pack_id = x AND dl.user_key = $2)
         RETURNING pack_id`,
        [pDown, userKey]
      );
      if (ins.rows.length) {
        const counts = new Map();
        for (const row of ins.rows) counts.set(row.pack_id, (counts.get(row.pack_id) || 0) + 1);
        const ids2 = [...counts.keys()];
        const ns = ids2.map((x) => counts.get(x));
        await query(
          `UPDATE packs p SET descargas = COALESCE(p.descargas,0) + v.n
           FROM (SELECT * FROM UNNEST($1::int[], $2::int[]) AS t(id, n)) v
           WHERE p.id = v.id`,
          [ids2, ns]
        );
      }
      out.packDownloads = pDown.length;
    }
    if (pOkIds.length || pSaved.length) {
      const touch = uniq([...pOkIds, ...pSaved]);
      await query(
        `UPDATE packs SET
           likes     = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = packs.id AND tipo = 'like'),
           dislikes  = (SELECT COUNT(*) FROM pack_likes WHERE pack_id = packs.id AND tipo = 'dislike'),
           guardados = (SELECT COUNT(*) FROM pack_saves WHERE pack_id = packs.id)
         WHERE id = ANY($1::int[])`,
        [touch]
      );
    }

    // ---- hentai ----
    const hLikes = asMap(d?.hentai?.likes);
    const hIds = [];
    const hTipos = [];
    for (const [k, tipo] of Object.entries(hLikes)) {
      const id = Number.parseInt(String(k), 10);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (tipo !== 'like' && tipo !== 'dislike') continue;
      hIds.push(id); hTipos.push(tipo);
      if (hIds.length >= MAX) break;
    }
    const hValid = await existingIds('hentai_capitulos', uniq(hIds));
    const hOkIds = [];
    const hOkTipos = [];
    for (let i = 0; i < hIds.length; i += 1) {
      if (hValid.includes(hIds[i])) { hOkIds.push(hIds[i]); hOkTipos.push(hTipos[i]); }
    }
    if (hOkIds.length) {
      await query(
        `INSERT INTO hentai_likes (capitulo_id, user_key, tipo)
         SELECT x, $2, t FROM UNNEST($1::int[], $3::text[]) AS v(x, t)
         ON CONFLICT (capitulo_id, user_key) DO UPDATE SET tipo = EXCLUDED.tipo, created_at = NOW()`,
        [hOkIds, userKey, hOkTipos]
      );
      out.hentaiLikes = hOkIds.length;
    }
    const hSaved = await existingIds('hentai_capitulos', uniq(asIds(d?.hentai?.saved)));
    if (hSaved.length) {
      await query(
        `INSERT INTO hentai_saved (capitulo_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x ON CONFLICT DO NOTHING`,
        [hSaved, userKey]
      );
      out.hentaiSaved = hSaved.length;
    }
    const hDown = await existingIds('hentai_capitulos', uniq(asIds(d?.hentai?.downloads)));
    if (hDown.length) {
      const ins = await query(
        `INSERT INTO hentai_downloads (capitulo_id, user_key)
         SELECT x, $2 FROM UNNEST($1::int[]) AS x
         WHERE NOT EXISTS (SELECT 1 FROM hentai_downloads dl WHERE dl.capitulo_id = x AND dl.user_key = $2)
         RETURNING id`,
        [hDown, userKey]
      );
      out.hentaiDownloads = ins.rows.length;
    }

    await cacheDel('cache:stats');
    await publishEvent('user_import_guest', { userKey });

    res.json({ ok: true, imported: out, stats: await getUserStats(userKey) });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/avatar  (multipart: avatar)  { userKey }
r.post('/profile/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.body?.userKey || req.query.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Adjunta una imagen' });

    const user = await findUserByKey(userKey);
    if (!user) {
      fs.rm(file.path, { force: true }, () => {});
      return res.status(401).json({ error: 'Inicia sesión para cambiar tu avatar' });
    }
    removeAvatarFolder(user.avatar);

    const destDir = path.join(DIRS.avatars, avatarFolderName(userKey));
    const { renditions, main } = await transcodeAvatar({ inputPath: file.path, destDir });
    fs.rm(file.path, { force: true }, () => {});

    const chosen = (renditions || []).find((x) => x.size === 400) || (renditions || [])[0];
    const avatarPublic = publicOf(path.join(destDir, chosen ? chosen.file : main));

    await query('UPDATE users SET avatar = $1, updated_at = NOW() WHERE user_key = $2', [avatarPublic, userKey]);
    await publishEvent('user_profile', { userKey });

    const fresh = await findUserByKey(userKey);
    res.json({ ok: true, user: publicUser(fresh), avatar: avatarPublic });
  } catch (e) { next(e); }
});

// POST /api/auth/profile/register  { userKey, nombre, usuario, email, password }
r.post('/profile/register', async (req, res, next) => {
  try {
    const { userKey: rawKey, nombre, usuario, email, password } = req.body || {};
    const userKey = normalizeUserKey(rawKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanUsuario = String(usuario || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Correo inválido' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (cleanUsuario && !USUARIO_RE.test(cleanUsuario)) {
      return res.status(400).json({ error: 'Nombre de usuario inválido (3-30: letras, números, . _ -)' });
    }

    const taken = await query(
      'SELECT user_key FROM users WHERE lower(email) = $1 AND user_key <> $2 LIMIT 1',
      [cleanEmail, userKey]
    );
    if (taken.rows[0]) return res.status(409).json({ error: 'Ese correo ya está registrado' });

    if (cleanUsuario) {
      const takenU = await query(
        `SELECT user_key FROM users WHERE lower(usuario) = $1 AND user_key <> $2 LIMIT 1`,
        [cleanUsuario, userKey]
      );
      if (takenU.rows[0]) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso' });
    }

    await ensureUser(userKey);
    const hash = await bcrypt.hash(String(password), 10);
    await query(
      `UPDATE users SET email = $2, password_hash = $3, provider = 'local',
              email_verified = FALSE,
              usuario = COALESCE(NULLIF($5, ''), usuario),
              nombre = COALESCE(NULLIF($4, ''), nombre), updated_at = NOW()
        WHERE user_key = $1`,
      [userKey, cleanEmail, hash, String(nombre || '').trim().slice(0, 120), cleanUsuario]
    );

    const user = await findUserByKey(userKey);
    const mail = await sendVerification(user);

    await publishEvent('user_register', { userKey });

    res.status(201).json({
      ok: true,
      needs_verification: true,
      mail_sent: !!mail.ok,
      mail_error: mail.ok ? null : (mail.error || 'unknown'),
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

// POST /api/auth/profile/verify-code  { userKey, code }  -> activa la cuenta
r.post('/profile/verify-code', async (req, res, next) => {
  try {
    const userKey = normalizeUserKey(req.body?.userKey);
    if (!userKey) return res.status(400).json({ error: 'userKey inválido' });

    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'El código debe tener 6 dígitos', code: 'code_invalid' });

    const user = await findUserByKey(userKey);
    if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (user.email_verified) return res.json({ ok: true, already_verified: true, user: publicUser(user), stats: await getUserStats(userKey) });

    const { rows } = await query(
      `SELECT id, attempts, expires_at
         FROM email_tokens
        WHERE user_id = $1 AND tipo = 'verify_code' AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    const t = rows[0];
    if (!t || new Date(t.expires_at) < new Date()) {
      return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.', code: 'code_expired' });
    }
    if (t.attempts >= 5) {
      return res.status(429).json({ error: 'Demasiados intentos. Solicita un código nuevo.', code: 'too_many_attempts' });
    }

    const match = await query(
      `SELECT id FROM email_tokens WHERE id = $1 AND token_hash = $2`,
      [t.id, sha256(code)]
    );
    if (!match.rows[0]) {
      await query('UPDATE email_tokens SET attempts = attempts + 1 WHERE id = $1', [t.id]);
      return res.status(400).json({ error: 'Código incorrecto', code: 'code_invalid' });
    }

    await query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [user.id]);
    await query(`UPDATE email_tokens SET used_at = NOW() WHERE user_id = $1 AND tipo = 'verify_code'`, [user.id]);
    await publishEvent('user_verified', { userKey });

    const fresh = await findUserByKey(userKey);
    res.json({ ok: true, verified: true, user: publicUser(fresh), stats: await getUserStats(userKey) });
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
      `SELECT id, user_key, nombre, usuario, email, avatar, rol, provider, email_verified, created_at,
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
