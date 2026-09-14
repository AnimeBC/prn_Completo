'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';

const KEY = 'pkp_user_key';

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
  const [user, setUser] = useState(null);
  const [userKey, setUserKeyState] = useState('');
  const [ready, setReady] = useState(false);

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
    const onChange = () => load();
    window.addEventListener('pkp:me', onChange);
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      window.removeEventListener('pkp:me', onChange);
      window.removeEventListener('pikantepe:change', onChange);
    };
  }, [load]);

  /** Se llama al iniciar sesión / registrarse / verificar: guarda y avisa a toda la app. */
  const setAccount = useCallback((userObj) => {
    const key = userObj?.user_key || getUserKey();
    try { if (userObj?.user_key) localStorage.setItem(KEY, userObj.user_key); } catch { /* noop */ }
    setUserKeyState(key);
    if (userObj) setUser(userObj);
    try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
    const k = getUserKey();
    setUserKeyState(k);
    setUser(null);
    try { window.dispatchEvent(new Event('pkp:me')); } catch { /* noop */ }
  }, []);

  const value = {
    user,
    userKey,
    ready,
    authed: !!(user && user.email_verified),
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
