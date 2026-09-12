'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './perfil.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';
import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';

const USER_KEY_STORAGE = 'pkp_user_key';

const TABS = [
  { id: 'perfil', icon: 'person-outline', label: ['Perfil', 'Profile'] },
  { id: 'guardados', icon: 'bookmark-outline', label: ['Guardados', 'Saved'] },
  { id: 'likes', icon: 'thumbs-up-outline', label: ['Me gusta', 'Likes'] },
  { id: 'suscripciones', icon: 'people-outline', label: ['Suscripciones', 'Following'] },
  { id: 'descargas', icon: 'download-outline', label: ['Descargas', 'Downloads'] },
];

// Como invitado no existen "Me gusta" ni "Suscripciones" (requieren cuenta)
const GUEST_TABS = ['perfil', 'guardados', 'descargas'];

// id de pestaña -> endpoint real del backend
const LIST_ENDPOINT = {
  guardados: 'saved',
  likes: 'likes',
  suscripciones: 'subscriptions',
  descargas: 'downloads',
};

const EMPTY_STATS = { likes: 0, saved: 0, following: 0, downloads: 0 };

const GoogleIcon = () => (
  <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.4C29.3 35 26.8 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.4 5.4C41.9 34.6 44 29.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
  </svg>
);

function fmtMember(dateStr, es) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PerfilClient() {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  const [userKey, setUserKey] = useState('');
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('perfil');

  const [form, setForm] = useState({ nombre: '', email: '', avatar: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [lists, setLists] = useState({});
  const [listLoading, setListLoading] = useState(false);

  // login
  const [logEmail, setLogEmail] = useState('');
  const [logPass, setLogPass] = useState('');
  const [logShow, setLogShow] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logMsg, setLogMsg] = useState('');

  // registro
  const [regNombre, setRegNombre] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regShow, setRegShow] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regMsg, setRegMsg] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyNotice, setVerifyNotice] = useState('');

  const [googleCred, setGoogleCred] = useState('');

  const authed = !!(user && user.email_verified);
  const visibleTabs = authed ? TABS : TABS.filter((tb) => GUEST_TABS.includes(tb.id));

  const loadProfile = useCallback(async (key, silent = false) => {
    if (!key) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile?userKey=${encodeURIComponent(key)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || (es ? 'No se pudo cargar tu perfil' : 'Could not load your profile'));
        return;
      }
      setUser(j.user || null);
      setStats(j.stats || EMPTY_STATS);
      setForm({
        nombre: j.user?.nombre || '',
        email: j.user?.email || '',
        avatar: j.user?.avatar || '',
      });
    } catch {
      setError(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [es]);

  useEffect(() => {
    const key = getUserKey();
    setUserKey(key);
    loadProfile(key);
  }, [loadProfile]);

  // ?verified=1 / 0 al volver del correo
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const v = p.get('verified');
    if (v === '1') setVerifyNotice(es ? '¡Correo verificado! Ya puedes iniciar sesión.' : 'Email verified! You can now sign in.');
    else if (v === '0') setVerifyNotice(es ? 'El enlace es inválido o caducó.' : 'The link is invalid or expired.');
    if (v) loadProfile(getUserKey());
  }, [es, loadProfile]);

  // Google Identity Services
  const gisReady = useRef(false);
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || typeof window === 'undefined') return;

    function init() {
      if (!window.google?.accounts?.id) return;
      if (!gisReady.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => setGoogleCred(resp.credential || ''),
        });
        gisReady.current = true;
      }
      ['g_id_login', 'g_id_register'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.rendered) {
          window.google.accounts.id.renderButton(el, {
            theme: 'outline', size: 'large', width: 300, text: 'continue_with', logo_alignment: 'left',
          });
          el.dataset.rendered = '1';
        }
      });
    }

    if (window.google?.accounts?.id) {
      init();
      return;
    }
    let s = document.getElementById('gsi-script');
    if (!s) {
      s = document.createElement('script');
      s.id = 'gsi-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.body.appendChild(s);
    } else {
      s.addEventListener('load', init);
      return () => s.removeEventListener('load', init);
    }
  }, [loading, authed]);

  async function doGoogle(credential) {
    setRegMsg('');
    setLogMsg('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, userKey }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLogMsg(j.error || (es ? 'No se pudo entrar con Google' : 'Google sign-in failed'));
        return;
      }
      const key = j.user?.user_key || userKey;
      try { localStorage.setItem(USER_KEY_STORAGE, key); } catch { /* noop */ }
      setUserKey(key);
      setUser(j.user || null);
      setStats(j.stats || EMPTY_STATS);
      setLists({});
      setTab('perfil');
      loadProfile(key);
    } catch {
      setLogMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    }
  }

  useEffect(() => {
    if (googleCred) {
      doGoogle(googleCred);
      setGoogleCred('');
    }
  }, [googleCred]);

  const loadList = useCallback(async (which, key) => {
    if (!key) return;
    setListLoading(true);
    try {
      const endpoint = LIST_ENDPOINT[which] || which;
      const r = await fetch(`${API_URL}/api/auth/profile/${endpoint}?userKey=${encodeURIComponent(key)}`);
      const j = await r.json().catch(() => ({}));
      setLists((cur) => ({ ...cur, [which]: j.data || [] }));
    } catch {
      setLists((cur) => ({ ...cur, [which]: [] }));
    } finally {
      setListLoading(false);
    }
  }, []);

  // Redis realtime: si el backend publica un cambio (like, guardado, descarga…)
  // el perfil se actualiza solo, sin recargar la página.
  useEffect(() => {
    const onChange = () => {
      if (!userKey) return;
      loadProfile(userKey, true);
      if (tab === 'suscripciones') loadList(tab, userKey);
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [userKey, tab, loadProfile, loadList]);

  function changeTab(id) {
    setTab(id);
    if (id === 'suscripciones' && lists[id] === undefined) loadList(id, userKey);
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, ...form }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveMsg(j.error || (es ? 'No se pudo guardar' : 'Could not save'));
        return;
      }
      setUser(j.user || user);
      setStats(j.stats || stats);
      setSaveMsg(es ? 'Perfil actualizado ✓' : 'Profile updated ✓');
    } catch {
      setSaveMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setSaving(false);
    }
  }

  async function doRegister(e) {
    e.preventDefault();
    setRegBusy(true);
    setRegMsg('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, nombre: regNombre, email: regEmail, password: regPass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRegMsg(j.error || (es ? 'No se pudo crear la cuenta' : 'Could not create the account'));
        return;
      }
      setPendingEmail(regEmail);
      setRegPass('');
      setRegMsg('');
      loadProfile(userKey);
    } catch {
      setRegMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setRegBusy(false);
    }
  }

  async function doLogin(e) {
    e.preventDefault();
    setLogBusy(true);
    setLogMsg('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: logEmail, password: logPass, guestKey: userKey }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.code === 'email_not_verified') setPendingEmail(logEmail);
        setLogMsg(j.error || (es ? 'No se pudo iniciar sesión' : 'Sign-in failed'));
        return;
      }
      const key = j.user?.user_key || userKey;
      try { localStorage.setItem(USER_KEY_STORAGE, key); } catch { /* noop */ }
      setUserKey(key);
      setUser(j.user || null);
      setStats(j.stats || EMPTY_STATS);
      setLogPass('');
      setLists({});
      setTab('perfil');
      loadProfile(key);
    } catch {
      setLogMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setLogBusy(false);
    }
  }

  async function resendVerification() {
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey }),
      });
      const j = await r.json().catch(() => ({}));
      setLogMsg(j.ok ? (es ? 'Correo reenviado ✓' : 'Email resent ✓') : (j.error || ''));
    } catch {
      setLogMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    }
  }

  function logout() {
    try { localStorage.removeItem(USER_KEY_STORAGE); } catch { /* noop */ }
    const key = getUserKey();
    setUserKey(key);
    setLists({});
    setTab('perfil');
    setPendingEmail('');
    setLogMsg('');
    setRegMsg('');
    loadProfile(key);
  }

  const avatarSrc = form.avatar ? mediaUrl(form.avatar) : '';
  const initial = (user?.nombre || user?.email || '?').trim().charAt(0).toUpperCase();

  const statsList = [
    { key: 'likes', value: stats.likes, label: es ? 'Me gusta' : 'Likes', icon: 'thumbs-up-outline' },
    { key: 'saved', value: stats.saved, label: es ? 'Guardados' : 'Saved', icon: 'bookmark-outline' },
    { key: 'following', value: stats.following, label: es ? 'Siguiendo' : 'Following', icon: 'people-outline' },
    { key: 'downloads', value: stats.downloads, label: es ? 'Descargas' : 'Downloads', icon: 'download-outline' },
  ].filter((s) => authed || s.key === 'saved' || s.key === 'downloads');

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>
          <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
          <span>{es ? 'Cargando perfil…' : 'Loading profile…'}</span>
        </div>
      </main>
    );
  }

  const verifiedBadge = (icon, text, danger) => (
    <span className={styles.badge}>
      <ion-icon name={icon} className={danger ? styles.badgeDanger : styles.badgeIcon} suppressHydrationWarning></ion-icon>
      {text}
    </span>
  );

  return (
    <main className={styles.main}>
      {error && (
        <div className={styles.error}>
          <ion-icon name="alert-circle-outline" suppressHydrationWarning></ion-icon>
          <span>{error}</span>
        </div>
      )}

      {verifyNotice && (
        <div className={styles.verifyBanner}>
          <ion-icon name="mail-open-outline" suppressHydrationWarning></ion-icon>
          <span>{verifyNotice}</span>
          <button type="button" onClick={() => setVerifyNotice('')} aria-label="Cerrar">
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      )}

      {/* ===== Cabecera del perfil (Invitado / usuario) ===== */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.avatarWrap}>
          {avatarSrc
            ? <img className={styles.avatarImg} src={avatarSrc} alt={user?.nombre || 'avatar'} />
            : <span className={styles.avatarInitial}>{initial}</span>}
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroTopLine}>
            <h1 className={styles.heroName}>{user?.nombre || (es ? 'Invitado' : 'Guest')}</h1>
            {authed
              ? verifiedBadge('shield-checkmark-outline', es ? 'Cuenta' : 'Account', false)
              : verifiedBadge('person-outline', es ? 'Invitado' : 'Guest', true)}
          </div>
          <p className={styles.heroMail}>
            <ion-icon name="mail-outline" suppressHydrationWarning></ion-icon>
            {user?.email || (es ? 'Sin correo' : 'No email')}
          </p>
          {user?.created_at && (
            <p className={styles.heroSince}>
              <ion-icon name="calendar-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Miembro desde' : 'Member since'} {fmtMember(user.created_at, es)}
            </p>
          )}
        </div>
        <div className={styles.heroStats}>
          {statsList.map((s) => (
            <div key={s.key} className={styles.stat}>
              <ion-icon name={s.icon} className={styles.statIcon} suppressHydrationWarning></ion-icon>
              <span className={styles.statValue}>{Number(s.value || 0).toLocaleString(es ? 'es-PE' : 'en-US')}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Login / Registro ===== */}
      {!authed && (
        <section className={styles.authSection}>
          <div className={styles.authIntro}>
            <span className={styles.authIntroIcon}>
              <ion-icon name="flame-outline" suppressHydrationWarning></ion-icon>
            </span>
            <div>
              <h2 className={styles.authIntroTitle}>
                {es ? 'Entra o crea tu cuenta' : 'Sign in or create your account'}
              </h2>
              <p className={styles.authIntroText}>
                {es
                  ? 'Guarda videos, dale like y sigue canales. Tu actividad de invitado se conserva.'
                  : 'Save videos, like and follow channels. Your guest activity is kept.'}
              </p>
            </div>
          </div>

          <div className={styles.authGrid}>
          {/* Iniciar sesión */}
          <div className={styles.authCard}>
            <h2 className={styles.authTitle}>{es ? 'Iniciar sesión' : 'Sign in'}</h2>
            <p className={styles.authSub}>{es ? 'Bienvenido de nuevo' : 'Welcome back'}</p>

            <form className={styles.form} onSubmit={doLogin}>
              <div className={styles.control}>
                <ion-icon name="mail-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.ctrlInput}
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder={es ? 'Correo electrónico' : 'Email'}
                  value={logEmail}
                  onChange={(e) => setLogEmail(e.target.value)}
                  required
                />
              </div>
              <div className={styles.control}>
                <ion-icon name="lock-closed-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.ctrlInput}
                  type={logShow ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder={es ? 'Contraseña' : 'Password'}
                  value={logPass}
                  onChange={(e) => setLogPass(e.target.value)}
                  required
                />
                <button type="button" className={styles.ctrlEye} onClick={() => setLogShow((v) => !v)} aria-label="Ver contraseña">
                  <ion-icon name={logShow ? 'eye-off-outline' : 'eye-outline'} suppressHydrationWarning></ion-icon>
                </button>
              </div>

              {logMsg && <p className={styles.msgError}>{logMsg}</p>}
              {pendingEmail && logMsg && (
                <button type="button" className={styles.linkBtn} onClick={resendVerification}>
                  {es ? 'Reenviar correo de verificación' : 'Resend verification email'}
                </button>
              )}

              <button className={styles.cta} type="submit" disabled={logBusy}>
                {logBusy ? (es ? 'Ingresando…' : 'Signing in…') : (es ? 'Iniciar sesión' : 'Sign in')}
              </button>
            </form>

            <div className={styles.divider}>
              <span>{es ? 'o continúa con' : 'or continue with'}</span>
            </div>
            <div id="g_id_login" className={styles.googleWrap} />
            {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <button className={styles.googleBtn} type="button" onClick={() => setLogMsg(es ? 'Google no configurado (falta NEXT_PUBLIC_GOOGLE_CLIENT_ID).' : 'Google not configured.')}>
                <GoogleIcon />
                {es ? 'Continuar con Google' : 'Continue with Google'}
              </button>
            )}

            <div className={styles.badges}>
              {verifiedBadge('shield-checkmark-outline', es ? 'Mayor 18' : '18+', true)}
              {verifiedBadge('lock-closed-outline', es ? 'Seguridad' : 'Security', false)}
            </div>
          </div>

          {/* Crear cuenta */}
          <div className={styles.authCard}>
            <h2 className={styles.authTitle}>{es ? 'Crear cuenta' : 'Create account'}</h2>
            <p className={styles.authSub}>{es ? 'Únete a la comunidad' : 'Join the community'}</p>

            <form className={styles.form} onSubmit={doRegister}>
              <div className={styles.control}>
                <ion-icon name="person-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.ctrlInput}
                  type="text"
                  name="nickname"
                  autoComplete="nickname"
                  placeholder={es ? 'Nombre de usuario' : 'Username'}
                  value={regNombre}
                  onChange={(e) => setRegNombre(e.target.value)}
                  required
                />
              </div>
              <div className={styles.control}>
                <ion-icon name="mail-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.ctrlInput}
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder={es ? 'Correo electrónico' : 'Email'}
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div className={styles.control}>
                <ion-icon name="lock-closed-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.ctrlInput}
                  type={regShow ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  minLength={6}
                  placeholder={es ? 'Contraseña (mín. 6)' : 'Password (min 6)'}
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                  required
                />
                <button type="button" className={styles.ctrlEye} onClick={() => setRegShow((v) => !v)} aria-label="Ver contraseña">
                  <ion-icon name={regShow ? 'eye-off-outline' : 'eye-outline'} suppressHydrationWarning></ion-icon>
                </button>
              </div>

              {regMsg && <p className={styles.msgError}>{regMsg}</p>}

              <button className={styles.cta} type="submit" disabled={regBusy}>
                {regBusy ? (es ? 'Creando…' : 'Creating…') : (es ? 'Crear cuenta' : 'Create account')}
              </button>
            </form>

            <div className={styles.divider}>
              <span>{es ? 'o continúa con' : 'or continue with'}</span>
            </div>
            <div id="g_id_register" className={styles.googleWrap} />
            {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <button className={styles.googleBtn} type="button" onClick={() => setRegMsg(es ? 'Google no configurado (falta NEXT_PUBLIC_GOOGLE_CLIENT_ID).' : 'Google not configured.')}>
                <GoogleIcon />
                {es ? 'Continuar con Google' : 'Continue with Google'}
              </button>
            )}

            <div className={styles.badges}>
              {verifiedBadge('shield-checkmark-outline', es ? 'Mayor 18' : '18+', true)}
              {verifiedBadge('lock-closed-outline', es ? 'Seguridad' : 'Security', false)}
            </div>
          </div>
          </div>
        </section>
      )}

      {pendingEmail && !authed && (
        <div className={styles.pendingBox}>
          <ion-icon name="mail-unread-outline" suppressHydrationWarning></ion-icon>
          <div>
            <strong>{es ? 'Revisa tu correo' : 'Check your email'}</strong>
            <p>
              {es
                ? `Te enviamos un enlace de verificación a ${pendingEmail}.`
                : `We sent a verification link to ${pendingEmail}.`}
            </p>
          </div>
          <button type="button" className={styles.linkBtn} onClick={resendVerification}>
            {es ? 'Reenviar' : 'Resend'}
          </button>
        </div>
      )}

      {/* ===== Pestañas ===== */}
      <div className={styles.tabs}>
        {visibleTabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={`${styles.tab} ${tab === tb.id ? styles.tabActive : ''}`}
            onClick={() => changeTab(tb.id)}
          >
            <ion-icon name={tb.icon} suppressHydrationWarning></ion-icon>
            {es ? tb.label[0] : tb.label[1]}
          </button>
        ))}
      </div>

      {tab === 'perfil' && (
        authed ? (
        <div className={styles.panels}>
          <form className={styles.card} onSubmit={saveProfile}>
            <h3 className={styles.cardTitle}>
              <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Editar perfil' : 'Edit profile'}
            </h3>

            <label className={styles.field}>
              <span className={styles.label}>{es ? 'Nombre' : 'Name'}</span>
              <input
                className={styles.input}
                type="text"
                maxLength={120}
                placeholder={es ? '¿Cómo te llamamos?' : 'What should we call you?'}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            {authed && (
              <label className={styles.field}>
                <span className={styles.label}>{es ? 'Correo' : 'Email'}</span>
                <input
                  className={styles.input}
                  type="email"
                  maxLength={150}
                  placeholder="tucorreo@ejemplo.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.label}>{es ? 'Avatar (URL de imagen)' : 'Avatar (image URL)'}</span>
              <input
                className={styles.input}
                type="text"
                maxLength={255}
                placeholder="https://..."
                value={form.avatar}
                onChange={(e) => setForm({ ...form, avatar: e.target.value })}
              />
            </label>

            {saveMsg && (
              <p className={saveMsg.includes('✓') ? styles.okMsg : styles.msgError}>{saveMsg}</p>
            )}

            <button className={styles.primaryBtn} type="submit" disabled={saving}>
              <ion-icon name={saving ? 'sync-outline' : 'save-outline'} suppressHydrationWarning></ion-icon>
              {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar cambios' : 'Save changes')}
            </button>
          </form>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>
              <ion-icon name="shield-checkmark-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Cuenta' : 'Account'}
            </h3>
            <p className={styles.note}>
              <ion-icon name="checkmark-circle-outline" suppressHydrationWarning></ion-icon>
              {user?.provider === 'google'
                ? (es ? 'Sesión con Google activa.' : 'Signed in with Google.')
                : (es ? 'Tu correo está verificado.' : 'Your email is verified.')}
            </p>
            <button className={styles.ghostBtn} type="button" onClick={logout}>
              <ion-icon name="log-out-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Cerrar sesión' : 'Sign out'}
            </button>
          </div>
        </div>
        ) : (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Perfil de invitado' : 'Guest profile'}
          </h3>
          <p className={styles.note}>
            <ion-icon name="checkmark-circle-outline" suppressHydrationWarning></ion-icon>
            {es
              ? 'Tu perfil de invitado se creó automáticamente y tu actividad se guarda en este dispositivo.'
              : 'Your guest profile was created automatically and your activity is saved on this device.'}
          </p>
          <p className={styles.note}>
            {es
              ? 'Inicia sesión o crea una cuenta arriba para conservarlo en todos tus dispositivos.'
              : 'Sign in or create an account above to keep it on all your devices.'}
          </p>
        </div>
        )
      )}

      {tab === 'suscripciones' && (
        <div className={styles.card}>
          {listLoading ? (
            <div className={styles.loadingSmall}>
              <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
              {es ? 'Cargando…' : 'Loading…'}
            </div>
          ) : (lists.suscripciones || []).length === 0 ? (
            <div className={styles.empty}>
              <ion-icon name="folder-open-outline" suppressHydrationWarning></ion-icon>
              <p>{es ? 'No sigues ningún canal todavía.' : 'You don’t follow any channel yet.'}</p>
            </div>
          ) : (
            <ul className={styles.subList}>
              {(lists.suscripciones || []).map((s) => (
                <li key={s.channel} className={styles.subItem}>
                  <span className={styles.subAvatar}>
                    <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
                  </span>
                  <span className={styles.subName}>{s.channel}</span>
                  <span className={styles.subDate}>{fmtMember(s.created_at, es)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(tab === 'guardados' || tab === 'likes' || tab === 'descargas') && (
        <MisVideos
          endpoint={LIST_ENDPOINT[tab]}
          embedded
          withRail={false}
          emptyText={
            tab === 'guardados'
              ? (es ? 'Aún no guardas ningún video.' : 'You haven’t saved any video yet.')
              : tab === 'likes'
                ? (es ? 'Aún no le diste me gusta a nada.' : 'You haven’t liked anything yet.')
                : (es ? 'Aún no has descargado ningún video.' : 'You haven’t downloaded any video yet.')
          }
        />
      )}
    </main>
  );
}
