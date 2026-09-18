'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const esRef = useRef(null);

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
        // refresca datos de los server components (solo cambios de contenido).
        // Se difiere para evitar "Router action dispatched before initialization".
        const tipo = String(data?.type || '');
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
