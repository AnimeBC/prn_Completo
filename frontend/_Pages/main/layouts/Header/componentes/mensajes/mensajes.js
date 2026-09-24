'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from './mensajes.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';
import Compositor from '@/_Pages/main/Chat/componentes/compositor';
import { useChatDock } from '@/_Extras/ChatDock/ChatDockProvider.js';


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

function previewLlamada(texto, es) {
  const [, lt, lseg, lest] = texto.split('|');
  const video = lt === 'video';
  const seg = Math.max(0, parseInt(lseg, 10) || 0);
  const dur = seg >= 3600
    ? `${Math.floor(seg / 3600)} h`
    : seg >= 60 ? `${Math.floor(seg / 60)} min` : `${seg} s`;
  const tipoTxt = video ? (es ? 'videollamada' : 'video call') : (es ? 'llamada de voz' : 'voice call');
  return lest === 'finalizada' ? `${tipoTxt} · ${dur}` : `${tipoTxt} · ${es ? 'cancelada' : 'cancelled'}`;
}

function preview(chat, es) {
  const t = chat.ultimo_texto;
  if (typeof t === 'string' && t.startsWith('llamada|')) return previewLlamada(t, es);
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

  const [mounted, setMounted] = useState(false);
  const [stories, setStories] = useState([]);
  const [story, setStory] = useState(null);
  const [prog, setProg] = useState(0);
  const progRef = useRef(0);
  const pauseRef = useRef(false);
  const wrapRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

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
      chat: { id: c.id, nombre: c.nombre, avatar: c.avatar, miembros: c.miembros, activos: c.activos || 0 },
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

  // Siempre cargado (aunque el panel esté cerrado) para que el contador
  // del ícono se actualice en tiempo real.
  useEffect(() => { load(); }, [load]);

  // Historias (para mostrarlas y verlas desde el panel).
  const loadStories = useCallback(async () => {
    if (!authed || !userKey) { setStories([]); return; }
    const r = await apiComunidad.stories().catch(() => null);
    if (Array.isArray(r?.data)) setStories(r.data);
  }, [authed, userKey]);

  useEffect(() => { loadStories(); }, [loadStories]);

  // Realtime por Redis (SSE -> pikantepe:change): sin polling.
  useEffect(() => {
    if (!authed) return undefined;
    const onChange = (e) => {
      load();
      if (String(e?.detail?.type || '') === 'comunidad_story') loadStories();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [authed, load, loadStories]);

  // Agrupa las historias por usuario (varias del mismo = una tarjeta).
  const storyGroups = useMemo(() => {
    const map = new Map();
    for (const s of stories) {
      const k = s.user_key || s.usuario;
      if (!k) continue;
      if (!map.has(k)) map.set(k, { key: k, usuario: s.usuario, avatar: s.avatar, stories: [] });
      map.get(k).stories.push(s);
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.stories.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return arr;
  }, [stories]);

  function irStory(dir) {
    setStory((cur) => {
      if (!cur) return cur;
      const gp = storyGroups[cur.gi];
      let gi = cur.gi;
      let i = cur.i + dir;
      if (i < 0) {
        gi -= 1;
        if (gi < 0) return cur;
        i = (storyGroups[gi]?.stories.length || 1) - 1;
      } else if (!gp || i >= gp.stories.length) {
        gi += 1;
        if (gi >= storyGroups.length) return null;
        i = 0;
      }
      return { gi, i };
    });
  }

  // Progreso de la historia: 5s en imagen/texto; el video usa su tiempo.
  useEffect(() => {
    if (!story) { setProg(0); return undefined; }
    progRef.current = 0;
    pauseRef.current = false;
    setProg(0);
    const actual = storyGroups[story.gi]?.stories[story.i];
    if (actual?.id) apiComunidad.verStory(actual.id, userKey).catch(() => {});
    if (!actual || actual.tipo === 'video') return undefined;
    const iv = setInterval(() => {
      if (pauseRef.current) return;
      progRef.current += 50;
      const p = Math.min(100, (progRef.current / 5000) * 100);
      setProg(p);
      if (p >= 100) irStory(1);
    }, 50);
    return () => clearInterval(iv);
  }, [story?.gi, story?.i]);

  useEffect(() => {
    if (!story) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setStory(null);
      else if (e.key === 'ArrowRight') irStory(1);
      else if (e.key === 'ArrowLeft') irStory(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [story]);

  // Al abrir el panel, refresca al toque.
  useEffect(() => { if (open) load(); }, [open, load]);

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
    // Tanto amigos (DM) como grupos abren su ventana flotante global.
    // (El "visto" lo marca el propio chat cuando el input está enfocado.)
    setOpen(false);
    abrir(c.chat, c.tipo);
    setTimeout(load, 1200);
  }

  const initial = (user?.nombre || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={() => {
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
            setOpen(false);
            router.push('/chat');
            return;
          }
          setOpen((o) => !o);
        }}
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

          {(storyGroups.length > 0 || authed) && (
            <div className={styles.stories}>
              <div className={styles.storiesScroll}>
                <button
                  type="button"
                  className={styles.storyItem}
                  onClick={() => { setOpen(false); router.push('/comunidad'); }}
                  title={es ? 'Crear historia' : 'Create story'}
                >
                  <span className={styles.storyRingCreate}>
                    {user?.avatar
                      ? <img src={mediaUrl(user.avatar)} alt="" />
                      : <span className={styles.storyInitial}>{initial}</span>}
                    <span className={styles.storyPlus}><ion-icon name="add" suppressHydrationWarning></ion-icon></span>
                  </span>
                  <span className={styles.storyName}>{es ? 'Crear historia' : 'Create story'}</span>
                </button>
                {storyGroups.map((gp, gi) => (
                  <button key={gp.key} type="button" className={styles.storyItem} onClick={() => setStory({ gi, i: 0 })}>
                    <span className={styles.storyRing}>
                      {gp.avatar
                        ? <img src={mediaUrl(gp.avatar)} alt="" />
                        : <span className={styles.storyInitial}>{String(gp.usuario || '?').trim().charAt(0).toUpperCase()}</span>}
                    </span>
                    <span className={styles.storyName}>{gp.usuario}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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

      {mounted && story && createPortal((() => {
        const gp = storyGroups[story.gi];
        const actual = gp?.stories?.[story.i];
        if (!actual) return null;
        return (
          <div className={styles.storyViewer} role="dialog" aria-label={es ? 'Historia' : 'Story'}>
            <div className={styles.storyViewerCard}>
              <div className={styles.storyViewerProg}>
                {gp.stories.map((s, i) => (
                  <span key={s.id || i} className={styles.storyViewerSeg}>
                    <span
                      className={styles.storyViewerSegFill}
                      style={{ width: i < story.i ? '100%' : (i === story.i ? `${prog}%` : '0%') }}
                    />
                  </span>
                ))}
              </div>
              <div className={styles.storyViewerHead}>
                <span className={styles.storyViewerAvatar}>
                  {gp.avatar
                    ? <img src={mediaUrl(gp.avatar)} alt="" />
                    : String(gp.usuario || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className={styles.storyViewerName}>{gp.usuario}</span>
                <button type="button" className={styles.storyViewerX} onClick={() => setStory(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>
              <div className={styles.storyViewerBody}>
                {actual.tipo === 'video' ? (
                  <video
                    className={styles.storyViewerMedia}
                    src={mediaUrl(actual.media)}
                    autoPlay
                    playsInline
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.duration) setProg(Math.min(100, (v.currentTime / v.duration) * 100));
                    }}
                    onEnded={() => irStory(1)}
                  />
                ) : actual.media ? (
                  <img className={styles.storyViewerMedia} src={mediaUrl(actual.media)} alt="" />
                ) : (
                  <div className={styles.storyViewerText}>{actual.texto}</div>
                )}
                <button type="button" className={`${styles.storyNav} ${styles.storyNavL}`} onClick={() => irStory(-1)} aria-label="Anterior" />
                <button type="button" className={`${styles.storyNav} ${styles.storyNavR}`} onClick={() => irStory(1)} aria-label="Siguiente" />
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      <Compositor
        open={compOpen}
        onClose={() => setCompOpen(false)}
        userKey={userKey}
        onSent={() => load()}
      />

    </div>
  );
}
