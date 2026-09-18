'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './chatDock.module.css';
import ChatFlotante from '@/_Pages/main/Chat/componentes/ChatFlotante';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';

const KEY = 'pkp_chat_dock';

const ChatDockContext = createContext({ abrir: () => {}, cerrar: () => {}, flotantes: [] });

/** Clave única de una conversación en el dock. */
function claveDock(tipo, chat) {
  return tipo === 'dm' ? `dm:${chat.user_key}` : String(chat.id);
}

/** Dock global de chats: las ventanas/burbujas se mantienen en todo el sitio. */
export function ChatDockProvider({ children }) {
  const { userKey, authed } = useAuth();
  const [flotantes, setFlotantes] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [maxAbiertos, setMaxAbiertos] = useState(3);
  const [maxBurbujas, setMaxBurbujas] = useState(5);
  const prevKeyRef = useRef(null);
  const loadedKeyRef = useRef(null);
  const skipSaveRef = useRef(false);
  const storageKey = authed && userKey ? `${KEY}:${userKey}` : null;

  useEffect(() => { setMounted(true); }, []);

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
    setFlotantes((prev) => (
      prev.some((f) => String(f.id) === id)
        ? prev.map((f) => (String(f.id) === id ? { ...f, tipo, chat, minimizado: false } : f))
        : [...prev, { id, tipo, chat, minimizado: false }]
    ));
  }, []);

  const cerrar = useCallback((id) => {
    setFlotantes((prev) => prev.filter((f) => String(f.id) !== String(id)));
  }, []);

  const minimizar = useCallback((id) => {
    setFlotantes((prev) => prev.map((f) => (String(f.id) === String(id) ? { ...f, minimizado: true } : f)));
  }, []);

  const restaurar = useCallback((id) => {
    setFlotantes((prev) => {
      const item = prev.find((f) => String(f.id) === String(id));
      if (!item) return prev;
      const rest = prev.filter((f) => String(f.id) !== String(id));
      // Se mueve al final para que quede como ventana visible (la más reciente).
      return [...rest, { ...item, minimizado: false }];
    });
  }, []);

  return (
    <ChatDockContext.Provider value={{ abrir, cerrar, minimizar, restaurar, flotantes }}>
      {children}

      {mounted && authed && flotantes.length > 0 && (() => {
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
                  onClose={() => cerrar(f.id)}
                  onMinimize={() => minimizar(f.id)}
                />
              ))}
            </div>
            {burbujas.length > 0 && (() => {
              const visiblesB = burbujas.slice(0, maxBurbujas);
              const restantes = burbujas.length - visiblesB.length;
              const siguiente = burbujas[visiblesB.length];
              return (
                <div className={styles.dockBubbles}>
                  {visiblesB.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={styles.bubbleBtn}
                      onClick={() => restaurar(f.id)}
                      title={f.chat.nombre || f.chat.usuario}
                    >
                      {f.chat.avatar
                        ? <img src={mediaUrl(f.chat.avatar)} alt="" />
                        : <span>{String(f.chat.nombre || f.chat.usuario || '?').charAt(0).toUpperCase()}</span>}
                      <span className={styles.bubbleDot} />
                    </button>
                  ))}
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
    </ChatDockContext.Provider>
  );
}

export function useChatDock() {
  return useContext(ChatDockContext);
}

export default ChatDockProvider;
