'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import styles from './chatDock.module.css';
import ChatFlotante from '@/_Pages/main/Chat/componentes/ChatFlotante';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

const KEY = 'pkp_chat_dock';

const ChatDockContext = createContext({ abrir: () => {}, cerrar: () => {}, flotantes: [] });

/** Clave única de una conversación en el dock. */
function claveDock(tipo, chat) {
  return tipo === 'dm' ? `dm:${chat.user_key}` : String(chat.id);
}

/** Dock global de chats: las ventanas/burbujas se mantienen en todo el sitio. */
export function ChatDockProvider({ children }) {
  const { userKey, authed } = useAuth();
  const pathname = usePathname();
  // En la pagina /chat las conversaciones se ven en el panel: no mostramos el
  // dock flotante ahi (sigue vivo el estado para que reaparezca al navegar).
  const enPaginaChat = typeof pathname === 'string' && pathname.startsWith('/chat');
  const [flotantes, setFlotantes] = useState([]);
  const [activoId, setActivoId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const suppressClickRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [maxAbiertos, setMaxAbiertos] = useState(3);
  const [maxBurbujas, setMaxBurbujas] = useState(5);
  const prevKeyRef = useRef(null);
  const loadedKeyRef = useRef(null);
  const skipSaveRef = useRef(false);
  const storageKey = authed && userKey ? `${KEY}:${userKey}` : null;

  useEffect(() => { setMounted(true); }, []);

  // El arrastre de la fila de globitos es solo para celular.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // Posición guardada de la fila de globitos (arrastrable en celular).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const p = JSON.parse(window.localStorage.getItem('pkp_chat_dock_pos') || 'null');
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) setPos({ x: p.x, y: p.y });
    } catch { /* noop */ }
  }, []);

  // Cuántas ventanas caben según el ancho de pantalla; el resto van a burbujas.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const calc = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const n = Math.floor((w - 120) / 342);
      setMaxAbiertos(Math.max(1, Math.min(3, n)));
      // Burbujas que caben a lo alto (cada una ~56px).
      setMaxBurbujas(Math.max(2, Math.min(9, Math.floor((h - 180) / 56))));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Al iniciar sesión carga las ventanas guardadas; al cerrar sesión se limpian.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!storageKey) {
      if (prevKeyRef.current) {
        try { window.localStorage.removeItem(prevKeyRef.current); } catch { /* noop */ }
      }
      prevKeyRef.current = null;
      setFlotantes([]);
      return;
    }
    prevKeyRef.current = storageKey;
    try {
      const raw = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(raw)) {
        const items = raw
          .filter((x) => x && x.chat && (x.tipo === 'dm' ? x.chat.user_key : x.chat.id))
          .map((x) => {
            const tipo = x.tipo === 'dm' ? 'dm' : 'grupo';
            return { id: claveDock(tipo, x.chat), tipo, chat: x.chat, minimizado: !!x.minimizado };
          });
        skipSaveRef.current = true;
        setFlotantes(items);
        loadedKeyRef.current = storageKey;
        return;
      }
    } catch { /* noop */ }
    loadedKeyRef.current = storageKey;
  }, [storageKey]);

  // Guarda el estado para que sobreviva recargas (solo tras cargar la clave).
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    if (loadedKeyRef.current !== storageKey) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(flotantes.map((f) => ({ tipo: f.tipo, chat: f.chat, minimizado: !!f.minimizado }))));
    } catch { /* noop */ }
  }, [flotantes, storageKey]);

  const abrir = useCallback((chat, tipo = 'grupo') => {
    if (!chat) return;
    if (tipo !== 'dm' && !chat.id) return;
    if (tipo === 'dm' && !chat.user_key) return;
    const id = claveDock(tipo, chat);
    setActivoId(id);
    setFlotantes((prev) => (
      prev.some((f) => String(f.id) === id)
        ? prev.map((f) => (String(f.id) === id ? { ...f, tipo, chat, minimizado: false, nuevo: false, noLeidos: 0 } : f))
        : [...prev, { id, tipo, chat, minimizado: false, nuevo: false, noLeidos: 0 }]
    ));
  }, []);

  const cerrar = useCallback((id) => {
    setFlotantes((prev) => prev.filter((f) => String(f.id) !== String(id)));
    setActivoId((cur) => (String(cur) === String(id) ? null : cur));
  }, []);

  // Elimina toda la fila de globitos (las conversaciones minimizadas).
  const cerrarBurbujas = useCallback(() => {
    setFlotantes((prev) => prev.filter((f) => !f.minimizado));
  }, []);

  const minimizar = useCallback((id) => {
    setFlotantes((prev) => prev.map((f) => (String(f.id) === String(id) ? { ...f, minimizado: true } : f)));
  }, []);

  // Al activar una conversación se limpia su aviso de no leídos al instante.
  const limpiarNuevos = useCallback((id) => {
    setFlotantes((prev) => {
      let cambio = false;
      const next = prev.map((f) => {
        if (String(f.id) === String(id) && (f.noLeidos || f.nuevo)) {
          cambio = true;
          return { ...f, noLeidos: 0, nuevo: false };
        }
        return f;
      });
      return cambio ? next : prev;
    });
  }, []);

  const restaurar = useCallback((id) => {
    setActivoId(id);
    setFlotantes((prev) => {
      const item = prev.find((f) => String(f.id) === String(id));
      if (!item) return prev;
      const rest = prev.filter((f) => String(f.id) !== String(id));
      // Se mueve al final para que quede como ventana visible (la más reciente).
      return [...rest, { ...item, minimizado: false, nuevo: false, noLeidos: 0 }];
    });
  }, []);

  // Zona del tacho (centro de la pantalla) donde se sueltan los globitos.
  function zonaTacho(x, y) {
    if (typeof window === 'undefined') return false;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return Math.abs(x - cx) <= 78 && Math.abs(y - cy) <= 78;
  }

  function esMovil() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  // Arrastra TODA la fila de globitos (solo celular). Sigue el dedo en X e Y;
  // al soltar sobre el tacho desaparecen; si no, la fila queda donde la dejaste.
  function onBubblePointerDown(e, id) {
    if (!esMovil()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    suppressClickRef.current = false;
    setDrag({ id, dx: 0, dy: 0, over: false });

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
      setDrag({ id, dx, dy, over: zonaTacho(ev.clientX, ev.clientY) });
    };
    const end = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const over = zonaTacho(ev.clientX, ev.clientY);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const seMovio = moved || Math.abs(dx) > 8 || Math.abs(dy) > 8;
      setDrag(null);
      if (over) {
        suppressClickRef.current = true;
        cerrarBurbujas();
        return;
      }
      if (!seMovio) return; // fue un tap: el click restaura
      suppressClickRef.current = true;
      // Queda donde la soltó el usuario (entre izquierda y derecha), sin forzar un lado.
      const w = typeof window !== 'undefined' ? window.innerWidth : 0;
      const h = typeof window !== 'undefined' ? window.innerHeight : 0;
      const destinoX = Math.max(-(w - 120), Math.min(0, pos.x + dx));
      const destinoY = Math.max(-(h - 230), Math.min(0, pos.y + dy));
      setPos({ x: destinoX, y: destinoY });
      try { window.localStorage.setItem('pkp_chat_dock_pos', JSON.stringify({ x: destinoX, y: destinoY })); } catch { /* noop */ }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // Lee los no leídos reales y, si autoAgregar, abre el bubble de todo DM con
  // mensajes sin leer (aunque nunca lo hayas abierto), como el chat head de Facebook.
  const recolectar = useCallback(async (autoAgregar = false) => {
    if (!authed || !userKey) return;
    try {
      const [g, d] = await Promise.all([apiComunidad.chats(userKey), apiComunidad.dmChats(userKey)]);
      const dmRows = (d && d.data) || [];
      const mapa = new Map();
      for (const c of (g && g.data) || []) mapa.set(String(c.id), c.no_leidos || 0);
      for (const c of dmRows) mapa.set(`dm:${c.otro_key}`, c.no_leidos || 0);
      setFlotantes((prev) => {
        const ids = new Set(prev.map((f) => String(f.id)));
        const nuevas = [];
        if (autoAgregar) {
          for (const c of dmRows) {
            const id = `dm:${c.otro_key}`;
            if ((c.no_leidos || 0) > 0 && !ids.has(id)) {
              const nombre = c.otro_usuario || c.otro_nombre || 'Usuario';
              nuevas.push({
                id,
                tipo: 'dm',
                chat: { user_key: c.otro_key, usuario: nombre, avatar: c.otro_avatar },
                minimizado: true,
                nuevo: true,
                noLeidos: c.no_leidos || 0,
              });
            }
          }
        }
        let cambio = nuevas.length > 0;
        const next = prev.map((f) => {
          const conocida = mapa.has(String(f.id));
          const n = conocida ? (mapa.get(String(f.id)) || 0) : (f.noLeidos || 0);
          if (n !== (f.noLeidos || 0)) { cambio = true; return { ...f, noLeidos: n, nuevo: n > 0 }; }
          return f;
        });
        return cambio ? [...next, ...nuevas] : prev;
      });
    } catch { /* noop */ }
  }, [authed, userKey]);

  // Al iniciar sesión: marca no leídos y abre los chat heads pendientes.
  useEffect(() => { recolectar(true); }, [recolectar]);

  // Si cambia el set de conversaciones del dock, solo actualiza (sin re-abrir cerrados).
  const idsKey = flotantes.map((f) => f.id).join('|');
  useEffect(() => { recolectar(false); }, [idsKey, recolectar]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let t = null;
    const onChange = (e) => {
      const detail = e && e.detail ? e.detail : {};
      const tipo = String(detail.type || '');
      if (!tipo.startsWith('comunidad_')) return;
      const p = detail.payload || {};
      const entrante = tipo === 'comunidad_dm'
        && p.de && p.para
        && String(p.para) === String(userKey)
        && String(p.de) !== String(userKey);
      if (t) clearTimeout(t);
      t = setTimeout(() => recolectar(!!entrante), 400);
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('pikantepe:change', onChange);
    };
  }, [recolectar, userKey]);

  return (
    <ChatDockContext.Provider value={{ abrir, cerrar, minimizar, restaurar, flotantes }}>
      {children}

      {mounted && authed && !enPaginaChat && flotantes.length > 0 && (() => {
        const abiertos = flotantes.filter((f) => !f.minimizado);
        const visibles = abiertos.slice(-maxAbiertos);
        const visiblesIds = new Set(visibles.map((f) => String(f.id)));
        const burbujas = flotantes.filter((f) => f.minimizado || !visiblesIds.has(String(f.id)));
        return createPortal(
          <div className={styles.dock}>
            <div className={styles.dockWindows}>
              {visibles.map((f) => (
                <ChatFlotante
                  key={f.id}
                  embedded
                  tipo={f.tipo}
                  chat={f.chat}
                  userKey={userKey}
                  nuevo={!!f.nuevo}
                  noLeidos={f.noLeidos || 0}
                  activo={String(f.id) === String(activoId)}
                  onActivar={() => { setActivoId(f.id); limpiarNuevos(f.id); }}
                  onVisto={() => limpiarNuevos(f.id)}
                  onClose={() => cerrar(f.id)}
                  onMinimize={() => minimizar(f.id)}
                />
              ))}
            </div>
            {burbujas.length > 0 && (() => {
              const visiblesB = burbujas.slice(0, maxBurbujas);
              const restantes = burbujas.length - visiblesB.length;
              const siguiente = burbujas[visiblesB.length];
              const pi = drag ? visiblesB.findIndex((f) => String(f.id) === String(drag.id)) : -1;
              return (
                <div
                  className={`${styles.dockBubbles} ${drag ? styles.dockBubblesDrag : ''}`}
                  style={isMobile ? {
                    transform: `translate(${pos.x + (drag ? drag.dx : 0)}px, ${pos.y + (drag ? drag.dy : 0)}px) scale(${drag ? (drag.over ? 0.9 : 1.02) : 1})`,
                    transition: drag ? 'transform 0.1s ease-out' : 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                    willChange: 'transform',
                  } : undefined}
                >
                  {visiblesB.map((f, i) => {
                    const dragging = drag && String(drag.id) === String(f.id);
                    // Efecto gusano: cada burbuja sigue con un retraso progresivo (pero
                    // acotado, para que no se separen demasiado) curvándose hacia el dedo.
                    const dist = drag ? Math.abs(i - pi) : 0;
                    const mag = drag ? (Math.hypot(drag.dx, drag.dy) || 1) : 1;
                    const ux = drag ? drag.dx / mag : 0;
                    const uy = drag ? drag.dy / mag : 0;
                    const trail = drag ? 36 * (1 - 1 / (1 + dist * 0.75)) : 0;
                    const childStyle = drag ? {
                      transform: `translate(${(-ux * trail) - 4 * (i - pi)}px, ${-uy * trail}px)`,
                      transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    } : undefined;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.bubbleBtn} ${dragging ? styles.bubbleDragging : ''}`}
                        style={childStyle}
                        onPointerDown={(e) => onBubblePointerDown(e, f.id)}
                        onClick={() => {
                          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                          restaurar(f.id);
                        }}
                        title={f.chat.nombre || f.chat.usuario}
                      >
                        {f.chat.avatar
                          ? <img src={mediaUrl(f.chat.avatar)} alt="" />
                          : <span>{String(f.chat.nombre || f.chat.usuario || '?').charAt(0).toUpperCase()}</span>}
                        <span className={styles.bubbleDot} />
                        {f.noLeidos > 0 && (
                          <span className={styles.bubbleUnread}>{f.noLeidos > 9 ? '9+' : f.noLeidos}</span>
                        )}
                      </button>
                    );
                  })}
                  {restantes > 0 && siguiente && (
                    <button
                      type="button"
                      className={`${styles.bubbleBtn} ${styles.bubbleMore}`}
                      onClick={() => restaurar(siguiente.id)}
                      title={`${restantes}+`}
                    >
                      {restantes}+
                    </button>
                  )}
                </div>
              );
            })()}
          </div>,
          document.body
        );
      })()}

      {mounted && drag && !enPaginaChat && createPortal(
        <div className={`${styles.trash} ${drag.over ? styles.trashOn : ''}`} aria-hidden="true">
          <ion-icon name={drag.over ? 'trash' : 'trash-outline'} suppressHydrationWarning></ion-icon>
        </div>,
        document.body
      )}
    </ChatDockContext.Provider>
  );
}

export function useChatDock() {
  return useContext(ChatDockContext);
}

export default ChatDockProvider;
