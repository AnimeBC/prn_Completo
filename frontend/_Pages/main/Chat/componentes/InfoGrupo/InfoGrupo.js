'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './infoGrupo.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { presenciaEstado } from '@/_Extras/Fecha/fecha.js';
import ImageCropModal from '@/_Extras/Imagen/ImageCropModal.js';

const PERMISOS = [
  {
    id: 'agregar_miembros',
    icon: 'person-add-outline',
    es: 'Agregar miembros',
    en: 'Add members',
    desEs: 'Invita y agrega gente al grupo.',
    desEn: 'Invites and adds people to the group.',
  },
  {
    id: 'eliminar_miembros',
    icon: 'person-remove-outline',
    es: 'Eliminar miembros',
    en: 'Remove members',
    desEs: 'Expulsa miembros del grupo.',
    desEn: 'Removes members from the group.',
  },
  {
    id: 'editar_grupo',
    icon: 'create-outline',
    es: 'Editar grupo',
    en: 'Edit group',
    desEs: 'Foto, portada, nombre, descripción y reglas.',
    desEn: 'Photo, cover, name, description and rules.',
  },
  {
    id: 'chat',
    icon: 'chatbubbles-outline',
    es: 'Moderar chat',
    en: 'Moderate chat',
    desEs: 'Puede moderar los mensajes del chat.',
    desEn: 'Can moderate chat messages.',
  },
];

// Miembros por página (carga progresiva con el scroll).
const PAGE_MIEMBROS = 40;

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

function rolLabel(rol, es) {
  if (rol === 'dueno') return es ? 'Dueño' : 'Owner';
  if (rol === 'semidueno') return es ? 'Semidueño' : 'Co-owner';
  return es ? 'Miembro' : 'Member';
}

/**
 * Modal lateral con la información del grupo: portada, foto, datos,
 * miembros y edición según el rol (dueño / semidueno / miembro).
 * En celular ocupa toda la pantalla hasta que se retroceda.
 */
