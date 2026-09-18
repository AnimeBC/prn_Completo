'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './mensajes.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';
import Compositor from '@/_Pages/main/Chat/componentes/compositor';
import { useChatDock } from '@/_Extras/ChatDock/ChatDockProvider.js';
import Mantenimiento from '@/_Pages/main/Chat/componentes/mantenimiento';

const FILTROS = [
  { id: 'todos', es: 'Todos', en: 'All' },
  { id: 'noLeidos', es: 'No leídos', en: 'Unread' },
  { id: 'grupos', es: 'Grupos', en: 'Groups' },
];

function relTime(dateStr, es) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return es ? 'ahora' : 'now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} sem`;
  return new Date(dateStr).toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'short' });
}

function preview(chat, es) {
  const t = chat.ultimo_texto;
  if (t) return t;
  if (chat.ultimo_media) return es ? 'Archivo adjunto' : 'Attachment';
  if (chat.ultimo_tipo && chat.ultimo_tipo !== 'texto') return `[${chat.ultimo_tipo}]`;
  return es ? 'Sin mensajes todavía' : 'No messages yet';
}

export default function Mensajes() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed, user } = useAuth();
  const { abrir } = useChatDock();

  const [open, setOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [mantGrupo, setMantGrupo] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!authed || !userKey) { setChats([]); return; }
    setLoading(true);
    const [gr, dm] = await Promise.all([apiComunidad.chats(userKey), apiComunidad.dmChats(userKey)]);
    const g = (gr?.data || []).map((c) => ({
      key: `g:${c.id}`,
      tipo: 'grupo',
      id: c.id,
      nombre: c.nombre,
      avatar: c.avatar,
      no_leidos: c.no_leidos || 0,
      ultimo_texto: c.ultimo_texto,
      ultimo_tipo: c.ultimo_tipo,
      ultimo_media: c.ultimo_media,
      ultimo_user_key: c.ultimo_user_key,
      ultimo_creado: c.ultimo_creado,
      chat: { id: c.id, nombre: c.nombre, avatar: c.avatar, miembros: c.miembros },
    }));
    const d = (dm?.data || []).map((c) => {
      const nombre = c.otro_usuario || c.otro_nombre || 'Usuario';
      return {
        key: `d:${c.otro_key}`,
        tipo: 'dm',
        otro_key: c.otro_key,
        nombre,
        avatar: c.otro_avatar,
        no_leidos: c.no_leidos || 0,
        ultimo_texto: c.ultimo_texto,
        ultimo_tipo: c.ultimo_tipo,
        ultimo_user_key: c.ultimo_user_key,
        ultimo_creado: c.ultimo_creado,
        chat: { user_key: c.otro_key, usuario: nombre, avatar: c.otro_avatar },
      };
    });
    setChats([...g, ...d].sort((a, b) => new Date(b.ultimo_creado || 0) - new Date(a.ultimo_creado || 0)));
    setLoading(false);
  }, [authed, userKey]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!open || !authed) return undefined;
    const iv = setInterval(load, 20000);
    const onChange = () => load();
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      clearInterval(iv);
      window.removeEventListener('pikantepe:change', onChange);
    };
  }, [open, authed, load]);

  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const noLeidos = chats.reduce((acc, c) => acc + (c.no_leidos > 0 ? 1 : 0), 0);

  const visibles = chats.filter((c) => {
    if (filtro === 'noLeidos' && !(c.no_leidos > 0)) return false;
    if (filtro === 'grupos' && c.tipo !== 'grupo') return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!String(c.nombre || '').toLowerCase().includes(t)) return false;
    }
    return true;
  });

  function abrirChat(c) {
    if (c.tipo === 'grupo') { setMantGrupo(true); return; }
    // Los amigos abren su ventana flotante global.
    abrir(c.chat, c.tipo);
    apiComunidad.dmLeido(c.otro_key, userKey);
  }

  const initial = (user?.nombre || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label={es ? 'Mensajes' : 'Messages'}
        aria-expanded={open}
      >
        <svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true" className={styles.messengerIcon}>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M.5 8a7.5 7.5 0 1 1 4.006 6.638.341.341 0 0 0-.236-.041l-2.193.534A1 1 0 0 1 .87 13.923l.534-2.193a.341.341 0 0 0-.04-.236A7.47 7.47 0 0 1 .5 8zm11.389-.907a.56.56 0 0 0-.79-.78L9.25 7.75 7.294 6.327a1 1 0 0 0-1.386.205L4.111 8.906a.56.56 0 0 0 .791.781L6.75 8.25l1.957 1.423a1 1 0 0 0 1.385-.205l1.797-2.375z"
          />
        </svg>
        {noLeidos > 0 && <span className={styles.badge}>{noLeidos > 99 ? '99+' : noLeidos}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label={es ? 'Chats' : 'Chats'}>
          <div className={styles.head}>
            <h3 className={styles.title}>{es ? 'Chats' : 'Chats'}</h3>
            <div className={styles.headActions}>
              <button type="button" className={styles.iconBtn} title={es ? 'Opciones' : 'Options'}>
                <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title={es ? 'Pantalla completa' : 'Full screen'}
                onClick={() => { setOpen(false); router.push('/chat'); }}
              >
                <ion-icon name="expand-outline" suppressHydrationWarning></ion-icon>
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title={es ? 'Nuevo mensaje' : 'New message'}
                onClick={() => { setOpen(false); if (authed) setCompOpen(true); else router.push('/perfil'); }}
              >
                <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
          </div>

          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={es ? 'Buscar en Messenger' : 'Search Messenger'}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.filters}>
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`${styles.chip} ${filtro === f.id ? styles.chipActive : ''}`}
                onClick={() => setFiltro(f.id)}
              >
                {es ? f.es : f.en}
              </button>
            ))}
            <button type="button" className={`${styles.chip} ${styles.chipGhost}`} title={es ? 'Más filtros' : 'More filters'}>
              <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <div className={styles.list}>
            {!authed ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}><ion-icon name="chatbubbles-outline" suppressHydrationWarning></ion-icon></span>
                <p className={styles.emptyText}>{es ? 'Inicia sesión para ver tus chats.' : 'Sign in to see your chats.'}</p>
                <button type="button" className={styles.emptyBtn} onClick={() => { setOpen(false); router.push('/perfil'); }}>
                  {es ? 'Iniciar sesión' : 'Sign in'}
                </button>
              </div>
            ) : loading && chats.length === 0 ? (
              <p className={styles.muted}>{es ? 'Cargando chats…' : 'Loading chats…'}</p>
            ) : visibles.length === 0 ? (
              <p className={styles.muted}>{es ? 'No hay conversaciones por aquí.' : 'No conversations here.'}</p>
            ) : (
              visibles.map((c) => {
                const yo = c.ultimo_user_key && String(c.ultimo_user_key) === String(userKey);
                return (
                  <button key={c.key} type="button" className={styles.item} onClick={() => abrirChat(c)}>
                    {c.avatar ? (
                      <img className={styles.avatar} src={mediaUrl(c.avatar)} alt="" loading="lazy" />
                    ) : c.ultimo_user_key && !yo ? (
                      <span className={styles.avatarFallback}>{(c.ultimo_usuario || c.nombre || '?').trim().charAt(0).toUpperCase()}</span>
                    ) : (
                      <span className={styles.avatarFallback}>{initial}</span>
                    )}
                    <span className={styles.body}>
                      <span className={`${styles.name} ${c.no_leidos > 0 ? styles.nameNew : ''}`}>{c.nombre}</span>
                      <span className={`${styles.preview} ${c.no_leidos > 0 ? styles.previewNew : ''}`}>
                        {yo ? `${es ? 'Tú' : 'You'}: ` : ''}{preview(c, es)}
                        <span className={styles.time}> · {relTime(c.ultimo_creado, es)}</span>
                      </span>
                    </span>
                    {c.no_leidos > 0 && <span className={styles.dot} />}
                  </button>
                );
              })
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.footerLink} onClick={() => { setOpen(false); router.push('/chat'); }}>
              {es ? 'Ver todo en Messenger' : 'See all in Messenger'}
            </button>
          </div>
        </div>
      )}

      <Compositor
        open={compOpen}
        onClose={() => setCompOpen(false)}
        userKey={userKey}
        onSent={() => load()}
      />

      <Mantenimiento open={mantGrupo} onClose={() => setMantGrupo(false)} />
    </div>
  );
}
