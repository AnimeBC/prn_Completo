'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './perfil.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';
import { getGuestData } from '@/_Extras/Interacciones/local.js';
import { verifyField } from '@/_Extras/Auth/availability.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import ImageCropModal from '@/_Extras/Imagen/ImageCropModal.js';
import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';

const TABS = [
  { id: 'perfil', icon: 'person-outline', label: ['Perfil', 'Profile'] },
  { id: 'guardados', icon: 'bookmark-outline', label: ['Guardados', 'Saved'] },
  { id: 'likes', icon: 'thumbs-up-outline', label: ['Me gusta', 'Likes'] },
  { id: 'suscripciones', icon: 'people-outline', label: ['Suscripciones', 'Following'] },
  { id: 'descargas', icon: 'download-outline', label: ['Descargas', 'Downloads'] },
];

// El invitado guarda todo en su navegador: puede ver guardados, me gusta y descargas.
const GUEST_TABS = ['perfil', 'guardados', 'likes', 'descargas'];

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

const availCls = (a) => (a.state === 'ok' ? styles.hintOk : a.state === 'taken' || a.state === 'invalid' ? styles.hintBad : styles.hint);
const availIcon = (a) => (a.state === 'ok' ? 'checkmark-circle-outline' : a.state === 'checking' ? 'sync-outline' : a.state === 'idle' ? null : 'alert-circle-outline');

// Fortaleza de la contraseña: 0 (vacía) a 4 (muy fuerte).
function passStrength(p) {
  if (!p) return 0;
  let s = 1;
  if (p.length >= 8) s += 1;
  if (/\d/.test(p) && /[a-zA-Z]/.test(p)) s += 1;
  if (/[^a-zA-Z0-9]/.test(p) || p.length >= 12) s += 1;
  return Math.min(4, s);
}