export default function InfoGrupo({ open, grupoId, userKey, onClose, onSalirGrupo }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  const [grupo, setGrupo] = useState(null);
  // Miembros: paginados y buscables (grupos con millones de miembros).
  const [miembros, setMiembros] = useState([]);
  const [membQ, setMembQ] = useState('');
  const [cargandoMiembros, setCargandoMiembros] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const membQRef = useRef('');
  const membOffsetRef = useRef(0);
  const membHayMasRef = useRef(false);
  const membCargandoRef = useRef(false);
  const membReqRef = useRef(0);
  const bodyRef = useRef(null);
  const [rol, setRol] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [soyDueno, setSoyDueno] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ nombre: '', descripcion: '', reglas: '', privacidad: 'publica', chat_activo: true });
  const [bannerPick, setBannerPick] = useState(null);
  const [avatarPick, setAvatarPick] = useState(null);
  const [kickMiembro, setKickMiembro] = useState(null); // expulsión (modal)
  const [esMiembro, setEsMiembro] = useState(false);
  // Acciones del grupo: salir (miembros/semiduenos) o eliminar (solo dueño).
  const [accionGrupo, setAccionGrupo] = useState(null); // 'salir' | 'eliminar'
  const [txtEliminar, setTxtEliminar] = useState('');
  const [accionBusy, setAccionBusy] = useState(false);
  // Modal para agregar miembros (busqueda paginada con scroll).
  const [addOpen, setAddOpen] = useState(false);
  const [addQ, setAddQ] = useState('');
  const [addRows, setAddRows] = useState([]);
  const [addCargando, setAddCargando] = useState(true);
  const [addMas, setAddMas] = useState(false);
  const [addCargandoMas, setAddCargandoMas] = useState(false);
  const addQRef = useRef('');
  const addOffsetRef = useRef(0);
  const addMasRef = useRef(false);
  const addCargandoRef = useRef(false);
  const addReqRef = useRef(0);
  const addListRef = useRef(null);
  // Vista del panel: datos del grupo o solicitudes de entrada (admins).
  const [vista, setVista] = useState('info');
  const [sols, setSols] = useState([]);
  const [cargandoSols, setCargandoSols] = useState(false);
  // Modal de rol/permisos (solo el dueño).
  const [rolMiembro, setRolMiembro] = useState(null);
  const [rolSel, setRolSel] = useState('miembro');
  const [rolPermisos, setRolPermisos] = useState([]);
  const [guardandoRol, setGuardandoRol] = useState(false);

  const puedeEditar = soyDueno || (rol === 'semidueno' && permisos.includes('editar_grupo'));
  const puedeEliminar = soyDueno || (rol === 'semidueno' && permisos.includes('eliminar_miembros'));
  const puedeAgregar = soyDueno || (rol === 'semidueno' && permisos.includes('agregar_miembros'));
  // Solo grupos privados/por invitación tienen solicitudes, y solo las ve
  // quien puede agregar miembros (dueño o semidueno con permiso).
  const conSolicitudes = grupo?.privacidad === 'privada' || grupo?.modo_union === 'invitacion';
  const puedeVerSols = conSolicitudes && puedeAgregar;

  const cargar = useCallback(async () => {
    if (!grupoId) return;
    const g = await apiComunidad.grupo(grupoId, userKey || '');
    if (g.grupo) {
      setGrupo(g.grupo);
      setRol(g.rol || null);
      setPermisos(g.permisos || []);
      setSoyDueno(!!g.soyDueno);
      setEsMiembro(!!g.soyMiembro);
      setForm({
        nombre: g.grupo.nombre || '',
        descripcion: g.grupo.descripcion || '',
        reglas: g.grupo.reglas || '',
        privacidad: g.grupo.privacidad || 'publica',
        chat_activo: g.grupo.chat_activo !== false,
      });
    }
    setCargando(false);
  }, [grupoId, userKey]);

  // Carga UNA página de miembros (off=0 reemplaza; off>0 agrega al final).
  const cargarPagina = useCallback(async (qTxt, off) => {
    if (!grupoId) return;
    const reqId = ++membReqRef.current;
    const r = await apiComunidad.gruposMiembros(grupoId, { q: qTxt, offset: off, limit: PAGE_MIEMBROS, userKey });
    if (reqId !== membReqRef.current) return; // una busqueda mas nueva gano
    const rows = Array.isArray(r?.data) ? r.data : [];
    setMiembros((prev) => (off === 0 ? rows : [...prev, ...rows]));
    membOffsetRef.current = off + rows.length;
    membHayMasRef.current = !!r?.hasMore;
    setHayMas(!!r?.hasMore);
    membCargandoRef.current = false;
    setCargandoMas(false);
    setCargandoMiembros(false);
  }, [grupoId]);

  // Primera carga al abrir + busqueda con debounce.
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      setCargandoMiembros(true);
      cargarPagina(membQ, 0);
    }, membQ ? 300 : 50);
    return () => clearTimeout(t);
  }, [open, membQ, cargarPagina]);

  // Solicitudes pendientes (para el contador y la pestaña).
  const cargarSolicitudes = useCallback(async () => {
    if (!grupoId) return;
    setCargandoSols(true);
    const r = await apiComunidad.solicitudesGrupo(grupoId, userKey);
    setSols(Array.isArray(r?.data) ? r.data.filter((s) => s.estado === 'pendiente') : []);
    setCargandoSols(false);
  }, [grupoId, userKey]);

  useEffect(() => {
    if (!open || !puedeVerSols) return;
    cargarSolicitudes();
  }, [open, puedeVerSols, cargarSolicitudes]);

  useEffect(() => {
    if (!open) return;
    setCargando(true);
    setMsg('');
    setMembQ('');
    membQRef.current = '';
    setVista('info');
    setRolMiembro(null);
    setKickMiembro(null);
    setAddOpen(false);
    cargar();
  }, [open, cargar]);

  // Scroll progresivo: al acercarse al final se carga la siguiente página.
  function onScrollMiembros() {
    const el = bodyRef.current;
    if (!el || membCargandoRef.current || !membHayMasRef.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 320) {
      membCargandoRef.current = true;
      setCargandoMas(true);
      cargarPagina(membQRef.current, membOffsetRef.current);
    }
  }

  // Tiempo real: cambios del grupo (mensajes, uniones, kick, roles...).
  const ultimoRefrescoRef = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (!t.startsWith('comunidad_')) return;
      // Kick / unión / edición del grupo: refresco completo al instante.
      if (t === 'comunidad_join' || t === 'comunidad_grupo') {
        cargar();
        cargarPagina(membQRef.current, 0);
        if (puedeVerSols) cargarSolicitudes();
        return;
      }
      // El resto (presencia, mensajes...) con throttle para no saturar.
      const ahora = Date.now();
      if (ahora - ultimoRefrescoRef.current >= 2500) {
        ultimoRefrescoRef.current = ahora;
        cargar();
      }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [open, cargar, cargarPagina, cargarSolicitudes, puedeVerSols]);

  // ---- Modal de "agregar miembro": busqueda paginada (no satura) ----
  const buscarAgregables = useCallback(async (qTxt, off) => {
    if (!grupoId) return;
    const reqId = ++addReqRef.current;
    const r = await apiComunidad.agregablesGrupo(grupoId, { userKey, q: qTxt, offset: off, limit: 30 });
    if (reqId !== addReqRef.current) return; // una busqueda mas nueva gano
    const rows = Array.isArray(r?.data) ? r.data : [];
    setAddRows((prev) => (off === 0 ? rows : [...prev, ...rows]));
    addOffsetRef.current = off + rows.length;
    addMasRef.current = !!r?.hasMore;
    setAddMas(!!r?.hasMore);
    addCargandoRef.current = false;
    setAddCargandoMas(false);
    setAddCargando(false);
  }, [grupoId, userKey]);

  // Primera carga al abrir + busqueda con debounce.
  useEffect(() => {
    if (!addOpen) return undefined;
    const t = setTimeout(() => {
      setAddCargando(true);
      buscarAgregables(addQ, 0);
    }, addQ ? 300 : 60);
    return () => clearTimeout(t);
  }, [addOpen, addQ, buscarAgregables]);

  // Mientras el modal esta abierto no se scrollea la pagina de atras.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  async function guardar() {
    if (!puedeEditar) return;
    setGuardando(true);
    setMsg('');
    const body = { userKey };
    body.nombre = form.nombre;
    body.descripcion = form.descripcion;
    body.reglas = form.reglas;
    if (soyDueno) {
      body.privacidad = form.privacidad;
      body.chat_activo = form.chat_activo;
    }
    const r = await apiComunidad.actualizarGrupo(grupoId, body);
    setGuardando(false);
    if (r?.error) { setMsg(r.error); return; }
    if (r.grupo) setGrupo((g) => ({ ...(g || {}), ...r.grupo }));
    setMsg(es ? 'Guardado' : 'Saved');
  }

  async function subirAvatar(blob) {
    const f = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarPick(null);
    setSubiendoImg(true);
    setMsg('');
    const r = await apiComunidad.grupoAvatar(grupoId, userKey, f);
    setSubiendoImg(false);
    if (r?.error) { setMsg(r.error); return; }
    setGrupo((g) => ({ ...(g || {}), avatar: r.avatar }));
  }

  async function subirBanner(blob) {
    const f = new File([blob], 'banner.jpg', { type: 'image/jpeg' });
    setBannerPick(null);
    setSubiendoImg(true);
    setMsg('');
    const r = await apiComunidad.grupoBanner(grupoId, userKey, f);
    setSubiendoImg(false);
    if (r?.error) { setMsg(r.error); return; }
    setGrupo((g) => ({ ...(g || {}), banner: r.banner }));
  }

  // ---- Modal de rol/permisos (solo el dueño) ----
  function abrirRol(m) {
    setRolMiembro(m);
    setRolSel(m.rol || 'miembro');
    setRolPermisos(Array.isArray(m.permisos) ? m.permisos : []);
    setMsg('');
  }

  function togglePerm(id) {
    setRolPermisos((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function guardarRol() {
    if (!rolMiembro) return;
    setGuardandoRol(true);
    setMsg('');
    const ps = rolSel === 'semidueno' ? rolPermisos : [];
    const r = await apiComunidad.miembroRol(grupoId, rolMiembro.user_key, { userKey, rol: rolSel, permisos: ps });
    setGuardandoRol(false);
    if (r?.error) { setMsg(r.error); return; }
    setMiembros((list) => list.map((x) => (x.user_key === rolMiembro.user_key
      ? { ...x, rol: r.miembro?.rol || rolSel, permisos: r.miembro?.permisos || ps }
      : x)));
    setRolMiembro(null);
  }

  // ---- Solicitudes de entrada ----
  async function resolverSolicitud(solId, estado) {
    setMsg('');
    const r = await apiComunidad.resolverSolicitudGrupo(grupoId, solId, userKey, estado);
    if (r?.error) { setMsg(r.error); return; }
    cargarSolicitudes();
    if (estado === 'aprobado') {
      cargarPagina(membQRef.current, 0);
      cargar();
    }
  }

  async function quitar(mk) {
    setMsg('');
    const r = await apiComunidad.quitarMiembro(grupoId, mk, userKey);
    setKickMiembro(null);
    if (r?.error) { setMsg(r.error); return; }
    cargar();
  }

  // ---- Modal para agregar miembros ----
  function abrirAdd() {
    setAddQ('');
    addQRef.current = '';
    setAddOpen(true);
  }

  function onAddQ(v) {
    addQRef.current = v;
    setAddQ(v);
  }

  // Scroll progresivo dentro del modal: al llegar al final se pide la pagina 2.
  function onScrollAdd() {
    const el = addListRef.current;
    if (!el || addCargandoRef.current || !addMasRef.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      addCargandoRef.current = true;
      setAddCargandoMas(true);
      buscarAgregables(addQRef.current, addOffsetRef.current);
    }
  }

  async function agregarNuevo(mk) {
    setMsg('');
    const r = await apiComunidad.agregarMiembro(grupoId, userKey, mk);
    if (r?.error) { setMsg(r.error); return; }
    // Sale de los resultados al instante y se refrescan el chat y el conteo.
    setAddRows((cur) => cur.filter((x) => x.user_key !== mk));
    cargarPagina(membQRef.current, 0);
    cargar();
  }

  // ---- Salir del grupo (miembros y semiduenos) ----
  async function confirmarSalir() {
    if (accionBusy) return;
    setAccionBusy(true);
    setMsg('');
    // El mismo endpoint de unirse hace de toggle: siendo miembro, sale.
    const r = await apiComunidad.unirse(grupoId, userKey);
    setAccionBusy(false);
    setAccionGrupo(null);
    if (r?.error) { setMsg(r.error); return; }
    if (onSalirGrupo) onSalirGrupo();
  }

  // ---- Eliminar grupo (solo dueño; exige escribir "eliminar") ----
  async function confirmarEliminar() {
    if (accionBusy) return;
    if (txtEliminar.trim().toLowerCase() !== 'eliminar') return;
    setAccionBusy(true);
    setMsg('');
    const r = await apiComunidad.eliminarGrupo(grupoId, userKey);
    setAccionBusy(false);
    setAccionGrupo(null);
    if (r?.error) { setMsg(r.error); return; }
    if (onSalirGrupo) onSalirGrupo();
  }

  const privada = (grupo?.privacidad || form.privacidad) === 'privada';

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label={es ? 'Información del grupo' : 'Group info'}>
        <header className={styles.head}>
          <button type="button" className={styles.headBtn} onClick={onClose} aria-label={es ? 'Volver' : 'Back'}>
            <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
          </button>
          <strong className={styles.title}>{es ? 'Información del grupo' : 'Group info'}</strong>
          <button type="button" className={styles.headBtn} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </header>

        <div className={styles.body} ref={bodyRef} onScroll={onScrollMiembros}>
          {cargando && (
            <p className={styles.muted}>{es ? 'Cargando…' : 'Loading…'}</p>
          )}

          {!cargando && grupo && (
            <>
              {/* Portada */}
              <div
                className={`${styles.banner} ${puedeEditar ? styles.editable : ''}`}
                style={grupo.banner ? { backgroundImage: `url(${comunidadMedia(grupo.banner)})` } : undefined}
              >
                {puedeEditar && !grupo.banner && (
                  <button type="button" className={styles.bannerBtn} disabled={subiendoImg} onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => { const f = input.files?.[0]; if (f) setBannerPick(f); };
                    input.click();
                  }}>
                    <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Subir portada' : 'Upload cover'}
                  </button>
                )}
                {puedeEditar && grupo.banner && (
                  <button type="button" className={styles.bannerBtn2} disabled={subiendoImg} onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => { const f = input.files?.[0]; if (f) setBannerPick(f); };
                    input.click();
                  }}>
                    <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Portada' : 'Cover'}
                  </button>
                )}
              </div>

              {/* Foto + nombre */}
              <div className={styles.identity}>
                <div
                  className={`${styles.avatarWrap} ${puedeEditar ? styles.editable : ''}`}
                  onClick={puedeEditar && !subiendoImg ? () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => { const f = input.files?.[0]; if (f) setAvatarPick(f); };
                    input.click();
                  } : undefined}
                  role={puedeEditar ? 'button' : undefined}
                  tabIndex={puedeEditar ? 0 : undefined}
                  aria-label={puedeEditar ? (es ? 'Cambiar foto' : 'Change photo') : undefined}
                >
                  {grupo.avatar
                    ? <img src={comunidadMedia(grupo.avatar)} alt="" />
                    : <span>{ini(grupo.nombre)}</span>}
                </div>
                <div className={styles.names}>
                  <h2 className={styles.nombre}>{grupo.nombre}</h2>
                  <div className={styles.tags}>
                    <span className={privada ? styles.tagPriv : styles.tagPub}>
                      <ion-icon name={privada ? 'lock-closed-outline' : 'globe-outline'} suppressHydrationWarning></ion-icon>
                      {privada ? (es ? 'Privado' : 'Private') : (es ? 'Público' : 'Public')}
                    </span>
                    <span className={styles.tagRol}>
                      <ion-icon name="ribbon-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Tu rol: ' : 'Your role: '}{rolLabel(rol, es)}
                    </span>
                    <span className={styles.tagRol}>
                      <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                      {Number(grupo.miembros || 0).toLocaleString(es ? 'es-PE' : 'en-US')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cambio de vista: datos o solicitudes de entrada (admins). */}
              {puedeVerSols && (
                <div className={styles.tabs} role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={vista === 'info'}
                    className={`${styles.tab} ${vista === 'info' ? styles.tabOn : ''}`}
                    onClick={() => setVista('info')}
                  >
                    <ion-icon name="document-text-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Información' : 'Info'}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={vista === 'sols'}
                    className={`${styles.tab} ${vista === 'sols' ? styles.tabOn : ''}`}
                    onClick={() => setVista('sols')}
                  >
                    <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Solicitudes' : 'Requests'}
                    {sols.length > 0 && <span className={styles.tabBadge}>{sols.length}</span>}
                  </button>
                </div>
              )}

              {msg && <p className={styles.msg}>{msg}</p>}

              {vista === 'info' ? (
              <>
              {/* Datos / formulario */}
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <ion-icon name="document-text-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Datos del grupo' : 'Group details'}
                </h3>

                {puedeEditar ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>{es ? 'Nombre' : 'Name'}</span>
                      <input className={styles.input} value={form.nombre} maxLength={120}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>{es ? 'Descripción' : 'Description'}</span>
                      <textarea className={styles.input} rows={2} maxLength={500} value={form.descripcion}
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>{es ? 'Reglas' : 'Rules'}</span>
                      <textarea className={styles.input} rows={2} maxLength={1000} value={form.reglas}
                        onChange={(e) => setForm({ ...form, reglas: e.target.value })} />
                    </label>

                    {soyDueno && (
                      <>
                        <label className={styles.field}>
                          <span className={styles.label}>{es ? 'Privacidad' : 'Privacy'}</span>
                          <select className={styles.input} value={form.privacidad}
                            onChange={(e) => setForm({ ...form, privacidad: e.target.value })}>
                            <option value="publica">{es ? 'Pública' : 'Public'}</option>
                            <option value="privada">{es ? 'Privada' : 'Private'}</option>
                          </select>
                        </label>

                        <div className={styles.switchRow}>
                          <span className={styles.switchText}>
                            <ion-icon name="chatbubbles-outline" suppressHydrationWarning></ion-icon>
                            {es ? 'Envío de mensajes' : 'Message sending'}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={form.chat_activo}
                            className={`${styles.switch} ${form.chat_activo ? styles.switchOn : ''}`}
                            onClick={() => setForm({ ...form, chat_activo: !form.chat_activo })}
                          >
                            <span className={styles.knob} />
                          </button>
                        </div>
                        {!form.chat_activo && (
                          <p className={styles.hint}>
                            {es ? 'Nadie podrá enviar mensajes hasta que lo actives.' : 'Nobody can send messages until you enable it.'}
                          </p>
                        )}
                      </>
                    )}

                    <button type="button" className={styles.primaryBtn} onClick={guardar} disabled={guardando}>
                      <ion-icon name={guardando ? 'sync-outline' : 'save-outline'} suppressHydrationWarning></ion-icon>
                      {guardando ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar cambios' : 'Save changes')}
                    </button>
                  </>
                ) : (
                  <div className={styles.readonly}>
                    <p><b>{es ? 'Descripción' : 'Description'}:</b> {grupo.descripcion || (es ? 'Sin descripción.' : 'No description.')}</p>
                    <p><b>{es ? 'Reglas' : 'Rules'}:</b> {grupo.reglas || (es ? 'Sin reglas.' : 'No rules.')}</p>
                    <p><b>{es ? 'Chat de mensajes' : 'Chat'}:</b> {grupo.chat_activo !== false
                      ? (es ? 'Activo' : 'Active')
                      : (es ? 'Desactivado por el dueño' : 'Disabled by the owner')}</p>
                    {!puedeEditar && (
                      <p className={styles.hint}>{es ? 'Solo el dueño o un semidueño con permiso puede editar estos datos.' : 'Only the owner or a permitted co-owner can edit this data.'}</p>
                    )}
                  </div>
                )}

                {/* Acciones: salir o eliminar el grupo (siempre arriba,
                    sin tener que scrollear la lista de miembros). */}
                <div className={styles.dangerZone}>
                  {soyDueno ? (
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => { setTxtEliminar(''); setAccionGrupo('eliminar'); }}
                    >
                      <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Eliminar grupo' : 'Delete group'}
                    </button>
                  ) : esMiembro ? (
                    <button
                      type="button"
                      className={styles.leaveBtn}
                      onClick={() => setAccionGrupo('salir')}
                    >
                      <ion-icon name="exit-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Salir del grupo' : 'Leave group'}
                    </button>
                  ) : null}
                </div>
              </section>

              {/* Miembros */}
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Miembros' : 'Members'}
                  <span className={styles.count}>
                    {Number(grupo.miembros || 0).toLocaleString(es ? 'es-PE' : 'en-US')}
                  </span>
                  {puedeAgregar && (
                    <button
                      type="button"
                      className={styles.addBtn}
                      title={es ? 'Agregar miembro' : 'Add member'}
                      aria-label={es ? 'Agregar miembro' : 'Add member'}
                      onClick={abrirAdd}
                    >
                      <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Agregar' : 'Add'}
                    </button>
                  )}
                </h3>

                <input
                  className={styles.input}
                  placeholder={es ? 'Buscar miembro…' : 'Search member…'}
                  value={membQ}
                  onChange={(e) => { membQRef.current = e.target.value; setMembQ(e.target.value); }}
                />

                <ul className={styles.members}>
                  {miembros.map((m) => {
                    const esDuenoM = m.rol === 'dueno' || String(grupo.user_key) === String(m.user_key);
                    const est = presenciaEstado(m.edad, es);
                    const esYo = String(m.user_key) === String(userKey);
                    return (
                      <li key={m.user_key} className={styles.member}>
                        <span className={styles.mAvatar}>
                          {m.avatar
                            ? <img src={comunidadMedia(m.avatar)} alt="" />
                            : <span>{ini(m.nombre || m.usuario)}</span>}
                          <i className={`${styles.dot} ${est.online ? styles.dotOn : ''}`} />
                        </span>

                        <span className={styles.mInfo}>
                          <b>{m.nombre || m.usuario || (es ? 'Usuario' : 'User')}{esYo ? (es ? ' (tú)' : ' (you)') : ''}</b>
                          <span className={styles.mMeta}>
                            <em className={esDuenoM ? styles.rolDueno : m.rol === 'semidueno' ? styles.rolSemi : styles.rolMiembro}>
                              {rolLabel(m.rol, es)}
                            </em>
                            <span>{est.label}</span>
                          </span>
                        </span>

                        {/* Dueño: el botón de rol abre el modal de rol/permisos. */}
                        {soyDueno && !esDuenoM && (
                          <span className={styles.mActions}>
                            <button type="button" className={styles.roleBtn} onClick={() => abrirRol(m)}>
                              {rolLabel(m.rol, es)}
                              <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                            </button>
                            <button
                              type="button"
                              className={styles.kick}
                              title={es ? 'Expulsar' : 'Remove'}
                              aria-label={es ? 'Expulsar' : 'Remove'}
                              onClick={() => setKickMiembro(m)}
                            >
                              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                            </button>
                          </span>
                        )}

                        {/* Semidueño con permiso de expulsar: no al dueño, ni a sí mismo. */}
                        {!soyDueno && puedeEliminar && !esDuenoM && !esYo && (
                          <span className={styles.mActions}>
                            <button
                              type="button"
                              className={styles.kick}
                              title={es ? 'Expulsar' : 'Remove'}
                              aria-label={es ? 'Expulsar' : 'Remove'}
                              onClick={() => setKickMiembro(m)}
                            >
                              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {cargandoMiembros && miembros.length === 0 && (
                  <p className={styles.hint}>{es ? 'Cargando miembros…' : 'Loading members…'}</p>
                )}
                {!cargandoMiembros && miembros.length === 0 && (
                  <p className={styles.hint}>
                    {membQ ? (es ? 'Sin resultados.' : 'No results.') : (es ? 'Sin miembros.' : 'No members.')}
                  </p>
                )}
                {cargandoMas && (
                  <p className={styles.hint}>{es ? 'Cargando más…' : 'Loading more…'}</p>
                )}
                {!cargandoMas && hayMas && miembros.length > 0 && (
                  <p className={styles.hint}>{es ? 'Desliza para ver más miembros.' : 'Scroll to see more members.'}</p>
                )}
              </section>
              </>
              ) : (
              /* Solicitudes de entrada (solo admins con permiso). */
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>
                  <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Solicitudes de entrada' : 'Join requests'}
                  <span className={styles.count}>{sols.length}</span>
                </h3>

                {cargandoSols && (
                  <p className={styles.hint}>{es ? 'Cargando…' : 'Loading…'}</p>
                )}
                {!cargandoSols && sols.length === 0 && (
                  <p className={styles.hint}>{es ? 'No hay solicitudes pendientes.' : 'No pending requests.'}</p>
                )}

                <ul className={styles.members}>
                  {sols.map((s) => (
                    <li key={s.id} className={styles.member}>
                      <span className={styles.mAvatar}>
                        {s.avatar
                          ? <img src={comunidadMedia(s.avatar)} alt="" />
                          : <span>{ini(s.usuario || s.nombre_completo)}</span>}
                        <i className={styles.dot} />
                      </span>
                      <span className={styles.mInfo}>
                        <b>{s.usuario || s.nombre_completo || (es ? 'Usuario' : 'User')}</b>
                        <span className={styles.mMeta}>
                          <span className={styles.solMsg}>
                            {s.mensaje ? `“${String(s.mensaje).slice(0, 60)}”` : (es ? 'Sin mensaje' : 'No message')}
                          </span>
                        </span>
                      </span>
                      <span className={styles.mActions}>
                        <button type="button" className={styles.acceptBtn} onClick={() => resolverSolicitud(s.id, 'aprobado')}>
                          <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Aceptar' : 'Accept'}
                        </button>
                        <button type="button" className={styles.chip} onClick={() => resolverSolicitud(s.id, 'rechazado')}>
                          {es ? 'Rechazar' : 'Reject'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              )}
            </>
          )}
        </div>

        {/* Modal de rol y permisos (solo el dueño). */}
        {rolMiembro && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setRolMiembro(null); }}
          >
            <div className={styles.rolModal} role="dialog" aria-modal="true" aria-label={es ? 'Rol y permisos' : 'Role and permissions'}>
              <div className={styles.rolHead}>
                <strong>{es ? 'Rol y permisos' : 'Role & permissions'}</strong>
                <button type="button" className={styles.headBtn} onClick={() => setRolMiembro(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>

              <div className={styles.rolBody}>
                <p className={styles.rolUser}>
                  <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
                  {rolMiembro.nombre || rolMiembro.usuario || (es ? 'Usuario' : 'User')}
                </p>

                <div className={styles.roleOptions}>
                  <button
                    type="button"
                    className={`${styles.roleOpt} ${rolSel === 'miembro' ? styles.roleOptOn : ''}`}
                    onClick={() => { setRolSel('miembro'); setRolPermisos([]); }}
                  >
                    <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
                    <b>{es ? 'Miembro' : 'Member'}</b>
                    <span>{es ? 'Solo participa: ve y escribe.' : 'Only participates: reads and writes.'}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.roleOpt} ${rolSel === 'semidueno' ? styles.roleOptOn : ''}`}
                    onClick={() => setRolSel('semidueno')}
                  >
                    <ion-icon name="ribbon-outline" suppressHydrationWarning></ion-icon>
                    <b>{es ? 'Semidueño' : 'Co-owner'}</b>
                    <span>{es ? 'Ayuda a moderar según los permisos.' : 'Helps moderate per permissions.'}</span>
                  </button>
                </div>

                {rolSel === 'semidueno' && (
                  <div className={styles.permList}>
                    <p className={styles.permTitle}>{es ? 'Qué puede hacer:' : 'What they can do:'}</p>
                    {PERMISOS.map((pp) => {
                      const on = rolPermisos.includes(pp.id);
                      return (
                        <button
                          key={pp.id}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          className={styles.permRow}
                          onClick={() => togglePerm(pp.id)}
                        >
                          <span className={styles.permIcon}>
                            <ion-icon name={pp.icon} suppressHydrationWarning></ion-icon>
                          </span>
                          <span className={styles.permText}>
                            <b>{es ? pp.es : pp.en}</b>
                            <small>{es ? pp.desEs : pp.desEn}</small>
                          </span>
                          <span className={`${styles.switch} ${on ? styles.switchOn : ''}`}>
                            <span className={styles.knob} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className={styles.rolActions}>
                  <button type="button" className={styles.ghostBtn} onClick={() => setRolMiembro(null)}>
                    {es ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={guardarRol} disabled={guardandoRol}>
                    <ion-icon name={guardandoRol ? 'sync-outline' : 'save-outline'} suppressHydrationWarning></ion-icon>
                    {guardandoRol ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: salir del grupo o eliminarlo (escribir "eliminar"). */}
        {accionGrupo && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setAccionGrupo(null); }}
          >
            <div className={styles.rolModal} role="dialog" aria-modal="true" aria-label={accionGrupo === 'eliminar' ? (es ? 'Eliminar grupo' : 'Delete group') : (es ? 'Salir del grupo' : 'Leave group')}>
              <div className={styles.rolHead}>
                <strong>
                  {accionGrupo === 'eliminar'
                    ? (es ? 'Eliminar grupo' : 'Delete group')
                    : (es ? 'Salir del grupo' : 'Leave group')}
                </strong>
                <button type="button" className={styles.headBtn} onClick={() => setAccionGrupo(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>

              <div className={styles.rolBody}>
                {accionGrupo === 'salir' ? (
                  <>
                    <p className={styles.kickText}>
                      {es
                        ? `¿Seguro que quieres salir de ${grupo?.nombre || 'este grupo'}? Dejarás de ver sus mensajes, publicaciones y llamadas${
                            privada ? '. Para volver deberás pedir una nueva invitación.' : '. Si el grupo es público podrás volver a unirte.'}`
                        : `Are you sure you want to leave ${grupo?.nombre || 'this group'}? You will stop seeing its messages, posts and calls${
                            privada ? '. To come back you will need a new invitation.' : '. If the group is public you can rejoin.'}`}
                    </p>
                    <div className={styles.rolActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => setAccionGrupo(null)}>
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                      <button type="button" className={styles.kickBtn} onClick={confirmarSalir} disabled={accionBusy}>
                        <ion-icon name={accionBusy ? 'sync-outline' : 'exit-outline'} suppressHydrationWarning></ion-icon>
                        {accionBusy ? (es ? 'Saliendo…' : 'Leaving…') : (es ? 'Salir' : 'Leave')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.kickText}>
                      {es
                        ? `Esta acción es permanente: ${grupo?.nombre || 'el grupo'} se ocultará para todos sus miembros y nadie podrá volver a verlo.`
                        : `This action is permanent: ${grupo?.nombre || 'the group'} will be hidden from all its members and nobody can see it again.`}
                    </p>
                    <label className={styles.field}>
                      <span className={styles.label}>{es ? 'Escribe "eliminar" para confirmar' : 'Type "delete" to confirm'}</span>
                      <input
                        className={styles.input}
                        value={txtEliminar}
                        onChange={(e) => setTxtEliminar(e.target.value)}
                        placeholder="eliminar"
                        autoFocus
                      />
                    </label>
                    <div className={styles.rolActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => setAccionGrupo(null)}>
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        className={styles.kickBtn}
                        onClick={confirmarEliminar}
                        disabled={accionBusy || txtEliminar.trim().toLowerCase() !== 'eliminar'}
                      >
                        <ion-icon name={accionBusy ? 'sync-outline' : 'trash-outline'} suppressHydrationWarning></ion-icon>
                        {accionBusy ? (es ? 'Eliminando…' : 'Deleting…') : (es ? 'Eliminar' : 'Delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmación de expulsión. */}
        {kickMiembro && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setKickMiembro(null); }}
          >
            <div className={styles.rolModal} role="dialog" aria-modal="true" aria-label={es ? 'Expulsar del grupo' : 'Remove from group'}>
              <div className={styles.rolHead}>
                <strong>{es ? 'Expulsar del grupo' : 'Remove from group'}</strong>
                <button type="button" className={styles.headBtn} onClick={() => setKickMiembro(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>

              <div className={styles.rolBody}>
                <div className={styles.kickUser}>
                  <span className={styles.mAvatar}>
                    {kickMiembro.avatar
                      ? <img src={comunidadMedia(kickMiembro.avatar)} alt="" />
                      : <span>{ini(kickMiembro.nombre || kickMiembro.usuario)}</span>}
                  </span>
                  <span className={styles.mInfo}>
                    <b>{kickMiembro.nombre || kickMiembro.usuario || (es ? 'Usuario' : 'User')}</b>
                    <span className={styles.mMeta}>{es ? 'Miembro del grupo' : 'Group member'}</span>
                  </span>
                </div>

                <p className={styles.kickText}>
                  {es
                    ? `¿Seguro que quieres expulsar a ${kickMiembro.nombre || kickMiembro.usuario || 'este usuario'}? ${
                        soyDueno
                          ? (grupo?.privacidad === 'privada'
                            ? 'No podrá volver a unirse sin una nueva solicitud.'
                            : 'Si el grupo es público podrá volver a unirse.')
                          : 'Podrá volver si el dueño lo permite.'}`
                    : `Are you sure you want to remove ${
                        kickMiembro.nombre || kickMiembro.usuario || 'this user'
                      }? ${
                        soyDueno
                          ? (grupo?.privacidad === 'privada'
                            ? 'They cannot rejoin without a new request.'
                            : 'If the group is public they can rejoin.')
                          : 'They can come back if the owner allows it.'}`}
                </p>

                <div className={styles.rolActions}>
                  <button type="button" className={styles.ghostBtn} onClick={() => setKickMiembro(null)}>
                    {es ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button type="button" className={styles.kickBtn} onClick={() => quitar(kickMiembro.user_key)}>
                    <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Expulsar' : 'Remove'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal para agregar miembros: busqueda con scroll progresivo. */}
        {addOpen && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}
          >
            <div className={styles.rolModal} role="dialog" aria-modal="true" aria-label={es ? 'Agregar miembro' : 'Add member'}>
              <div className={styles.rolHead}>
                <strong>{es ? 'Agregar miembro' : 'Add member'}</strong>
                <button type="button" className={styles.headBtn} onClick={() => setAddOpen(false)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>

              <div className={styles.rolBody}>
                <input
                  className={styles.input}
                  autoFocus
                  placeholder={es ? 'Buscar por nombre o usuario…' : 'Search by name or username…'}
                  value={addQ}
                  onChange={(e) => onAddQ(e.target.value)}
                />

                <div className={styles.addList} ref={addListRef} onScroll={onScrollAdd}>
                  {addCargando && addRows.length === 0 && (
                    <p className={styles.hint}>{es ? 'Buscando…' : 'Searching…'}</p>
                  )}
                  {!addCargando && addRows.length === 0 && (
                    <p className={styles.hint}>{es ? 'Sin resultados.' : 'No results.'}</p>
                  )}

                  {addRows.map((u) => (
                    <div key={u.user_key} className={styles.addRow}>
                      <span className={styles.mAvatar}>
                        {u.avatar
                          ? <img src={comunidadMedia(u.avatar)} alt="" />
                          : <span>{ini(u.nombre || u.usuario)}</span>}
                      </span>
                      <span className={styles.mInfo}>
                        <b>{u.nombre || u.usuario || (es ? 'Usuario' : 'User')}</b>
                        <span className={styles.mMeta}>@{u.usuario}</span>
                      </span>
                      <button type="button" className={styles.acceptBtn} onClick={() => agregarNuevo(u.user_key)}>
                        <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'Agregar' : 'Add'}
                      </button>
                    </div>
                  ))}

                  {addCargandoMas && (
                    <p className={styles.hint}>{es ? 'Cargando más…' : 'Loading more…'}</p>
                  )}
                  {!addCargandoMas && addMas && addRows.length > 0 && (
                    <p className={styles.hint}>{es ? 'Desliza para ver más.' : 'Scroll to see more.'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <ImageCropModal
          open={!!avatarPick}
          file={avatarPick}
          shape="circle"
          title={es ? 'Ajusta la foto del grupo' : 'Adjust the group photo'}
          subtitle={es ? 'Arrastra y usa el zoom para encuadrarla.' : 'Drag and zoom to frame it.'}
          onCancel={() => setAvatarPick(null)}
          onSave={subirAvatar}
        />
        <ImageCropModal
          open={!!bannerPick}
          file={bannerPick}
          shape="banner"
          outputSize={1600}
          title={es ? 'Ajusta la portada' : 'Adjust the cover'}
          subtitle={es ? 'Arrastra la imagen y usa el zoom.' : 'Drag and zoom.'}
          onCancel={() => setBannerPick(null)}
          onSave={subirBanner}
        />
      </aside>
    </div>,
    document.body
  );
}
