'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './grupos.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { fmtNum } from '@/_Extras/Datos/num.js';

const LIMIT = 12;

const FILTROS_BASE = [
  { id: 'todas', es: 'Todas', icon: 'apps-outline' },
  { id: 'mis', es: 'Mis grupos', icon: 'person-circle-outline', soloAuthed: true },
  { id: 'pendientes', es: 'Pendientes', icon: 'hourglass-outline', soloAuthed: true },
  { id: 'publicas', es: 'Públicas', icon: 'earth-outline' },
  { id: 'privadas', es: 'Privadas', icon: 'lock-closed-outline' },
];
const ORDENES = [
  { id: 'miembros', es: 'Más miembros', icon: 'people-outline' },
  { id: 'recientes', es: 'Recién salidos', icon: 'sparkles-outline' },
  { id: 'activos', es: 'Más en línea', icon: 'pulse-outline' },
  { id: 'publicaciones', es: 'Más publicaciones', icon: 'document-text-outline' },
];

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

/** Dropdown propio (sin select nativo) para filtros y orden. */
function FiltroDropdown({ label, icon, value, onChange, items = [], right = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const actual = items.find((i) => i.id === value) || items[0] || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={`${styles.fdd} ${right ? styles.fddRight : ''}`} ref={ref}>
      <button
        type="button"
        className={`${styles.fddBtn} ${open ? styles.fddBtnOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ion-icon name={icon} className={styles.fddBtnIcon} suppressHydrationWarning></ion-icon>
        <span className={styles.fddBtnLabel}>{label}</span>
        <span className={styles.fddBtnValue}>{actual ? actual.es : ''}</span>
        <svg
          viewBox="0 0 20 20"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
          className={`${styles.fddChevron} ${open ? styles.fddChevronOpen : ''}`}
        >
          <path fillRule="evenodd" clipRule="evenodd" d="M5.293 7.293a1 1 0 0 1 1.414 0L10 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 0-1.414z" />
        </svg>
      </button>

      {open && (
        <div className={styles.fddMenu} role="listbox">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={it.id === value}
              className={`${styles.fddItem} ${it.id === value ? styles.fddItemOn : ''}`}
              onClick={() => { onChange(it.id); setOpen(false); }}
            >
              <ion-icon name={it.icon || 'ellipse-outline'} suppressHydrationWarning></ion-icon>
              <span>{it.es}</span>
              {it.id === value && <ion-icon name="checkmark-outline" className={styles.fddCheck} suppressHydrationWarning></ion-icon>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GruposClient() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [q, setQ] = useState('');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [msg, setMsg] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [blurOn, setBlurOn] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // { g, accion: 'entrar' | 'cancelar' | 'salir' }
  const [filtro, setFiltro] = useState('todas');
  const [orden, setOrden] = useState('miembros');
  const scrollRef = useRef(null);
  const firstLoadRef = useRef(true);

  // Carga una pagina. append = true agrega (scroll infinito).
  const cargar = useCallback(async (pageToLoad = 1, append = false, query = q, f = filtro, o = orden) => {
    if (append) setCargandoMas(true); else setCargando(true);
    const r = await apiComunidad.grupos(userKey, { q: query, page: pageToLoad, limit: LIMIT, filtro: f, orden: o });
    const rows = Array.isArray(r.data) ? r.data : [];
    setData((prev) => (append ? [...prev, ...rows] : rows));
    setTotal(r.total || 0);
    setPage(pageToLoad);
    const pages = r.pages || 1;
    setHasMore(pageToLoad < pages && rows.length > 0);
    if (append) setCargandoMas(false); else setCargando(false);
  }, [userKey, q, filtro, orden]);

  // Recarga SIEMPRE que cambie filtro u orden (fuente unica de verdad).
  const primeraRef = useRef(true);
  useEffect(() => {
    if (primeraRef.current) { primeraRef.current = false; return; }
    setCargando(true);
    apiComunidad.grupos(userKey, { q: q.trim(), page: 1, limit: LIMIT, filtro, orden })
      .then((r) => {
        const rows = Array.isArray(r?.data) ? r.data : [];
        setData(rows);
        setTotal(r?.total || 0);
        setPage(1);
        const pages = r?.pages || 1;
        setHasMore(1 < pages && rows.length > 0);
      })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, orden]);

  // Lee ?q=, ?filtro=, ?orden= de la URL al entrar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const q0 = sp.get('q') || '';
    const f0 = sp.get('filtro');
    const o0 = sp.get('orden');
    if (q0) { setQ(q0); setBuscando(true); }
    if (f0 && ['todas', 'mis', 'pendientes', 'publicas', 'privadas'].includes(f0)) setFiltro(f0);
    if (o0 && ['miembros', 'recientes', 'activos', 'publicaciones'].includes(o0)) setOrden(o0);
    cargar(1, false, q0, f0 || 'todas', o0 || 'miembros');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  // Tiempo real: refresca.
  useEffect(() => {
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (tipo.startsWith('comunidad_')) cargar(1, false);
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargar]);

  // Sugerencias en vivo (solo grupos/comunidades) con blur.
  useEffect(() => {
    const qq = q.trim();
    if (qq.length < 2 || buscando) {
      setSugerencias([]);
      setSugiriendo(false);
      setBlurOn(false);
      return undefined;
    }
    setBlurOn(true);
    setSugiriendo(true);
    const t = setTimeout(async () => {
      const r = await apiComunidad.buscar(qq, userKey, 'comunidad', 1, 5);
      const rows = (r && r.data && r.data.grupos) || [];
      setSugerencias(rows);
      setSugiriendo(false);
    }, 280);
    return () => clearTimeout(t);
  }, [q, userKey, buscando]);

  function actualizarUrl(query = q, f = filtro, o = orden) {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    const qq = String(query || '').trim();
    if (qq) p.set('q', qq);
    if (f && f !== 'todas') p.set('filtro', f);
    if (o && o !== 'miembros') p.set('orden', o);
    const qs = p.toString();
    window.history.replaceState(null, '', `/comunidad/grupos${qs ? `?${qs}` : ''}`);
  }

  function buscarAhora(e) {
    if (e) e.preventDefault();
    const qq = q.trim();
    setBuscando(true);
    setSugerencias([]);
    setBlurOn(false);
    actualizarUrl(qq);
    cargar(1, false, qq);
  }

  function limpiar() {
    setQ('');
    setBuscando(false);
    setSugerencias([]);
    setBlurOn(false);
    actualizarUrl('', filtro, orden);
    cargar(1, false, '');
  }

  // Scroll progresivo: abajo carga mas; arriba (si estas al inicio) no lagea
  // porque ya esta cargado el bloque previo.
  function onScroll(e) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 320 && hasMore && !cargandoMas) {
      cargar(page + 1, true);
    }
  }

  function requiereAprobacion(g) {
    return g.privacidad === 'privada' || g.modo_union === 'invitacion';
  }

  async function unirse(g, irAlGrupo = false) {
    if (!authed) { router.push('/comunidad'); return; }
    const r = await apiComunidad.unirse(g.id, userKey);
    if (r.error) { setMsg(r.error); return; }
    // Privado: queda pendiente hasta que lo acepten (no navega).
    if (r.pending) { setMsg(es ? 'Solicitud enviada al creador/admins.' : 'Request sent to the owner/admins.'); return; }
    // Publico: al unirse va directo al grupo para ver sus publicaciones.
    if (r.joined && irAlGrupo) { router.push(`/comunidad/grupo/${g.slug || g.id}`); return; }
    setMsg(es ? (r.joined ? 'Te uniste al grupo.' : 'Saliste del grupo.') : (r.joined ? 'Joined the group.' : 'Left the group.'));
    cargar(1, false);
  }

  async function cancelar(g) {
    const r = await apiComunidad.unirse(g.id, userKey, '', 'cancelar');
    if (r.error) { setMsg(r.error); return; }
    setMsg(es ? 'Solicitud cancelada.' : 'Request canceled.');
    cargar(1, false);
  }

  // Pide confirmacion antes de entrar/cancelar/salir.
  function pedirConfirmacion(g, accion) {
    if (accion === 'entrar' && !authed) { router.push('/comunidad'); return; }
    setConfirmar({ g, accion });
  }

  async function ejecutarConfirmacion() {
    const c = confirmar;
    setConfirmar(null);
    if (!c) return;
    if (c.accion === 'entrar') await unirse(c.g, true);
    else if (c.accion === 'cancelar') await cancelar(c.g);
    else if (c.accion === 'salir') await unirse(c.g);
  }

  function confirmCfg() {
    if (!confirmar) return null;
    const { g, accion } = confirmar;
    const aprob = requiereAprobacion(g);
    if (accion === 'entrar') {
      return {
        titulo: aprob ? (es ? 'Pedir entrar' : 'Ask to join') : (es ? 'Unirme al grupo' : 'Join group'),
        texto: aprob
          ? (es ? `Se enviará una solicitud para unirte a "${g.nombre}". ¿Continuar?` : `A request will be sent to join "${g.nombre}". Continue?`)
          : (es ? `¿Seguro que quieres unirte a "${g.nombre}"?` : `Are you sure you want to join "${g.nombre}"?`),
        ok: es ? 'Confirmar' : 'Confirm',
      };
    }
    if (accion === 'cancelar') {
      return {
        titulo: es ? 'Cancelar solicitud' : 'Cancel request',
        texto: es ? `¿Seguro que quieres cancelar tu solicitud para "${g.nombre}"?` : `Are you sure you want to cancel your request to "${g.nombre}"?`,
        ok: es ? 'Cancelar solicitud' : 'Cancel request',
      };
    }
    return {
      titulo: es ? 'Salir del grupo' : 'Leave group',
      texto: es ? `¿Seguro que quieres salir de "${g.nombre}"?` : `Are you sure you want to leave "${g.nombre}"?`,
      ok: es ? 'Salir' : 'Leave',
    };
  }

  function abrir(g) {
    router.push(`/comunidad/grupo/${g.slug || g.id}`);
  }

  return (
    <main className={styles.main}>
      {/* ===== BUSCADOR (izquierda) + contador (derecha) ===== */}
      <div className={styles.buscadorWrap}>
        <div className={styles.buscador}>
          <div className={styles.buscadorBox}>
            <ion-icon name="search-outline" className={styles.buscadorIcon} suppressHydrationWarning></ion-icon>
            <input
              className={styles.buscadorInput}
              type="text"
              placeholder={es ? 'Buscar comunidad...' : 'Search community...'}
              value={q}
              onChange={(e) => { setQ(e.target.value); setBuscando(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') buscarAhora(e); }}
            />
            {q && (
              <button type="button" className={styles.buscadorClear} onClick={limpiar} aria-label={es ? 'Limpiar' : 'Clear'}>
                <ion-icon name="close-circle" suppressHydrationWarning></ion-icon>
                <span className={styles.buscadorClearLabel}>{es ? 'Limpiar' : 'Clear'}</span>
              </button>
            )}
            <button type="button" className={styles.buscadorBtn} onClick={buscarAhora}>
              {es ? 'Buscar' : 'Search'}
            </button>
          </div>

          {/* Sugerencias flotantes con blur */}
          {blurOn && (
            <div className={styles.backdrop} aria-hidden="true" onClick={limpiar} />
          )}
          {blurOn && (
            <div className={styles.sugerencias}>
              <p className={styles.sugerenciaHead}>{es ? 'Comunidades' : 'Communities'}</p>
              {sugerencias.length === 0 ? (
                <p className={styles.sugerenciaEmpty}>{sugiriendo ? (es ? 'Buscando...' : 'Searching...') : (es ? 'Sin resultados' : 'No results')}</p>
              ) : sugerencias.map((g) => (
                <button key={`s_${g.id}`} type="button" className={styles.sugerenciaItem} onClick={() => router.push(`/comunidad/grupo/${g.slug || g.id}`)}>
                  <span className={styles.sugerenciaAvatar}>
                    {g.avatar ? <img src={comunidadMedia(g.avatar)} alt="" /> : ini(g.nombre)}
                  </span>
                  <span className={styles.sugerenciaInfo}>
                    <span className={styles.sugerenciaNombre}>{g.nombre}</span>
                      <span className={styles.sugerenciaMeta}>{es ? 'Comunidad' : 'Community'} · {fmtNum(g.miembros)} {es ? 'miembros' : 'members'} · {fmtNum(g.activos || 0)} {es ? 'en línea' : 'online'}</span>
                  </span>
                  <ion-icon name="people-outline" className={styles.sugerenciaTipo} suppressHydrationWarning></ion-icon>
                </button>
              ))}
              <button type="button" className={styles.sugerenciaVerMas} onClick={buscarAhora}>
                <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Ver más resultados' : 'See more results'}
              </button>
            </div>
          )}
        </div>

        {/* Contador: en PC va a la derecha del buscador. */}
        <div className={`${styles.contador} ${styles.contadorPc}`}>
          <strong className={styles.contadorNum}>{Number(total).toLocaleString(es ? 'es-PE' : 'en-US')}</strong>
          <span className={styles.contadorLbl}>{es ? 'comunidades' : 'communities'}</span>
        </div>
      </div>

      {/* ===== Filtros ===== */}
      <div className={styles.filtros}>
        {/* PC: chips de filtro */}
        <div className={styles.filtrosRow}>
          {FILTROS_BASE.filter((f) => !f.soloAuthed || authed).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`${styles.filtroChip} ${filtro === f.id ? styles.filtroChipOn : ''}`}
              onClick={() => { setFiltro(f.id); actualizarUrl(q, f.id, orden); }}
            >
              <ion-icon name={f.icon} suppressHydrationWarning></ion-icon>
              {f.es}
            </button>
          ))}
        </div>

        {/* PC: orden (dropdown propio, abre al pulsar todo el boton) */}
        <div className={styles.ordenPc}>
          <FiltroDropdown
            label={es ? 'Ordenar' : 'Sort'}
            icon="swap-vertical-outline"
            value={orden}
            onChange={(v) => { setOrden(v); actualizarUrl(q, filtro, v); }}
            items={ORDENES}
          />
        </div>

        {/* Celular: dropdown propio */}
        <div className={styles.filtrosMobile}>
          <FiltroDropdown
            label={es ? 'Filtrar' : 'Filter'}
            icon="options-outline"
            value={filtro}
            onChange={(v) => { setFiltro(v); actualizarUrl(q, v, orden); }}
            items={FILTROS_BASE.filter((f) => !f.soloAuthed || authed)}
          />
          <FiltroDropdown
            label={es ? 'Ordenar' : 'Sort'}
            icon="swap-vertical-outline"
            value={orden}
            onChange={(v) => { setOrden(v); actualizarUrl(q, filtro, v); }}
            items={ORDENES}
          />
        </div>

        {/* Contador: en celular va debajo de los filtros. */}
        <div className={`${styles.contador} ${styles.contadorMobile}`}>
          <strong className={styles.contadorNum}>{Number(total).toLocaleString(es ? 'es-PE' : 'en-US')}</strong>
          <span className={styles.contadorLbl}>{es ? 'comunidades' : 'communities'}</span>
        </div>
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      <div className={styles.scrollArea} ref={scrollRef} onScroll={onScroll}>
        {cargando ? (
          <p className={styles.empty}>{es ? 'Cargando...' : 'Loading...'}</p>
        ) : data.length === 0 ? (
          <p className={styles.empty}>{es ? 'No hay comunidades con esa búsqueda.' : 'No communities match that search.'}</p>
        ) : (
          <div className={styles.grid}>
            {data.map((g) => (
              <article
                key={g.id}
                className={styles.card}
                style={(g.portada || g.banner || g.avatar) ? { backgroundImage: `linear-gradient(to right, rgba(10,5,6,0.95), rgba(10,5,6,0.4)), url(${comunidadMedia(g.portada || g.banner || g.avatar)})` } : undefined}
              >
                <div
                  className={styles.cardMain}
                  role="button"
                  tabIndex={0}
                  onClick={() => abrir(g)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(g); } }}
                >
                  <span className={styles.badges}>
                    {g.miembro ? (
                      <span className={`${styles.tag} ${styles.tagMember}`}>
                        <ion-icon name="star-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'MIEMBRO' : 'MEMBER'}
                      </span>
                    ) : g.solicitud === 'pendiente' ? (
                      <span className={`${styles.tag} ${styles.tagPrivate}`}>
                        <ion-icon name="time-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'PENDIENTE' : 'PENDING'}
                      </span>
                    ) : requiereAprobacion(g) ? (
                      <span className={`${styles.tag} ${styles.tagPrivate}`}>
                        <ion-icon name="lock-closed-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'PRIVADO' : 'PRIVATE'}
                      </span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagPublic}`}>
                        <ion-icon name="globe-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'PÚBLICO' : 'PUBLIC'}
                      </span>
                    )}
                  </span>

                  <h2 className={styles.name}>{g.nombre}</h2>

                  <div className={styles.cardFoot}>
                    <div className={styles.footInfo}>
                      {g.descripcion
                        ? <p className={styles.desc}>{g.descripcion}</p>
                        : <p className={styles.desc}>{es ? 'Comunidad de la plataforma.' : 'Platform community.'}</p>}
                      <span className={styles.metaSub}>
                        18+ | {fmtNum(g.miembros)} {es ? 'miembros' : 'members'} | {fmtNum(g.activos || 0)} {es ? 'en línea' : 'online'}
                      </span>
                    </div>
                    {g.solicitud === 'pendiente' && !g.miembro ? (
                      <button type="button" className={styles.btnGhost} onClick={(e) => { e.stopPropagation(); pedirConfirmacion(g, 'cancelar'); }}>
                        <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={g.miembro ? styles.btnGhost : styles.btn}
                        onClick={(e) => { e.stopPropagation(); pedirConfirmacion(g, g.miembro ? 'salir' : 'entrar'); }}
                      >
                        <ion-icon name={g.miembro ? 'exit-outline' : requiereAprobacion(g) ? 'lock-closed-outline' : 'person-add-outline'} suppressHydrationWarning></ion-icon>
                        {g.miembro ? (es ? 'Salir' : 'Leave')
                          : requiereAprobacion(g) ? (es ? 'Pedir entrar' : 'Ask to join')
                            : (es ? 'Unirme' : 'Join')}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {cargandoMas && <p className={styles.mas}>{es ? 'Cargando más...' : 'Loading more...'}</p>}
        {!hasMore && data.length > 0 && <p className={styles.mas}>{es ? 'No hay más comunidades.' : 'No more communities.'}</p>}
      </div>

      {/* ===== Modal de confirmacion ===== */}
      {confirmar && (() => {
        const cfg = confirmCfg();
        if (!cfg) return null;
        return (
          <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setConfirmar(null); }}>
            <div className={styles.modal}>
              <h3 className={styles.modalTitle}>{cfg.titulo}</h3>
              <p className={styles.modalText}>{cfg.texto}</p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={() => setConfirmar(null)}>
                  {es ? 'Cerrar' : 'Close'}
                </button>
                <button type="button" className={styles.modalOk} onClick={ejecutarConfirmacion}>
                  {cfg.ok}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
