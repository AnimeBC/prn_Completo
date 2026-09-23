'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './amigos.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { canalUrl } from '@/_Extras/Canales/canal.js';
import { presenciaEstado } from '@/_Extras/Fecha/fecha.js';

const LIMIT = 24;

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

function num(n, es) {
  return Number(n || 0).toLocaleString(es ? 'es-PE' : 'en-US');
}

/** Nombre visible de un usuario. */
function nombreDe(u) {
  return u?.usuario || u?.nombre || 'Usuario';
}

export default function AmigosClient() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [tab, setTab] = useState('todos'); // todos | amigos | solicitudes | sugerencias
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | favoritos | online
  const [amigos, setAmigos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [msg, setMsg] = useState('');

  // Presencia real desde la BD (latido global cada 60s): "en línea" solo con
  // edad < 2 min; si no, "hace X" (presenciaEstado usa la edad del backend).
  const [presenciaRows, setPresenciaRows] = useState([]);
  const online = useMemo(
    () => new Set(
      presenciaRows
        .filter((p) => presenciaEstado(p.edad, es).online)
        .map((p) => String(p.user_key))
    ),
    [presenciaRows, es]
  );
  const edadMap = useMemo(
    () => new Map(presenciaRows.map((p) => [String(p.user_key), p.edad])),
    [presenciaRows]
  );

  const scrollRef = useRef(null);

  /* ---------- presencia (Redis/SSE -> BD) ---------- */
  const cargarPresencia = useCallback(async () => {
    if (!authed) { setPresenciaRows([]); return; }
    const r = await apiComunidad.presencia();
    const arr = Array.isArray(r?.data) ? r.data : [];
    setPresenciaRows(arr);
  }, [authed]);

  useEffect(() => { cargarPresencia(); }, [cargarPresencia]);

  /* ---------- lista (todos / amigos / pendientes / sugerencias) ---------- */
  // Mapea la pestaña actual + el chip de filtro a un filtro de la API.
  const filtroDeTab = useCallback((t = tab, f = filtro) => {
    if (t === 'solicitudes') return 'pendientes';
    if (t === 'sugerencias') return 'sugerencias';
    if (t === 'todos') return 'todos';
    return f; // amigos: todos | favoritos | online
  }, [tab, filtro]);

  const cargarLista = useCallback(async (pageToLoad = 1, append = false, query = q, f = 'todos') => {
    if (!userKey) { setAmigos([]); setTotal(0); setCargando(false); return; }
    if (append) setCargandoMas(true); else setCargando(true);
    const r = await apiComunidad.amigos(userKey, {
      q: query.trim(),
      page: pageToLoad,
      limit: LIMIT,
      filtro: f,
    });
    const rows = Array.isArray(r?.data) ? r.data : [];
    setAmigos((prev) => (append ? [...prev, ...rows] : rows));
    setTotal(r?.total || 0);
    setPage(pageToLoad);
    setHasMore(pageToLoad < (r?.pages || 1) && rows.length > 0);
    if (append) setCargandoMas(false); else setCargando(false);
  }, [userKey, q]);

  useEffect(() => {
    cargarLista(1, false, q, filtroDeTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtro, userKey]);

  /* ---------- tiempo real (Redis -> SSE) ---------- */
  useEffect(() => {
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (!tipo.startsWith('comunidad_') && tipo !== 'notificacion' && tipo !== 'presencia') return;
      cargarPresencia();
      cargarLista(1, false);
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargarLista, cargarPresencia]);

  /* ---------- scroll infinito ---------- */
  function onScroll(e) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 320 && hasMore && !cargandoMas) {
      cargarLista(page + 1, true, q, filtroDeTab());
    }
  }

  /* ---------- acciones ---------- */
  async function accion(u, que) {
    if (!authed) { router.push('/comunidad'); return; }
    const r = await apiComunidad.amistadAccion(u.user_key, userKey, que);
    if (r?.error) { setMsg(r.error); return; }
    setMsg(es ? 'Listo.' : 'Done.');
    cargarLista(1, false, q, filtroDeTab());
  }

  function abrirPerfil(u) {
    router.push(u.canal_slug ? `/canal/${u.canal_slug}` : canalUrl(nombreDe(u)));
  }

  function chatear(u) {
    router.push(`/chat?dm=${encodeURIComponent(u.user_key)}`);
  }

  /* ---------- lista visible (aplica filtro online del lado cliente) ---------- */
  const visibles = useMemo(() => {
    if (tab !== 'amigos' || filtro !== 'online') return amigos;
    return amigos.filter((u) => online.has(String(u.user_key)));
  }, [amigos, filtro, tab, online]);

  const fActual = tab === 'solicitudes' ? 'pendientes' : tab === 'sugerencias' ? 'sugerencias' : filtro;

  const tabs = [
    { id: 'todos', icon: 'earth-outline', es: 'Todos', en: 'All' },
    { id: 'amigos', icon: 'people-outline', es: 'Amigos', en: 'Friends' },
    { id: 'solicitudes', icon: 'person-add-outline', es: 'Solicitudes', en: 'Requests' },
    { id: 'sugerencias', icon: 'sparkles-outline', es: 'Sugerencias', en: 'Suggestions' },
  ];

  const filtros = [
    { id: 'todos', icon: 'grid-outline', es: 'Todos', en: 'All' },
    { id: 'online', icon: 'ellipse', es: 'En línea', en: 'Online' },
    { id: 'favoritos', icon: 'star-outline', es: 'Favoritos', en: 'Favorites' },
  ];

  /* Persona cualquiera (pestaña Todos): boton segun el estado de amistad. */
  function renderPersona(u) {
    const on = online.has(String(u.user_key));
    const est = u.amistad_estado;
    const miSolicitud = String(u.amistad_solicitante) === String(userKey);
    let boton;
    if (est === 'aceptado') {
      boton = null;
    } else if (est === 'pendiente' && miSolicitud) {
      boton = (
        <button type="button" className={styles.faBtn} title={es ? 'Cancelar solicitud' : 'Cancel request'} onClick={() => accion(u, 'cancelar')}>
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>
      );
    } else if (est === 'pendiente') {
      boton = (
        <button type="button" className={`${styles.faBtn} ${styles.faOk}`} title={es ? 'Aceptar' : 'Accept'} onClick={() => accion(u, 'aceptar')}>
          <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
        </button>
      );
    } else {
      boton = (
        <button type="button" className={styles.faBtn} title={es ? 'Añadir amigo' : 'Add friend'} onClick={() => accion(u, 'solicitar')}>
          <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
        </button>
      );
    }
    return (
      <article
        key={u.user_key}
        className={styles.friendCard}
        onClick={() => abrirPerfil(u)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPerfil(u); } }}
      >
        <button type="button" className={styles.friendAvatar} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }} aria-label={nombreDe(u)}>
          {u.avatar ? <Image src={comunidadMedia(u.avatar)} alt="" width={52} height={52} loading="lazy" /> : <span>{ini(nombreDe(u))}</span>}
          {on && <span className={styles.onlineDot} aria-hidden="true" />}
        </button>
        <div className={styles.friendInfo}>
          <button type="button" className={styles.friendName} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }}>{nombreDe(u)}</button>
          <span className={styles.friendMeta}>
            {u.canal_seguidores ? `${num(u.canal_seguidores, es)} ${es ? 'seguidores' : 'followers'}` : (u.canal_pais || (es ? 'Persona de la comunidad' : 'Community person'))}
          </span>
        </div>
        <div className={styles.friendActions}>
          <button type="button" className={styles.faBtn} title={es ? 'Ver perfil' : 'View profile'} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }}>
            <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
          </button>
          {boton && (
            <span onClick={(e) => e.stopPropagation()}>{boton}</span>
          )}
          <button
            type="button"
            className={`${styles.faBtn} ${styles.faOk}`}
            title={es ? 'Enviar mensaje' : 'Send message'}
            onClick={(e) => { e.stopPropagation(); chatear(u); }}
          >
            <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      </article>
    );
  }

  function renderTarjeta(u) {
    const on = online.has(String(u.user_key));
    const est = presenciaEstado(edadMap.get(String(u.user_key)), es);
    return (
      <article
        key={u.user_key}
        className={styles.friendCard}
        onClick={() => abrirPerfil(u)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPerfil(u); } }}
      >
        <button type="button" className={styles.friendAvatar} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }} aria-label={nombreDe(u)}>
          {u.avatar ? <Image src={comunidadMedia(u.avatar)} alt="" width={52} height={52} loading="lazy" /> : <span>{ini(nombreDe(u))}</span>}
          {on && <span className={styles.onlineDot} aria-hidden="true" />}
        </button>
        <div className={styles.friendInfo}>
          <button type="button" className={styles.friendName} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }}>
            {nombreDe(u)}
            {u.favorito && <ion-icon name="star" className={styles.star} suppressHydrationWarning></ion-icon>}
          </button>
          <span className={`${styles.friendState} ${on ? styles.stateOn : ''}`}>
            {est.label}
          </span>
          {(u.canal_pais || u.canal_seguidores) && (
            <span className={styles.friendMeta}>
              {u.canal_pais ? `${u.canal_pais}` : ''}
              {u.canal_pais && u.canal_seguidores ? ' · ' : ''}
              {u.canal_seguidores ? `${num(u.canal_seguidores, es)} ${es ? 'seguidores' : 'followers'}` : ''}
            </span>
          )}
        </div>
        <div className={styles.friendActions}>
          <button type="button" className={styles.faBtn} title={es ? 'Ver perfil' : 'View profile'} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }}>
            <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button
            type="button"
            className={`${styles.faBtn} ${u.favorito ? styles.faStar : ''}`}
            title={u.favorito ? (es ? 'Quitar de favoritos' : 'Remove favorite') : (es ? 'Añadir a favoritos' : 'Add favorite')}
            onClick={(e) => { e.stopPropagation(); accion(u, u.favorito ? 'nofavorito' : 'favorito'); }}
          >
            <ion-icon name={u.favorito ? 'star' : 'star-outline'} suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.faBtn} title={es ? 'Eliminar amigo' : 'Remove friend'} onClick={(e) => { e.stopPropagation(); accion(u, 'eliminar'); }}>
            <ion-icon name="person-remove-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.faBtn} title={es ? 'Enviar mensaje' : 'Send message'} onClick={(e) => { e.stopPropagation(); chatear(u); }}>
            <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      </article>
    );
  }

  function renderSolicitud(u) {
    return (
      <article
        key={u.user_key}
        className={styles.friendCard}
        onClick={() => abrirPerfil(u)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPerfil(u); } }}
      >
        <button type="button" className={styles.friendAvatar} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }} aria-label={nombreDe(u)}>
          {u.avatar ? <Image src={comunidadMedia(u.avatar)} alt="" width={52} height={52} loading="lazy" /> : <span>{ini(nombreDe(u))}</span>}
        </button>
        <div className={styles.friendInfo}>
          <span className={styles.friendName}>{nombreDe(u)}</span>
          <span className={styles.friendMeta}>{es ? 'quiere ser tu amigo' : 'wants to be your friend'}</span>
        </div>
        <div className={styles.friendActions}>
          <button type="button" className={`${styles.faBtn} ${styles.faOk}`} title={es ? 'Aceptar' : 'Accept'} onClick={(e) => { e.stopPropagation(); accion(u, 'aceptar'); }}>
            <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.faBtn} title={es ? 'Rechazar' : 'Reject'} onClick={(e) => { e.stopPropagation(); accion(u, 'rechazar'); }}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button
            type="button"
            className={`${styles.faBtn} ${styles.faOk}`}
            title={es ? 'Enviar mensaje' : 'Send message'}
            onClick={(e) => { e.stopPropagation(); chatear(u); }}
          >
            <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      </article>
    );
  }

  function renderSugerencia(u) {
    return (
      <article
        key={u.user_key}
        className={styles.friendCard}
        onClick={() => abrirPerfil(u)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPerfil(u); } }}
      >
        <button type="button" className={styles.friendAvatar} onClick={(e) => { e.stopPropagation(); abrirPerfil(u); }} aria-label={nombreDe(u)}>
          {u.avatar ? <Image src={comunidadMedia(u.avatar)} alt="" width={52} height={52} loading="lazy" /> : <span>{ini(nombreDe(u))}</span>}
        </button>
        <div className={styles.friendInfo}>
          <span className={styles.friendName}>{nombreDe(u)}</span>
          <span className={styles.friendMeta}>
            {u.canal_seguidores ? `${num(u.canal_seguidores, es)} ${es ? 'seguidores' : 'followers'}` : (es ? 'Persona que quizá conozcas' : 'Person you may know')}
          </span>
        </div>
        <div className={styles.friendActions}>
          <button type="button" className={`${styles.faBtn} ${styles.faOk}`} title={es ? 'Añadir amigo' : 'Add friend'} onClick={(e) => { e.stopPropagation(); accion(u, 'solicitar'); }}>
            <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button
            type="button"
            className={`${styles.faBtn} ${styles.faOk}`}
            title={es ? 'Enviar mensaje' : 'Send message'}
            onClick={(e) => { e.stopPropagation(); chatear(u); }}
          >
            <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      </article>
    );
  }

  const listaActual = visibles;

  const renderDe = tab === 'solicitudes' ? renderSolicitud
    : tab === 'sugerencias' ? renderSugerencia
      : tab === 'todos' ? renderPersona
        : renderTarjeta;

  const placeholderBuscar = tab === 'amigos'
    ? (es ? 'Buscar amigos...' : 'Search friends...')
    : tab === 'solicitudes'
      ? (es ? 'Buscar en solicitudes...' : 'Search requests...')
      : (es ? 'Buscar personas...' : 'Search people...');

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <h1 className={styles.title}>{es ? 'Amigos' : 'Friends'}</h1>
        {tab === 'amigos' && <span className={styles.count}>{num(total, es)}</span>}
        {/* Navegacion entre secciones (estilo Facebook).
            En PC va a la derecha del titulo; en movil, debajo. */}
        <nav className={styles.tabsBar} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
              onClick={() => { setTab(t.id); setMsg(''); }}
            >
              <ion-icon name={t.icon} suppressHydrationWarning></ion-icon>
              <span>{es ? t.es : t.en}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Buscador */}
      <div className={styles.buscadorBox}>
        <ion-icon name="search-outline" className={styles.buscadorIcon} suppressHydrationWarning></ion-icon>
        <input
          className={styles.buscadorInput}
          type="text"
          placeholder={placeholderBuscar}
          value={q}
          onChange={(e) => { setQ(e.target.value); cargarLista(1, false, e.target.value, fActual); }}
        />
        {q && (
          <button type="button" className={styles.buscadorClear} onClick={() => { setQ(''); cargarLista(1, false, '', fActual); }} aria-label={es ? 'Limpiar' : 'Clear'}>
            <ion-icon name="close-circle" suppressHydrationWarning></ion-icon>
          </button>
        )}
      </div>

      {/* Filtros (solo en la pestana de amigos) */}
      {tab === 'amigos' && (
        <div className={styles.filtros}>
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`${styles.chip} ${filtro === f.id ? styles.chipOn : ''}`}
              onClick={() => setFiltro(f.id)}
            >
              <ion-icon name={f.icon} suppressHydrationWarning></ion-icon>
              {es ? f.es : f.en}
            </button>
          ))}
        </div>
      )}

      {msg && <p className={styles.msg}>{msg}</p>}

      <div className={styles.scrollArea} ref={scrollRef} onScroll={onScroll}>
        {cargando ? (
          <p className={styles.empty}>{es ? 'Cargando...' : 'Loading...'}</p>
        ) : listaActual.length === 0 ? (
          <p className={styles.empty}>
            {tab === 'amigos'
              ? (es ? 'No hay amigos que coincidan.' : 'No friends match.')
              : tab === 'solicitudes'
                ? (es ? 'No tienes solicitudes pendientes.' : 'No pending requests.')
                : tab === 'sugerencias'
                  ? (es ? 'No hay sugerencias por ahora.' : 'No suggestions right now.')
                  : (es ? 'No hay personas que coincidan.' : 'No people match.')}
          </p>
        ) : (
          <div className={styles.grid}>
            {listaActual.map(renderDe)}
          </div>
        )}

        {cargandoMas && <p className={styles.mas}>{es ? 'Cargando más...' : 'Loading more...'}</p>}
        {!hasMore && !cargando && listaActual.length > 0 && <p className={styles.mas}>{es ? 'No hay más.' : 'No more.'}</p>}
      </div>
    </main>
  );
}