export default function PerfilClient() {
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { setAccount, logout: authLogout } = useAuth();
  const router = useRouter();

  const [userKey, setUserKey] = useState('');
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('perfil');

  const [form, setForm] = useState({ nombre: '', usuario: '', email: '', avatar: '', banner: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [bannerCropFile, setBannerCropFile] = useState(null);
  const avatarInputRef = useRef(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const bannerInputRef = useRef(null);

  const [lists, setLists] = useState({});
  const [listLoading, setListLoading] = useState(false);

  // login
  const [logEmail, setLogEmail] = useState('');
  const [logPass, setLogPass] = useState('');
  const [logShow, setLogShow] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logMsg, setLogMsg] = useState('');

  // registro
  const [regUsuario, setRegUsuario] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regShow, setRegShow] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regMsg, setRegMsg] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyNotice, setVerifyNotice] = useState('');
  const [codeVal, setCodeVal] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState('');
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register' (pestañas en móvil)

  const [googleCred, setGoogleCred] = useState('');

  const [uCheck, setUCheck] = useState({ state: 'idle', msg: '' });
  const [eCheck, setECheck] = useState({ state: 'idle', msg: '' });
  const [editUCheck, setEditUCheck] = useState({ state: 'idle', msg: '' });

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
      if (j.virtual) {
        // Invitado: las estadísticas salen de lo que guardó en el navegador.
        const g = getGuestData();
        setStats({
          likes: Object.values(g.videoLikes).filter((tipo) => tipo === 'like').length,
          saved: g.videoSaved.length,
          following: g.following.length,
          downloads: g.videoDownloads.length,
        });
      } else {
        setStats(j.stats || EMPTY_STATS);
      }
      setForm({
        nombre: j.user?.nombre || '',
        usuario: j.user?.usuario || '',
        email: j.user?.email || '',
        avatar: j.user?.avatar || '',
        banner: j.user?.banner || '',
      });
      try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
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

  // URL por estado de sesion: /perfil?sesion=invitado | /perfil?sesion=activa.
  // Se sincroniza sola al entrar, verificar o cerrar sesion (sin recargar).
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const estado = authed ? 'activa' : 'invitado';
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('sesion') === estado) return;
    sp.set('sesion', estado);
    router.replace(`/perfil?${sp.toString()}`, { scroll: false });
  }, [authed, loading, router]);

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
          const w = Math.min(400, Math.max(200, Math.round(el.clientWidth || 300)));
          window.google.accounts.id.renderButton(el, {
            theme: 'outline', size: 'large', width: w, text: 'continue_with', logo_alignment: 'left',
          });
          el.dataset.rendered = '1';
          // estira el iframe real para que TODO el botón sea clickeable
          const stretch = () => {
            el.querySelectorAll('div, iframe').forEach((n) => {
              n.style.setProperty('width', '100%', 'important');
              n.style.setProperty('min-width', '100%', 'important');
              n.style.setProperty('max-width', 'none', 'important');
              n.style.setProperty('height', '100%', 'important');
            });
          };
          stretch();
          setTimeout(stretch, 400);
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
      setAccount(j.user || { user_key: key });
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
      if (form.usuario) {
        const u = await verifyField({ field: 'usuario', value: form.usuario, userKey, es });
        setEditUCheck(u);
        if (u.state !== 'ok') { setSaveMsg(u.msg); return; }
      }
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
      try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
      setSaveMsg(es ? 'Perfil actualizado ✓' : 'Profile updated ✓');
    } catch {
      setSaveMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file) {
    if (!file) return;
    if (!(file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif)$/i.test(file.name))) {
      setSaveMsg(es ? 'Solo imágenes (JPG/PNG/WebP).' : 'Images only (JPG/PNG/WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveMsg(es ? 'La imagen no debe pesar más de 5 MB.' : 'Image must be under 5 MB.');
      return;
    }
    setAvatarBusy(true);
    setSaveMsg('');
    try {
      const fd = new FormData();
      fd.append('userKey', userKey);
      fd.append('avatar', file);
      const r = await fetch(`${API_URL}/api/auth/profile/avatar`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveMsg(j.error || (es ? 'No se pudo subir la imagen' : 'Could not upload the image'));
        return;
      }
      setUser(j.user || user);
      setForm((f) => ({ ...f, avatar: j.user?.avatar || j.avatar || '' }));
      try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
      setSaveMsg(es ? 'Foto de perfil actualizada ✓' : 'Profile photo updated ✓');
    } catch {
      setSaveMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setAvatarBusy(false);
    }
  }

  function onPickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  }

  // Portada (banner) del perfil: misma validacion que la foto.
  async function uploadBanner(file) {
    if (!file) return;
    if (!(file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif)$/i.test(file.name))) {
      setSaveMsg(es ? 'Solo imágenes (JPG/PNG/WebP).' : 'Images only (JPG/PNG/WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveMsg(es ? 'La imagen no debe pesar más de 5 MB.' : 'Image must be under 5 MB.');
      return;
    }
    setBannerBusy(true);
    setSaveMsg('');
    try {
      const fd = new FormData();
      fd.append('userKey', userKey);
      fd.append('banner', file);
      const r = await fetch(`${API_URL}/api/auth/profile/banner`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveMsg(j.error || (es ? 'No se pudo subir la portada' : 'Could not upload the cover'));
        return;
      }
      setUser(j.user || user);
      setForm((f) => ({ ...f, banner: j.banner || j.user?.banner || '' }));
      try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
      setSaveMsg(es ? 'Portada actualizada ✓' : 'Cover updated ✓');
    } catch {
      setSaveMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setBannerBusy(false);
    }
  }

  function onPickBanner(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    // En vez de subirla directo: abre el modal de encuadre (estilo
    // Facebook/YouTube) para elegir que parte de la foto se ve.
    if (file) setBannerCropFile(file);
  }

  async function doRegister(e) {
    e.preventDefault();
    setRegMsg('');
    setRegBusy(true);
    try {
      const [u, em] = await Promise.all([
        verifyField({ field: 'usuario', value: regUsuario, userKey, es }),
        verifyField({ field: 'email', value: regEmail, userKey, es }),
      ]);
      setUCheck(u); setECheck(em);
      if (u.state !== 'ok') { setRegMsg(u.msg); return; }
      if (em.state !== 'ok') { setRegMsg(em.msg); return; }

      const r = await fetch(`${API_URL}/api/auth/profile/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, nombre: regUsuario, usuario: regUsuario, email: regEmail, password: regPass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRegMsg(j.error || (es ? 'No se pudo crear la cuenta' : 'Could not create the account'));
        return;
      }
      setPendingEmail(regEmail);
      setRegPass('');
      setCodeVal('');
      setCodeMsg('');
      loadProfile(userKey);
    } catch {
      setRegMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setRegBusy(false);
    }
  }

  async function doVerifyCode(e) {
    e.preventDefault();
    setCodeBusy(true);
    setCodeMsg('');
    try {
      const r = await fetch(`${API_URL}/api/auth/profile/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, code: codeVal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setCodeMsg(j.error || (es ? 'No se pudo verificar el código' : 'Could not verify the code')); return; }
      setPendingEmail('');
      setCodeVal('');
      setAccount(j.user || { user_key: userKey });
      setUser(j.user || null);
      setStats(j.stats || EMPTY_STATS);
      setTab('perfil');
      loadProfile(userKey);
    } catch {
      setCodeMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    } finally {
      setCodeBusy(false);
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
      setAccount(j.user || { user_key: key });
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
      const msg = j.ok ? (es ? 'Código reenviado. Revisa tu bandeja.' : 'Code resent. Check your inbox.') : (j.error || '');
      setLogMsg(msg);
      setCodeMsg(msg);
    } catch {
      setLogMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
      setCodeMsg(es ? 'No hay conexión con el servidor.' : 'No connection to the server.');
    }
  }

  // Cierra el modal de codigo: vuelve al formulario para corregir el correo
  // o la contraseña y registrarse de nuevo.
  function cancelarCodigo() {
    setPendingEmail('');
    setCodeVal('');
    setCodeMsg('');
  }

  function logout() {
    authLogout();
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
  ];

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
      <input
        ref={avatarInputRef}
        className={styles.avatarInput}
        type="file"
        accept="image/*"
        onChange={onPickAvatar}
      />
      <input
        ref={bannerInputRef}
        className={styles.avatarInput}
        type="file"
        accept="image/*"
        onChange={onPickBanner}
      />

      <ImageCropModal
        open={!!cropFile}
        file={cropFile}
        shape="circle"
        title={es ? 'Ajusta tu foto de perfil' : 'Adjust your profile photo'}
        subtitle={es ? 'Arrastra y usa el zoom para encuadrarla.' : 'Drag and zoom to frame it.'}
        onCancel={() => setCropFile(null)}
        onSave={(blob) => {
          const f = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
          setCropFile(null);
          uploadAvatar(f);
        }}
      />

      {/* Portada: mismo modal, marco panoramico 16:5 (estilo Facebook/YouTube). */}
      <ImageCropModal
        open={!!bannerCropFile}
        file={bannerCropFile}
        shape="banner"
        outputSize={1600}
        title={es ? 'Ajusta tu portada' : 'Adjust your cover'}
        subtitle={es ? 'Arrastra la imagen y usa el zoom para elegir qué parte se muestra.' : 'Drag and zoom to choose which part is shown.'}
        onCancel={() => setBannerCropFile(null)}
        onSave={(blob) => {
          const f = new File([blob], 'banner.jpg', { type: 'image/jpeg' });
          setBannerCropFile(null);
          uploadBanner(f);
        }}
      />

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

      {/* ===== Cabecera del perfil: portada + avatar estilo canal ===== */}
      <section className={styles.hero}>
        <div
          className={`${styles.banner} ${authed ? styles.bannerEditable : ''}`}
          style={form.banner ? { backgroundImage: `url(${mediaUrl(form.banner)})` } : undefined}
          onClick={authed && !bannerBusy ? () => bannerInputRef.current?.click() : undefined}
          onDragOver={authed ? (e) => e.preventDefault() : undefined}
          onDrop={authed ? (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) setBannerCropFile(f); } : undefined}
          role={authed ? 'button' : undefined}
          tabIndex={authed ? 0 : undefined}
          onKeyDown={authed ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bannerInputRef.current?.click(); } } : undefined}
          aria-label={authed ? (es ? 'Cambiar portada' : 'Change cover') : undefined}
        >
          {!form.banner && <span className={styles.bannerGlow} aria-hidden="true" />}
          {authed && !form.banner && (
            <div className={styles.bannerHint}>
              <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
              <span>{es ? 'Toca o arrastra una imagen para tu portada' : 'Tap or drop an image for your cover'}</span>
              <button
                type="button"
                className={styles.bannerHintBtn}
                disabled={bannerBusy}
                onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}
              >
                <ion-icon name={bannerBusy ? 'sync-outline' : 'cloud-upload-outline'} suppressHydrationWarning></ion-icon>
                {bannerBusy ? (es ? 'Subiendo…' : 'Uploading…') : (es ? 'Subir portada' : 'Upload cover')}
              </button>
            </div>
          )}
          {authed && form.banner && (
            <button
              type="button"
              className={styles.bannerEdit}
              disabled={bannerBusy}
              onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}
            >
              <ion-icon name={bannerBusy ? 'sync-outline' : 'image-outline'} suppressHydrationWarning></ion-icon>
              {bannerBusy ? (es ? 'Subiendo…' : 'Uploading…') : (es ? 'Editar portada' : 'Edit cover')}
            </button>
          )}
        </div>

        <div className={styles.head}>
          <div
            className={styles.avatarWrap}
            onClick={() => avatarInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatarInputRef.current?.click(); } }}
            aria-label={es ? 'Cambiar foto de perfil' : 'Change profile photo'}
          >
            {avatarSrc
              ? <img className={styles.avatarImg} src={avatarSrc} alt="" />
              : <span className={styles.avatarInitial}>{initial}</span>}
            <button
              type="button"
              className={styles.avatarEdit}
              onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }}
              aria-label={es ? 'Cambiar foto de perfil' : 'Change profile photo'}
              title={es ? 'Cambiar foto de perfil' : 'Change profile photo'}
            >
              <ion-icon name={avatarBusy ? 'sync-outline' : 'camera-outline'} suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <div className={styles.headInfo}>
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

            {saveMsg && (
              <div className={styles.actionsRow}>
                <span className={`${styles.heroMsg} ${saveMsg.includes('✓') ? styles.heroMsgOk : ''}`}>
                  {saveMsg}
                </span>
              </div>
            )}
          </div>

          {/* Estadisticas a la DERECHA del bloque de texto (PC) y al lado
              de la foto en movil (grid areas), nunca debajo. */}
          <div className={styles.statsRow}>
            {statsList.map((s) => (
              <span key={s.key} className={styles.statPill}>
                <span className={styles.statPillTop}>
                  <ion-icon name={s.icon} suppressHydrationWarning></ion-icon>
                  <b>{Number(s.value || 0).toLocaleString(es ? 'es-PE' : 'en-US')}</b>
                </span>
                <span className={styles.statPillLabel}>{s.label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Acceso (invitado): panel dividido branding + formulario (Diseño 1) ===== */}
      {!authed && (
        <section className={styles.authSection}>
          <div className={styles.authHero}>
            <aside className={styles.authBrand}>
              <span className={styles.authBrandIcon}>
                <ion-icon name="flame-outline" suppressHydrationWarning></ion-icon>
              </span>
              <h2 className={styles.authBrandTitle}>
                {es ? 'Entra o crea tu cuenta' : 'Sign in or create your account'}
              </h2>
              <p className={styles.authBrandSub}>
                {es ? 'Únete a la comunidad de pikante pe.' : 'Join the pikante pe community.'}
              </p>
              <ul className={styles.authList}>
                <li>
                  <span className={styles.authListNum}>1</span>
                  {es ? 'Guarda videos y dale like' : 'Save videos and like'}
                </li>
                <li>
                  <span className={styles.authListNum}>2</span>
                  {es ? 'Sigue tus canales favoritos' : 'Follow your favorite channels'}
                </li>
                <li>
                  <span className={styles.authListNum}>3</span>
                  {es ? 'Califica y comenta los videos' : 'Rate and comment on videos'}
                </li>
                <li>
                  <span className={styles.authListNum}>4</span>
                  {es ? 'Chatea con amigos y en grupos' : 'Chat with friends and in groups'}
                </li>
                <li>
                  <span className={styles.authListNum}>5</span>
                  {es ? 'Únete a grupos y comunidades' : 'Join groups and communities'}
                </li>
                <li>
                  <span className={styles.authListNum}>6</span>
                  {es ? 'Tu actividad de invitado se conserva' : 'Your guest activity is kept'}
                </li>
              </ul>
            </aside>

            <div className={styles.authPane}>
              <div className={styles.authTabs} role="tablist" aria-label={es ? 'Acceso' : 'Access'}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'login'}
                  className={`${styles.authTab} ${authTab === 'login' ? styles.authTabActive : ''}`}
                  onClick={() => setAuthTab('login')}
                >
                  <ion-icon name="log-in-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Iniciar sesión' : 'Sign in'}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'register'}
                  className={`${styles.authTab} ${authTab === 'register' ? styles.authTabActive : ''}`}
                  onClick={() => setAuthTab('register')}
                >
                  <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Crear cuenta' : 'Create account'}
                </button>
              </div>

              {/* Iniciar sesión */}
              <div className={`${styles.authPanel} ${authTab !== 'login' ? styles.authPanelHidden : ''}`}>
                <h3 className={styles.authTitle}>{es ? 'Iniciar sesión' : 'Sign in'}</h3>
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
                <div className={styles.googleWrap}>
                  <button
                    className={styles.googleBtn}
                    type="button"
                    onClick={() => {
                      if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                        setLogMsg(es ? 'Google no configurado (falta NEXT_PUBLIC_GOOGLE_CLIENT_ID).' : 'Google not configured.');
                      }
                    }}
                  >
                    <GoogleIcon />
                    <span>{es ? 'Continuar con Google' : 'Continue with Google'}</span>
                  </button>
                  <div id="g_id_login" className={styles.gsiMount} aria-hidden="true" />
                </div>
              </div>

              {/* Crear cuenta */}
              <div className={`${styles.authPanel} ${authTab !== 'register' ? styles.authPanelHidden : ''}`}>
                <h3 className={styles.authTitle}>{es ? 'Crear cuenta' : 'Create account'}</h3>
                <p className={styles.authSub}>{es ? 'Únete a la comunidad' : 'Join the community'}</p>

                <form className={styles.form} onSubmit={doRegister}>
                  <div className={styles.control}>
                    <ion-icon name="at-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                    <input
                      className={styles.ctrlInput}
                      type="text"
                      name="username"
                      autoComplete="username"
                      maxLength={30}
                      placeholder={es ? 'Nombre de usuario (ej: juan_pe)' : 'Username (e.g. juan_pe)'}
                      value={regUsuario}
                      onChange={(e) => { setRegUsuario(e.target.value.replace(/\s/g, '')); setUCheck({ state: 'idle', msg: '' }); }}
                      required
                    />
                  </div>
                  {availIcon(uCheck) && (
                    <p className={availCls(uCheck)}>
                      <ion-icon name={availIcon(uCheck)} className={uCheck.state === 'checking' ? styles.spin : ''} suppressHydrationWarning></ion-icon>
                      {uCheck.msg || (es ? 'Verificando…' : 'Checking…')}
                    </p>
                  )}
                  <div className={styles.control}>
                    <ion-icon name="mail-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                    <input
                      className={styles.ctrlInput}
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder={es ? 'Correo electrónico' : 'Email'}
                      value={regEmail}
                      onChange={(e) => { setRegEmail(e.target.value); setECheck({ state: 'idle', msg: '' }); }}
                      required
                    />
                  </div>
                  {availIcon(eCheck) && (
                    <p className={availCls(eCheck)}>
                      <ion-icon name={availIcon(eCheck)} className={eCheck.state === 'checking' ? styles.spin : ''} suppressHydrationWarning></ion-icon>
                      {eCheck.msg || (es ? 'Verificando…' : 'Checking…')}
                    </p>
                  )}
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
                <div className={styles.googleWrap}>
                  <button
                    className={styles.googleBtn}
                    type="button"
                    onClick={() => {
                      if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                        setRegMsg(es ? 'Google no configurado (falta NEXT_PUBLIC_GOOGLE_CLIENT_ID).' : 'Google not configured.');
                      }
                    }}
                  >
                    <GoogleIcon />
                    <span>{es ? 'Continuar con Google' : 'Continue with Google'}</span>
                  </button>
                  <div id="g_id_register" className={styles.gsiMount} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Modal de verificacion de codigo (centrado, flotante). */}
      {pendingEmail && !authed && (
        <div
          className={styles.codeOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) cancelarCodigo(); }}
        >
          <div className={styles.codeCard} role="dialog" aria-modal="true" aria-label={es ? 'Verificar código' : 'Verify code'}>
            <button
              type="button"
              className={styles.codeClose}
              onClick={cancelarCodigo}
              aria-label={es ? 'Cerrar' : 'Close'}
            >
              <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
            </button>

            <span className={styles.codeIcon}>
              <ion-icon name="mail-unread-outline" suppressHydrationWarning></ion-icon>
            </span>
            <strong className={styles.codeTitle}>{es ? 'Revisa tu correo' : 'Check your email'}</strong>
            <p className={styles.codeText}>
              {es
                ? `Enviamos un código de 6 dígitos a ${pendingEmail}.`
                : `We sent a 6-digit code to ${pendingEmail}.`}
            </p>

            <form className={styles.codeRow} onSubmit={doVerifyCode}>
              <input
                className={styles.codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={codeVal}
                onChange={(e) => setCodeVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              <button className={styles.primaryBtn} type="submit" disabled={codeBusy || codeVal.length !== 6}>
                <ion-icon name={codeBusy ? 'sync-outline' : 'checkmark-done-outline'} suppressHydrationWarning></ion-icon>
                {codeBusy ? (es ? 'Verificando…' : 'Verifying…') : (es ? 'Verificar' : 'Verify')}
              </button>
            </form>
            {codeMsg && <p className={styles.msgError}>{codeMsg}</p>}

            <div className={styles.codeActions}>
              <button type="button" className={styles.linkBtn} onClick={resendVerification}>
                {es ? 'Reenviar código' : 'Resend code'}
              </button>
              <button type="button" className={styles.codeBack} onClick={cancelarCodigo}>
                <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Volver y editar' : 'Back to edit'}
              </button>
            </div>
          </div>
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
          <form
            id="perfil-form"
            className={styles.card}
            onSubmit={saveProfile}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
          >
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
                <span className={styles.label}>{es ? 'Nombre de usuario' : 'Username'}</span>
                <input
                  className={styles.input}
                  type="text"
                  maxLength={30}
                  placeholder={es ? 'ej: juan_pe' : 'e.g. juan_pe'}
                  value={form.usuario}
                  onChange={(e) => { setForm({ ...form, usuario: e.target.value.replace(/\s/g, '') }); setEditUCheck({ state: 'idle', msg: '' }); }}
                />
                {availIcon(editUCheck) && (
                  <span className={availCls(editUCheck)}>
                    <ion-icon name={availIcon(editUCheck)} suppressHydrationWarning></ion-icon>
                    {editUCheck.msg}
                  </span>
                )}
              </label>
            )}

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
