'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './chat.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';
import Compositor from '@/_Pages/main/Chat/componentes/compositor';
import ChatFlotante from '@/_Pages/main/Chat/componentes/ChatFlotante';

const FILTROS = [
  { id: 'todos', es: 'Todos', en: 'All' },
  { id: 'noLeidos', es: 'No leídos', en: 'Unread' },
];

function previewLlamada(texto, es) {
  // Formato: "llamada|<tipo>|<seg>|<estado>|<autorKey>"
  const [, lt, lseg, lest] = texto.split('|');
  const video = lt === 'video';
  const seg = Math.max(0, parseInt(lseg, 10) || 0);
  const dur = seg >= 3600
    ? `${Math.floor(seg / 3600)} h`
    : seg >= 60 ? `${Math.floor(seg / 60)} min` : `${seg} s`;
  const tipoTxt = video ? (es ? 'videollamada' : 'video call') : (es ? 'llamada de voz' : 'voice call');
  return lest === 'finalizada' ? `${tipoTxt} · ${dur}` : `${tipoTxt} · ${es ? 'cancelada' : 'cancelled'}`;
}

function preview(c, es) {
  if (typeof c.ultimo_texto === 'string' && c.ultimo_texto.startsWith('llamada|')) {
    return previewLlamada(c.ultimo_texto, es);
  }
  if (c.ultimo_texto) return c.ultimo_texto;
  if (c.ultimo_tipo && c.ultimo_tipo !== 'texto') return `[${c.ultimo_tipo}]`;
  return es ? 'Sin mensajes todavía' : 'No messages yet';
}

