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

// Eventos de Redis que NO cambian la lista de chats (posts, historias,
// solicitudes...): no merece recargar por ellos.
const EVENTOS_QUE_NO_APLICAN = [
  'comunidad_post', 'comunidad_comment', 'comunidad_post_like',
  'comunidad_post_share', 'comunidad_post_save', 'comunidad_post_pin',
  'comunidad_post_vote', 'comunidad_post_del', 'comunidad_story',
  'comunidad_story_reaccion', 'comunidad_solicitud', 'comunidad_presencia',
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
  const selRef = useRef('');
  selRef.current = sel;
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [compOpen, setCompOpen] = useState(false);
  const [tema, setTema] = useState({ gradient: '', color: '', emoji: '' });
  // Lista estilo Facebook: archivar, fijar (máx 5), silenciar, menú de 3 puntos.
  const [archivadosAbiertos, setArchivadosAbiertos] = useState(false);
  const [menuConv, setMenuConv] = useState(null); // { key, top, left }
  // Modal de aviso/confirmación de las acciones del menú:
  // { tipo: 'confirmar'|'silenciado', c, accion: 'bloquear'|'eliminar' }
  const [dlg, setDlg] = useState(null);
  const [msg, setMsg] = useState('');

  // El menú de 3 puntos se cierra al hacer clic fuera.
  useEffect(() => {
    if (!menuConv) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (t.closest && (t.closest('[data-conv-menu]') || t.closest('[data-conv-dots]'))) return;
      setMenuConv(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuConv]);

  // Mensajes de estado (ej. "Máximo 5 chats fijados") se ocultan solos.
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  // Cache de grupos silenciados para que RealtimeProvider no suene en ellos.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ids = grupos.filter((g) => g.silenciado).map((g) => String(g.id));
      window.localStorage.setItem('pkp_grupos_silenciados', JSON.stringify(ids));
    } catch { /* noop */ }
  }, [grupos]);

  // El diseño del chat activo se aplica a TODA la interfaz de /chat.
  const onTema = useCallback((t) => {
    setTema((prev) => (
      prev.gradient === t.gradient && prev.color === t.color && prev.emoji === t.emoji ? prev : t
    ));
  }, []);

  const cargar = useCallback(async () => {
    if (!authed || !userKey) { setGrupos([]); setDms([]); setLoading(false); return; }
    let g = null;
    let d = null;
    // Reintenta si el servidor no responde (p. ej. reiniciando): evita que
    // la lista se quede vacía hasta el próximo evento SSE.
    for (let intento = 0; intento < 3 && (!g?.data || !d?.data); intento += 1) {
      if (intento) await new Promise((res) => { setTimeout(res, 1500 * intento); });
      [g, d] = await Promise.all([apiComunidad.chats(userKey), apiComunidad.dmChats(userKey)]);
    }
    setGrupos(g?.data || []);
    const nueva = d?.data || [];
    setDms((prev) => {
      // Conserva la conversación virtual de ?dm= (aún sin mensajes en el
      // servidor) mientras esté seleccionada: si no, cualquier refresco la
      // borraría de la lista y la vista se rompería.
      const key = selRef.current;
      if (key && key.startsWith('d:') && dmVirtualRef.current === key.slice(2)
        && !nueva.some((c) => String(c.otro_key) === String(key.slice(2)))) {
        const virtual = prev.find((x) => String(x.otro_key) === String(key.slice(2)));
        if (virtual) return [virtual, ...nueva];
      }
      return nueva;
    });
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

  // ?dm=<key> de alguien con quien AÚN no existe conversación (p. ej. el
  // botón "Mensaje" de un canal sin chats previos): se agrega una entrada
  // virtual con sus datos para que el chat abra de frente y no muestre
  // "Elige una conversación".
  const dmVirtualRef = useRef(null);
  useEffect(() => {
    if (!authed || !userKey) return undefined;
    if (!sel || !sel.startsWith('d:')) return undefined;
    const key = sel.slice(2);
    if (dms.some((c) => String(c.otro_key) === String(key))) return undefined;
    if (dmVirtualRef.current === key) return undefined;
    dmVirtualRef.current = key;
    let alive = true;
    apiComunidad.usuario(key)
      .catch(() => null)
      .then((r) => {
        if (!alive) return;
        if (!r || r.error) { dmVirtualRef.current = null; return; } // usuario no existe
        setDms((prev) => (prev.some((c) => String(c.otro_key) === String(key))
          ? prev
          : [{
              otro_key: key,
              otro_usuario: r.nombre || r.usuario || key,
              otro_nombre: r.nombre || r.usuario || key,
              otro_avatar: r.avatar || null,
              no_leidos: 0,
              ultimo_texto: null,
              ultimo_creado: new Date().toISOString(),
            }, ...prev]));
      });
    return () => { alive = false; };
  }, [authed, userKey, sel, dms]);

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

  // Tiempo real (Redis -> SSE): CUALQUIER cambio que afecte la lista de
  // chats la refresca al instante: mensajes, fijados, archivados,
  // silencios, bloqueos, eliminaciones, uniones, ediciones de grupo...
  // (menos presencia: la lista no muestra si alguien está en línea).
  const ultimoRefrescoRef = useRef(0);
  const refrescoTimerRef = useRef(null);
  useEffect(() => {
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (t === 'notificacion') { cargar(); return; }
      if (!t.startsWith('comunidad_')) return;
      // Solo recarga por lo que cambia la lista de chats (mensajes, estados,
      // bloqueos, silencios, eliminaciones, uniones, ediciones...).
      if (EVENTOS_QUE_NO_APLICAN.includes(t)) return;
      // Cambios críticos de la UI (leídos, estados, bajas, bloqueos):
      // refresco INMEDIATO, sin esperar al throttle.
      if (t === 'comunidad_leido' || t === 'comunidad_chat_estado'
        || t === 'comunidad_dm_oculto' || t === 'comunidad_join'
        || t === 'comunidad_bloqueo' || t === 'comunidad_silencio') {
        if (refrescoTimerRef.current) clearTimeout(refrescoTimerRef.current);
        ultimoRefrescoRef.current = Date.now();
        cargar();
        return;
      }
      // Throttle corto (350 ms) con eco: agrupa ráfagas de mensajes sin
      // perder el último evento y sin demora perceptible.
      const ahora = Date.now();
      if (ahora - ultimoRefrescoRef.current >= 350) {
        if (refrescoTimerRef.current) clearTimeout(refrescoTimerRef.current);
        ultimoRefrescoRef.current = ahora;
        cargar();
      } else {
        if (refrescoTimerRef.current) clearTimeout(refrescoTimerRef.current);
        refrescoTimerRef.current = setTimeout(() => {
          ultimoRefrescoRef.current = Date.now();
          cargar();
        }, 350);
      }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      if (refrescoTimerRef.current) clearTimeout(refrescoTimerRef.current);
      window.removeEventListener('pikantepe:change', onChange);
    };
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
        archivado: !!c.archivado,
        fijado: !!c.fijado,
        silenciado: !!c.silenciado,
        soyDueno: !!c.soy_dueno,
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
        archivado: !!c.archivado,
        fijado: !!c.fijado,
        silenciado: !!c.silenciado,
        bloqueado: !!c.bloqueado,
        bloqueoMio: !!c.bloqueo_mio,
        canal_slug: c.otro_canal_slug || null,
        chat: { user_key: c.otro_key, usuario: nombre, avatar: c.otro_avatar, canal_slug: c.otro_canal_slug || null },
      };
    });
    // Fijados primero; después por último mensaje.
    return [...g, ...d].sort((a, b) => {
      const pa = a.fijado ? 1 : 0;
      const pb = b.fijado ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.ultimo_creado || 0) - new Date(a.ultimo_creado || 0);
    });
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

  // ---- Acciones del menú de 3 puntos (archivar/fijar/silenciar/bloquear) ----
  function fijadosCount(excluirKey) {
    return convos.filter((c) => c.fijado && c.key !== excluirKey).length;
  }

  async function cambiarEstado(c, campos) {
    setMsg('');
    const ref = c.tipo === 'dm' ? String(c.chat.user_key) : String(c.chat.id);
    const r = await apiComunidad.chatEstado({ userKey, tipo: c.tipo, ref, ...campos });
    if (r?.error) { setMsg(r.error); return; }
    cargar();
  }

  function abrirMenuConv(e, c) {
    e.stopPropagation();
    if (menuConv && menuConv.key === c.key) { setMenuConv(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const top = Math.min(r.bottom + 6, Math.max(60, window.innerHeight - 330));
    const left = Math.max(8, r.right - 204);
    setMenuConv({ key: c.key, top, left });
  }

  function onFijar(c) {
    setMenuConv(null);
    if (!c.fijado && fijadosCount(c.key) >= 5) {
      setMsg(es ? 'Máximo 5 chats fijados.' : 'Maximum 5 pinned chats.');
      return;
    }
    cambiarEstado(c, { fijado: !c.fijado });
  }

  function onArchivar(c) {
    setMenuConv(null);
    const archivar = !c.archivado;
    cambiarEstado(c, { archivado: archivar });
    // Al archivar la conversación activa, se deselecciona.
    if (archivar && sel === c.key) seleccionar('');
  }

  async function onSilenciar(c) {
    setMenuConv(null);
    setMsg('');
    if (c.tipo === 'dm') {
      const r = await apiComunidad.dmSilencio(c.chat.user_key, userKey);
      if (r?.error) { setMsg(r.error); return; }
    } else {
      const r = await apiComunidad.chatEstado({
        userKey, tipo: 'grupo', ref: String(c.chat.id), silenciado: !c.silenciado,
      });
      if (r?.error) { setMsg(r.error); return; }
    }
    cargar();
    // Modal de aviso: se silenció (solo al silenciar, no al reactivar).
    if (!c.silenciado) setDlg({ tipo: 'silenciado', c });
  }

  // Bloquear / eliminar grupo: aviso + confirmación en un modal.
  function pedirConfirm(c, accion) {
    setMenuConv(null);
    setDlg({ tipo: 'confirmar', c, accion });
  }

  async function ejecutarConfirm() {
    if (!dlg || dlg.tipo !== 'confirmar') { setDlg(null); return; }
    const { c, accion } = dlg;
    setDlg(null);
    setMsg('');
    if (accion === 'bloquear') {
      const r = await apiComunidad.bloquear(userKey, c.chat.user_key, 'bloquear');
      if (r?.error) { setMsg(r.error); return; }
      setMsg(es ? `Bloqueaste a ${c.nombre}.` : `You blocked ${c.nombre}.`);
    } else if (accion === 'eliminar') {
      const r = await apiComunidad.eliminarGrupo(c.chat.id, userKey);
      if (r?.error) { setMsg(r.error); return; }
      setMsg(es ? 'Grupo eliminado.' : 'Group deleted.');
      if (sel === c.key) seleccionar('');
    } else if (accion === 'ocultar') {
      // "Eliminar chat": solo de la cuenta del usuario (no borra nada).
      const r = c.tipo === 'dm'
        ? await apiComunidad.dmEliminarChat(c.chat.user_key, userKey)
        : await apiComunidad.chatEstado({ userKey, tipo: 'grupo', ref: String(c.chat.id), oculto: true });
      if (r?.error) { setMsg(r.error); return; }
      if (sel === c.key) seleccionar('');
      setMsg(es ? 'Chat eliminado solo en tu cuenta.' : 'Chat removed from your account.');
    } else if (accion === 'desbloquear') {
      const r = await apiComunidad.bloquear(userKey, c.chat.user_key, 'desbloquear');
      if (r?.error) { setMsg(r.error); return; }
      setMsg(es ? `Desbloqueaste a ${c.nombre}.` : `You unblocked ${c.nombre}.`);
    }
    cargar();
  }

  const visibles = convos.filter((c) => {
    // Archivados: solo en su propia vista (estilo Facebook).
    if (archivadosAbiertos !== !!c.archivado) return false;
    if (filtro === 'noLeidos' && !(c.no_leidos > 0)) return false;
    if (q.trim() && !String(c.nombre || '').toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const hayArchivados = convos.some((c) => c.archivado);
  const nArchivados = convos.filter((c) => c.archivado).length;

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

          {/* Archivados (estilo WhatsApp): fila completa con su regreso. */}
          {!archivadosAbiertos && hayArchivados && (
            <button type="button" className={styles.archBox} onClick={() => setArchivadosAbiertos(true)}>
              <span className={styles.archIcon}>
                <ion-icon name="archive" suppressHydrationWarning></ion-icon>
              </span>
              <span className={styles.archText}>
                <b>{es ? 'Chats archivados' : 'Archived chats'}</b>
                <small>{nArchivados} {es ? (nArchivados === 1 ? 'conversación' : 'conversaciones') : 'conversations'}</small>
              </span>
              <ion-icon className={styles.archChev} name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
            </button>
          )}
          {archivadosAbiertos && (
            <button type="button" className={`${styles.archBox} ${styles.archBoxBack}`} onClick={() => setArchivadosAbiertos(false)}>
              <span className={styles.archIconBack}>
                <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
              </span>
              <span className={styles.archText}>
                <b>{es ? 'Volver a los chats' : 'Back to chats'}</b>
                <small>{es ? 'Viendo archivados' : 'Showing archived'}</small>
              </span>
            </button>
          )}

          {msg && <p className={styles.listaMsg}>{msg}</p>}

          <div className={styles.convList}>
            {loading ? (
              <p className={styles.muted}>{es ? 'Cargando…' : 'Loading…'}</p>
            ) : visibles.length === 0 ? (
              <p className={styles.muted}>{es ? 'No hay conversaciones.' : 'No conversations.'}</p>
            ) : visibles.map((c) => {
              const yo = c.ultimo_user_key && String(c.ultimo_user_key) === String(userKey);
              return (
                <div key={c.key} className={`${styles.convWrap} ${archivadosAbiertos ? styles.convArchivada : ''}`}>
                  <div
                    className={`${styles.conv} ${sel === c.key ? styles.convActive : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => seleccionar(c.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionar(c.key); } }}
                  >
                    {c.avatar
                      ? <img className={styles.convAvatar} src={mediaUrl(c.avatar)} alt="" loading="lazy" />
                      : <span className={styles.convAvatarFallback}>{(c.nombre || '?').charAt(0).toUpperCase()}</span>}
                    <span className={styles.convBody}>
                      <span className={`${styles.convName} ${c.no_leidos > 0 ? styles.convNameNew : ''}`}>
                        {c.nombre}
                        {archivadosAbiertos && <ion-icon className={styles.convArch} name="archive" suppressHydrationWarning></ion-icon>}
                        {c.fijado && <ion-icon className={styles.convPin} name="bookmark" suppressHydrationWarning></ion-icon>}
                        {c.silenciado && (
                          <ion-icon className={styles.convMuted} name="volume-mute-outline" title={es ? 'Silenciado' : 'Muted'} suppressHydrationWarning></ion-icon>
                        )}
                        {c.bloqueado && (
                          <ion-icon className={styles.convBlocked} name="close-circle" title={es ? 'Bloqueado' : 'Blocked'} suppressHydrationWarning></ion-icon>
                        )}
                      </span>
                      <span className={`${styles.convPreview} ${c.no_leidos > 0 ? styles.convPreviewNew : ''}`}>
                        {yo ? `${es ? 'Tú' : 'You'}: ` : ''}{preview(c, es)}
                      </span>
                    </span>
                    {c.no_leidos > 0 && <span className={styles.dot} />}

                    {/* 3 puntos DENTRO de la fila (no empuja las medidas). */}
                    <button
                      type="button"
                      className={styles.convDots}
                      data-conv-dots=""
                      title={es ? 'Opciones' : 'Options'}
                      aria-label={es ? 'Opciones' : 'Options'}
                      onClick={(e) => { e.stopPropagation(); abrirMenuConv(e, c); }}
                    >
                      <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>

                  {menuConv && menuConv.key === c.key && (
                    <div
                      className={styles.convMenu}
                      data-conv-menu=""
                      style={{ top: menuConv.top, left: menuConv.left }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" className={styles.convMenuItem} onClick={() => onFijar(c)}>
                        <ion-icon name={c.fijado ? 'bookmark-outline' : 'bookmark'} suppressHydrationWarning></ion-icon>
                        {c.fijado ? (es ? 'Desfijar' : 'Unpin') : (es ? 'Fijar chat' : 'Pin chat')}
                      </button>
                      <button type="button" className={styles.convMenuItem} onClick={() => onArchivar(c)}>
                        <ion-icon name={c.archivado ? 'arrow-undo-outline' : 'archive-outline'} suppressHydrationWarning></ion-icon>
                        {c.archivado ? (es ? 'Desarchivar' : 'Unarchive') : (es ? 'Archivar' : 'Archive')}
                      </button>
                      <button type="button" className={styles.convMenuItem} onClick={() => onSilenciar(c)}>
                        <ion-icon name={c.silenciado ? 'volume-high-outline' : 'volume-mute-outline'} suppressHydrationWarning></ion-icon>
                        {c.silenciado ? (es ? 'Activar sonido' : 'Unmute') : (es ? 'Silenciar' : 'Mute')}
                      </button>
                      <span className={styles.convMenuSep} />
                      {c.tipo === 'dm' && c.bloqueoMio && (
                        <button type="button" className={`${styles.convMenuItem} ${styles.convMenuItemOk}`} onClick={() => pedirConfirm(c, 'desbloquear')}>
                          <ion-icon name="lock-open-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Desbloquear' : 'Unblock'}
                        </button>
                      )}
                      {c.tipo === 'dm' && !c.bloqueado && (
                        <button type="button" className={`${styles.convMenuItem} ${styles.convMenuItemDanger}`} onClick={() => pedirConfirm(c, 'bloquear')}>
                          <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Bloquear' : 'Block'}
                        </button>
                      )}
                      {c.tipo === 'dm' && (
                        <button type="button" className={`${styles.convMenuItem} ${styles.convMenuItemDanger}`} onClick={() => pedirConfirm(c, 'ocultar')}>
                          <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Eliminar chat' : 'Delete chat'}
                        </button>
                      )}
                      {c.tipo !== 'dm' && c.soyDueno && (
                        <button type="button" className={`${styles.convMenuItem} ${styles.convMenuItemDanger}`} onClick={() => pedirConfirm(c, 'eliminar')}>
                          <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Eliminar grupo' : 'Delete group'}
                        </button>
                      )}
                      {c.tipo !== 'dm' && !c.soyDueno && (
                        <button type="button" className={`${styles.convMenuItem} ${styles.convMenuItemDanger}`} onClick={() => pedirConfirm(c, 'ocultar')}>
                          <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Eliminar chat' : 'Delete chat'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
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

      {/* Modal de aviso/confirmación de las acciones de la lista. */}
      {dlg && (
        <div
          className={styles.dlgOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setDlg(null); }}
        >
          <div className={styles.dlgCard} role="dialog" aria-modal="true">
            <span
              className={`${styles.dlgIcon} ${
                dlg.tipo === 'silenciado' || dlg.accion === 'desbloquear' ? styles.dlgIconOk
                  : dlg.accion === 'bloquear' ? styles.dlgIconWarn
                    : styles.dlgIconBad}`}
            >
              <ion-icon
                name={dlg.tipo === 'silenciado'
                  ? 'notifications-off-outline'
                  : dlg.accion === 'desbloquear' ? 'lock-open-outline'
                    : dlg.accion === 'bloquear' ? 'close-circle-outline' : 'trash-outline'}
                suppressHydrationWarning
              ></ion-icon>
            </span>

            <strong className={styles.dlgTitle}>
              {dlg.tipo === 'silenciado'
                ? (es ? 'Conversación silenciada' : 'Conversation muted')
                : dlg.accion === 'desbloquear'
                  ? (es ? 'Desbloquear usuario' : 'Unblock user')
                  : dlg.accion === 'eliminar'
                    ? (es ? 'Eliminar grupo' : 'Delete group')
                    : dlg.accion === 'ocultar'
                      ? (es ? 'Eliminar chat' : 'Delete chat')
                      : (es ? 'Bloquear usuario' : 'Block user')}
            </strong>

            <p className={styles.dlgText}>
              {dlg.tipo === 'silenciado'
                ? (es
                  ? `Silenciaste ${dlg.c.nombre}: no sonará ni abrirá ventana. Los mensajes seguirán llegando.`
                  : `You muted ${dlg.c.nombre}: it will not sound or open a window. Messages will still arrive.`)
                : dlg.accion === 'desbloquear'
                  ? (es
                    ? `Volverán a poder escribirse y verse el uno al otro.`
                    : `You will be able to message and view each other again.`)
                  : dlg.accion === 'ocultar'
                  ? (es
                    ? `Se ocultará solo en tu cuenta: no lo verás más en la lista. Los demás seguirán viendo los mensajes y si llega uno nuevo volverá a aparecer.`
                    : `It will be hidden only in your account: you won't see it in the list. Everyone else keeps seeing the messages, and it reappears when a new one arrives.`)
                  : dlg.accion === 'eliminar'
                    ? (es
                      ? `${dlg.c.nombre} dejará de existir para todos. Los mensajes y archivos quedan guardados como respaldo.`
                      : `${dlg.c.nombre} will stop existing for everyone. Messages and files are kept as backup.`)
                    : (es
                      ? `No podrás escribirle a ${dlg.c.nombre} ni él a ti hasta que lo desbloquees.`
                      : `You won't be able to message ${dlg.c.nombre} or vice versa until you unblock.`)}
            </p>

            <div className={styles.dlgActions}>
              {dlg.tipo === 'silenciado' ? (
                <button type="button" className={styles.dlgBtnPri} onClick={() => setDlg(null)}>
                  {es ? 'Entendido' : 'Got it'}
                </button>
              ) : (
                <>
                  <button type="button" className={styles.dlgBtn} onClick={() => setDlg(null)}>
                    {es ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.dlgBtnPri} ${dlg.accion === 'desbloquear' ? styles.dlgBtnOk : ''}`}
                    onClick={ejecutarConfirm}
                  >
                    <ion-icon name={dlg.accion === 'desbloquear' ? 'lock-open-outline' : dlg.accion === 'bloquear' ? 'close-circle-outline' : 'trash-outline'} suppressHydrationWarning></ion-icon>
                    {dlg.accion === 'desbloquear'
                      ? (es ? 'Desbloquear' : 'Unblock')
                      : dlg.accion === 'bloquear'
                        ? (es ? 'Bloquear' : 'Block')
                        : (es ? 'Eliminar' : 'Delete')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Compositor
        open={compOpen}
        onClose={() => setCompOpen(false)}
        userKey={userKey}
        onSent={() => cargar()}
      />
    </main>
  );
}
