'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/_Extras/Api/api.js';
import { getUserKey, importGuestData } from '@/_Extras/Interacciones/interactions.js';
import { hasGuestData, getGuestImportPayload, clearGuestData } from '@/_Extras/Interacciones/local.js';

const KEY = 'pkp_user_key';

// Eventos Redis que cambian la sesion (login/registro/verificacion).
const AUTH_EVENTS = new Set([
  'user_login',
  'user_register',
  'user_verified',
  'user_migrate',
  'user_google_login',
]);

const AuthContext = createContext(null);

const FALLBACK = {
  user: null,
  userKey: '',
  ready: false,
  authed: false,
  load: () => {},
  setAccount: () => {},
  logout: () => {},
};

/**
 * Fuente única de la sesión (cliente). El header, el reproductor, los
 * comentarios y el modal leen de aquí: al iniciar sesión se actualiza todo
 * a la vez, sin recargar la página.
 */
export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userKey, setUserKeyState] = useState('');
  const [ready, setReady] = useState(false);
  const authed = !!(user && user.email_verified);

  const load = useCallback(async (key) => {
    const k = key || getUserKey();
    if (!k) { setUser(null); setReady(true); return; }
    setUserKeyState(k);
    try {
      const r = await fetch(`${API_URL}/api/auth/profile?userKey=${encodeURIComponent(k)}`);
      const j = await r.json().catch(() => ({}));
      setUser(j.user || null);
    } catch { /* mantiene el usuario anterior */ }
    finally { setReady(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Eventos de sesion propios (Redis -> SSE): recarga el perfil y los
    // server components al instante, SIN recargar la pagina a mano.
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (AUTH_EVENTS.has(t)) {
        const payloadKey = String(e?.detail?.payload?.userKey || '');
        const myKey = String(getUserKey() || '');
        // Solo me interesa MI sesion (evento sin userKey tambien cuenta).
        if (payloadKey && payloadKey !== myKey) return;
        load();
        try { router.refresh(); } catch { /* noop */ }
        return;
      }
      load();
    };
    const onMe = () => load();
    window.addEventListener('pikantepe:change', onChange);
    window.addEventListener('pkp:me', onMe);
    return () => {
      window.removeEventListener('pikantepe:change', onChange);
      window.removeEventListener('pkp:me', onMe);
    };
  }, [load, router]);

  // Otra pestana inicio/cerro sesion -> esta pestaion se entera al instante.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key && e.key !== KEY) return;
      load();
      try { router.refresh(); } catch { /* noop */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load, router]);

  // Al iniciar sesión (o verificar la cuenta) sube la actividad guardada
  // en el navegador cuando era invitado y limpia el almacén local.
  const importedForRef = useRef('');
  useEffect(() => {
    if (!ready || !authed || !user?.user_key) return;
    if (importedForRef.current === user.user_key) return;
    if (!hasGuestData()) return;
    importedForRef.current = user.user_key;
    (async () => {
      const r = await importGuestData(user.user_key, getGuestImportPayload());
      if (r?.ok) {
        clearGuestData();
        try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
      } else {
        importedForRef.current = '';
      }
    })();
  }, [ready, authed, user]);

  /** Se llama al iniciar sesión / registrarse / verificar: guarda y avisa a toda la app. */
  const setAccount = useCallback((userObj) => {
    const key = userObj?.user_key || getUserKey();
    try { if (userObj?.user_key) localStorage.setItem(KEY, userObj.user_key); } catch { /* noop */ }
    setUserKeyState(key);
    if (userObj) setUser(userObj);
    try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
    // Refresca los server components (cabecera, contadores...) sin F5.
    try { router.refresh(); } catch { /* noop */ }
  }, [router]);

  const logout = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
    const k = getUserKey();
    setUserKeyState(k);
    setUser(null);
    try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
    try { router.refresh(); } catch { /* noop */ }
  }, [router]);

  const value = {
    user,
    userKey,
    ready,
    authed,
    load,
    setAccount,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext) || FALLBACK;
}

export default AuthProvider;