export default function ChatClient() {
  const router = useRouter();
  // Reacciona a cambios de ?conv= / ?dm= aunque /chat ya este montado
  // (p. ej. al clicar una notificacion de respuesta/reaccion).
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [grupos, setGrupos] = useState([]);
  const [dms, setDms] = useState([]);
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [compOpen, setCompOpen] = useState(false);
  const [tema, setTema] = useState({ gradient: '', color: '', emoji: '' });

  // El diseño del chat activo se aplica a TODA la interfaz de /chat.
  const onTema = useCallback((t) => {
    setTema((prev) => (
      prev.gradient === t.gradient && prev.color === t.color && prev.emoji === t.emoji ? prev : t
    ));
  }, []);

  const cargar = useCallback(async () => {
    if (!authed || !userKey) { setGrupos([]); setDms([]); setLoading(false); return; }
    const [g, d] = await Promise.all([apiComunidad.chats(userKey), apiComunidad.dmChats(userKey)]);
    setGrupos(g?.data || []);
    setDms(d?.data || []);
    setLoading(false);
  }, [authed, userKey]);

  useEffect(() => { cargar(); }, [cargar]);

  // ?conv=<id> (grupo) o ?dm=<userKey> (amigo). Se re-ejecuta si cambia la URL.
  useEffect(() => {
    const dm = searchParams?.get('dm');
    const conv = searchParams?.get('conv');
    if (dm) setSel(`d:${dm}`);
    else if (conv) setSel(`g:${conv}`);
  }, [searchParams]);

  // Sin conversación activa, se quita el tema de la interfaz.
  useEffect(() => {
    if (!sel) setTema({ gradient: '', color: '', emoji: '' });
  }, [sel]);

  // Selecciona una conversación y refleja la URL (/chat?dm=<key> o /chat?conv=<id>).
  function seleccionar(key) {
    setSel(key);
    if (typeof window === 'undefined') return;
    const target = key
      ? (key.startsWith('d:')
        ? `/chat?dm=${encodeURIComponent(key.slice(2))}`
        : `/chat?conv=${encodeURIComponent(key.slice(2))}`)
      : '/chat';
    if (`${window.location.pathname}${window.location.search}` !== target) {
      router.replace(target, { scroll: false });
    }
  }

  useEffect(() => {
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (t === 'comunidad_mensaje' || t === 'comunidad_reaccion' || t === 'comunidad_dm' || t === 'notificacion') cargar();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargar]);

  // El header (botón atrás) avisa para cerrar el chat.
  useEffect(() => {
    const onBack = () => seleccionar('');
    window.addEventListener('pkp:chatback', onBack);
    return () => window.removeEventListener('pkp:chatback', onBack);
  }, []);

  const convos = useMemo(() => {
    const g = grupos.map((c) => ({
      key: `g:${c.slug || c.id}`,
      tipo: 'grupo',
      nombre: c.nombre,
      avatar: c.avatar,
      no_leidos: c.no_leidos || 0,
      ultimo_texto: c.ultimo_texto,
      ultimo_tipo: c.ultimo_tipo,
      ultimo_user_key: c.ultimo_user_key,
      ultimo_creado: c.ultimo_creado,
      chat: { id: c.id, slug: c.slug || null, nombre: c.nombre, avatar: c.avatar, miembros: c.miembros },
    }));
    const d = dms.map((c) => {
      const nombre = c.otro_usuario || c.otro_nombre || 'Usuario';
      return {
        key: `d:${c.otro_key}`,
        tipo: 'dm',
        nombre,
        avatar: c.otro_avatar,
        no_leidos: c.no_leidos || 0,
        ultimo_texto: c.ultimo_texto,
        ultimo_tipo: c.ultimo_tipo,
        ultimo_user_key: c.ultimo_user_key,
        ultimo_creado: c.ultimo_creado,
        canal_slug: c.otro_canal_slug || null,
        chat: { user_key: c.otro_key, usuario: nombre, avatar: c.otro_avatar, canal_slug: c.otro_canal_slug || null },
      };
    });
    return [...g, ...d].sort((a, b) => new Date(b.ultimo_creado || 0) - new Date(a.ultimo_creado || 0));
  }, [grupos, dms]);

  const activa = convos.find((c) => {
    if (c.key === sel) return true;
    // Compatibilidad: enlaces antiguos ?conv=<id> -> resolver por id.
    if (sel.startsWith('g:') && c.tipo === 'grupo') {
      const ref = sel.slice(2);
      return String(c.chat?.id) === String(ref) || String(c.chat?.slug) === String(ref);
    }
    return false;
  }) || null;

  // Avisa si hay un chat abierto + sus datos (para el header y la barra inferior).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const info = activa ? {
      open: true,
      tipo: activa.tipo,
      user_key: activa.tipo === 'dm' ? (activa.chat?.user_key || null) : null,
      grupo_id: activa.tipo === 'grupo' ? (activa.chat?.id || null) : null,
      grupo_slug: activa.tipo === 'grupo' ? (activa.chat?.slug || null) : null,
      nombre: activa.nombre || '',
      avatar: activa.avatar || null,
      canal_slug: activa.canal_slug || null,
    } : { open: false };
    window.__pkpChatOpen = !!activa;
    window.__pkpChatInfo = info;
    window.dispatchEvent(new CustomEvent('pkp:chatopen', { detail: info }));
  }, [activa]);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    window.__pkpChatOpen = false;
    window.__pkpChatInfo = { open: false };
    window.dispatchEvent(new CustomEvent('pkp:chatopen', { detail: { open: false } }));
  }, []);

  const visibles = convos.filter((c) => {
    if (filtro === 'noLeidos' && !(c.no_leidos > 0)) return false;
    if (q.trim() && !String(c.nombre || '').toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const themed = !!(tema.gradient || tema.color);

  if (!authed) {
    return (
      <main className={styles.main}>
        <div className={styles.loginBox}>
          <span className={styles.loginIcon}><ion-icon name="chatbubbles-outline" suppressHydrationWarning></ion-icon></span>
          <h2 className={styles.loginTitle}>{es ? 'Tus chats' : 'Your chats'}</h2>
          <p className={styles.loginText}>{es ? 'Inicia sesión para ver y enviar mensajes.' : 'Sign in to view and send messages.'}</p>
          <button type="button" className={styles.loginBtn} onClick={() => router.push('/perfil')}>
            {es ? 'Iniciar sesión' : 'Sign in'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div
        className={`${styles.panel} ${themed ? styles.panelThemed : ''}`}
        style={themed ? { background: tema.gradient || tema.color } : undefined}
      >
        {/* ===== Lista de chats ===== */}
        <aside className={`${styles.sidebar} ${sel ? styles.sidebarHideMobile : ''}`}>
          <div className={styles.sideHead}>
            <h2 className={styles.sideTitle}>Chats</h2>
            <button type="button" className={styles.sideIcon} title={es ? 'Nuevo mensaje' : 'New message'} onClick={() => setCompOpen(true)}>
              <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <div className={styles.searchBox}>
            <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
            <input
              className={styles.searchInput}
              placeholder={es ? 'Buscar en Messenger' : 'Search Messenger'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className={styles.filters}>
            {FILTROS.map((f) => (
              <button key={f.id} type="button" className={`${styles.chip} ${filtro === f.id ? styles.chipActive : ''}`} onClick={() => setFiltro(f.id)}>
                {es ? f.es : f.en}
              </button>
            ))}
          </div>

          <div className={styles.convList}>
            {loading ? (
              <p className={styles.muted}>{es ? 'Cargando…' : 'Loading…'}</p>
            ) : visibles.length === 0 ? (
              <p className={styles.muted}>{es ? 'No hay conversaciones.' : 'No conversations.'}</p>
            ) : visibles.map((c) => {
              const yo = c.ultimo_user_key && String(c.ultimo_user_key) === String(userKey);
              return (
                <button key={c.key} type="button" className={`${styles.conv} ${sel === c.key ? styles.convActive : ''}`} onClick={() => seleccionar(c.key)}>
                  {c.avatar
                    ? <img className={styles.convAvatar} src={mediaUrl(c.avatar)} alt="" loading="lazy" />
                    : <span className={styles.convAvatarFallback}>{(c.nombre || '?').charAt(0).toUpperCase()}</span>}
                  <span className={styles.convBody}>
                    <span className={`${styles.convName} ${c.no_leidos > 0 ? styles.convNameNew : ''}`}>{c.nombre}</span>
                    <span className={`${styles.convPreview} ${c.no_leidos > 0 ? styles.convPreviewNew : ''}`}>
                      {yo ? `${es ? 'Tú' : 'You'}: ` : ''}{preview(c, es)}
                    </span>
                  </span>
                  {c.no_leidos > 0 && <span className={styles.dot} />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ===== Conversación (reutiliza el chat flotante en modo inline) ===== */}
        <section className={`${styles.chatArea} ${!sel ? styles.chatAreaEmpty : ''}`}>
          {!sel || !activa ? (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}><ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon></span>
              <p className={styles.placeholderText}>{es ? 'Elige una conversación para empezar.' : 'Pick a conversation to start.'}</p>
              <button type="button" className={styles.loginBtn} onClick={() => setCompOpen(true)}>
                {es ? 'Redactar mensaje' : 'New message'}
              </button>
            </div>
          ) : (
            <ChatFlotante
              key={activa.key}
              inline
              tipo={activa.tipo}
              chat={activa.chat}
              userKey={userKey}
              onBack={() => seleccionar('')}
              onTema={onTema}
            />
          )}
        </section>
      </div>

      <Compositor
        open={compOpen}
        onClose={() => setCompOpen(false)}
        userKey={userKey}
        onSent={() => cargar()}
      />
    </main>
  );
}
