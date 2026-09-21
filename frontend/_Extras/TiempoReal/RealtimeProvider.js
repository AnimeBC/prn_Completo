'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { initSonido, playNotification, setSonidoActivo } from '@/_Extras/Sonido/sonido.js';

// Mismo criterio que _Extras/Api/api.js: si se abre desde la red local
// (celular), el backend esta en el mismo host con el puerto 3001.
function resolveApi() {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  if (typeof window === 'undefined') return fromEnv;
  try {
    const { hostname, protocol } = window.location;
    const esLocal = hostname === 'localhost' || hostname === '127.0.0.1' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    if (!esLocal) return fromEnv;
    const envHost = (fromEnv.match(/^https?:\/\/([^/:]+)/i) || [])[1] || '';
    const envEsLocal = envHost === 'localhost' || envHost === '127.0.0.1' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(envHost);
    if (!envEsLocal) return fromEnv;
    const port = process.env.NEXT_PUBLIC_API_PORT || '3001';
    return `${protocol}//${hostname}:${port}`;
  } catch {
    return fromEnv;
  }
}

const API = resolveApi();

// Eventos que NO deben refrescar los server components: son interacciones del
// propio usuario (like, guardar, seguir, comentar...) y ya se actualizan en el
// cliente. Refrescarlos reiniciaba el reproductor (parecía una recarga).
const NO_REFRESH = new Set([
  'video_like', 'video_save', 'video_report', 'video_download', 'channel_follow',
  'pack_like', 'pack_save', 'pack_download',
  'comment_created', 'comment_like', 'comment_deleted',
  'user_profile', 'user_register', 'user_verified', 'user_migrate',
  'user_google_login', 'admin_login',
  'notificacion', 'notificacion_admin',
  // Llamadas: se manejan en vivo por pikantepe:change (CallProvider/ChatFlotante).
  'call_offer', 'call_answer', 'call_ice', 'call_reject', 'call_hangup',
  'call_grupo_start', 'call_grupo_join', 'call_grupo_leave', 'call_grupo_signal', 'call_grupo_end',
]);

const RealtimeContext = createContext({ connected: false, lastEvent: null });

/**
 * RealtimeProvider
 * Se conecta por SSE al backend (/api/events). El backend publica en Redis
 * cada cambio; aquí lo recibimos, emitimos un evento global y refrescamos
 * los server components para que el frontend refleje el cambio al instante.
 */
export function RealtimeProvider({ children }) {
  const router = useRouter();
  const { user, userKey } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const esRef = useRef(null);
  const mineRef = useRef('');
  mineRef.current = user?.user_key || userKey || '';

  // Sonido: desbloqueo por gesto + ajuste global (activo por defecto).
  useEffect(() => { initSonido(); }, []);
  useEffect(() => {
    let alive = true;
    const k = user?.user_key || userKey || '';
    fetch(`${API}/api/ajustes/sonido${k ? `?userKey=${encodeURIComponent(k)}` : ''}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setSonidoActivo(j?.activo); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.user_key, userKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let es;
    try {
      es = new EventSource(`${API}/api/events`);
    } catch {
      return;
    }
    esRef.current = es;

    es.addEventListener('ready', () => setConnected(true));

    es.addEventListener('change', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent(data);
        window.dispatchEvent(new CustomEvent('pikantepe:change', { detail: data }));
        const tipo = String(data?.type || '');
        const p = data?.payload || {};
        const mine = String(mineRef.current || '');
        // Sonido: solo cuando llega algo PARA mí (mensaje/notificacion).
        let sonar = false;
        if (tipo === 'notificacion') sonar = !!p.userKey && String(p.userKey) === mine;
        else if (tipo === 'notificacion_admin') sonar = true;
        else if (tipo === 'comunidad_dm') {
          sonar = !!p.para && String(p.para) === mine && String(p.de || '') !== mine;
        } else if (tipo === 'comunidad_mensaje') {
          sonar = !!p.de && String(p.de) !== mine;
        }
        // Las llamadas entrantes usan su propio timbre (playRing) desde CallProvider.
        if (sonar) playNotification();
        // refresca datos de los server components (solo cambios de contenido).
        // Se difiere para evitar "Router action dispatched before initialization".
        if (!NO_REFRESH.has(tipo) && !tipo.startsWith('comunidad_')) {
          setTimeout(() => {
            try { router.refresh(); } catch { /* router aún no listo */ }
          }, 80);
        }
      } catch {
        /* mensaje no JSON */
      }
    });

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [router]);

  return (
    <RealtimeContext.Provider value={{ connected, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

export default RealtimeProvider;
