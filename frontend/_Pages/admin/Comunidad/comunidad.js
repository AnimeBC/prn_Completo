'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './comunidad.module.css';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { fecha } from '@/_Extras/Fecha/fecha.js';

const TABS = [
  { id: 'grupos', label: 'Comunidades', icon: 'people-outline' },
  { id: 'posts', label: 'Publicaciones', icon: 'grid-outline' },
  { id: 'chats', label: 'Chats', icon: 'chatbubbles-outline' },
  { id: 'stories', label: 'Historias', icon: 'albums-outline' },
  { id: 'solicitudes', label: 'Solicitudes', icon: 'person-add-outline' },
  { id: 'usuarios', label: 'Usuarios', icon: 'person-circle-outline' },
  { id: 'reportes', label: 'Reportes', icon: 'flag-outline' },
];

export default function AdminComunidad() {
  const [tab, setTab] = useState('grupos');
  const [resumen, setResumen] = useState({});
  const [grupos, setGrupos] = useState([]);
  const [solicitudesPend, setSolicitudesPend] = useState([]);
  const [posts, setPosts] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [stories, setStories] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [uQ, setUQ] = useState('');
  const [uRol, setURol] = useState('');
  const [uPage, setUPage] = useState(1);
  const [uPages, setUPages] = useState(1);
  const [uTotal, setUTotal] = useState(0);
  const [q, setQ] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cargarResumen = useCallback(async () => {
    const r = await apiComunidad.adminResumen();
    if (!r.error) setResumen(r);
  }, []);

  const cargarGrupos = useCallback(async () => {
    const [r, s] = await Promise.all([
      apiComunidad.adminGrupos(),
      apiComunidad.adminSolicitudes('pendiente'),
    ]);
    if (Array.isArray(r.data)) setGrupos(r.data);
    if (Array.isArray(s.data)) setSolicitudesPend(s.data);
  }, []);

  const cargar = useCallback(async () => {
    setError(''); setMsg('');
    if (tab === 'grupos') return cargarGrupos();
    if (tab === 'posts') {
      const r = await apiComunidad.adminPosts(q, grupoFiltro || null, 1);
      if (Array.isArray(r.data)) setPosts(r.data);
      return;
    }
    if (tab === 'chats') {
      const r = await apiComunidad.adminMensajes(q, grupoFiltro || null);
      if (Array.isArray(r.data)) setMensajes(r.data);
      return;
    }
    if (tab === 'stories') {
      const r = await apiComunidad.adminStories();
      if (Array.isArray(r.data)) setStories(r.data);
      return;
    }
    if (tab === 'solicitudes') {
      const r = await apiComunidad.adminSolicitudes('');
      if (Array.isArray(r.data)) setSolicitudes(r.data);
      return;
    }
    if (tab === 'usuarios') {
      const r = await apiComunidad.adminUsuarios(uQ, uRol, uPage);
      if (Array.isArray(r.data)) setUsuarios(r.data);
      setUTotal(r.total || 0);
      setUPages(r.pages || 1);
      return;
    }
    if (tab === 'reportes') {
      const r = await apiComunidad.adminReportes(estadoFiltro);
      if (Array.isArray(r.data)) setReportes(r.data);
    }
  }, [tab, q, grupoFiltro, estadoFiltro, uQ, uRol, uPage, cargarGrupos]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarGrupo(g, cambios) {
    setBusy(true); setError(''); setMsg('');
    const r = await apiComunidad.adminGuardarGrupo(g.id, cambios);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setMsg(`Comunidad «${g.nombre}» actualizada.`);
    cargarGrupos();
  }

  async function borrarPost(p) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminBorrarPost(p.id);
    if (r.error) { setError(r.error); return; }
    setMsg('Publicación eliminada.');
    setPosts((list) => list.filter((x) => x.id !== p.id));
    cargarResumen();
  }

  async function borrarMensaje(m) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminBorrarMensaje(m.id);
    if (r.error) { setError(r.error); return; }
    setMsg('Mensaje eliminado.');
    setMensajes((list) => list.filter((x) => x.id !== m.id));
  }

  async function borrarStory(s) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminBorrarStory(s.id);
    if (r.error) { setError(r.error); return; }
    setMsg('Historia eliminada.');
    setStories((list) => list.filter((x) => x.id !== s.id));
  }

  async function resolverReporte(rep, estado) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminResolverReporte(rep.id, { estado });
    if (r.error) { setError(r.error); return; }
    setMsg('Reporte actualizado.');
    setReportes((list) => list.map((x) => (x.id === rep.id ? { ...x, estado } : x)));
    cargarResumen();
  }

  async function resolverSolicitud(s, estado) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminResolverSolicitud(s.id, estado);
    if (r.error) { setError(r.error); return; }
    setMsg('Solicitud actualizada.');
    setSolicitudes((list) => list.map((x) => (x.id === s.id ? { ...x, estado } : x)));
    cargarResumen();
  }

  async function resolverSolGrupo(s, estado) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminResolverSolicitud(s.id, estado);
    if (r.error) { setError(r.error); return; }
    setMsg(estado === 'aprobado' ? 'Usuario aceptado en el grupo.' : 'Solicitud rechazada.');
    cargarGrupos();
    cargarResumen();
  }

  async function guardarLimite(u, subida_mb) {
    setError(''); setMsg('');
    const r = await apiComunidad.adminGuardarUsuario(u.id, subida_mb);
    if (r.error) { setError(r.error); return; }
    setMsg('Límite de subida actualizado.');
    setUsuarios((list) => list.map((x) => (x.id === u.id ? { ...x, subida_mb: r.subida_mb } : x)));
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
          Controlar comunidad
        </h2>
        <p className={styles.sub}>
          Revisa TODAS las comunidades, publicaciones, chats e historias. Aquí moderas contenido
          inapropiado, cambias reglas y privacidad de cada grupo y gestionas las denuncias.
        </p>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.grupos ?? '-'}</span><span className={styles.statLabel}>Comunidades</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.posts ?? '-'}</span><span className={styles.statLabel}>Publicaciones</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.mensajes ?? '-'}</span><span className={styles.statLabel}>Mensajes</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.stories ?? '-'}</span><span className={styles.statLabel}>Historias</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.reportes ?? '-'}</span><span className={styles.statLabel}>Reportes</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.solicitudes ?? '-'}</span><span className={styles.statLabel}>Solicitudes</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{resumen.enLinea ?? '-'}</span><span className={styles.statLabel}>En línea</span></div>
      </div>

      {error && <p className={styles.err}>{error}</p>}
      {msg && <p className={styles.ok}>{msg}</p>}

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`} onClick={() => setTab(t.id)}>
            <ion-icon name={t.icon} suppressHydrationWarning></ion-icon>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'posts' || tab === 'chats') && (
        <div className={styles.toolbar}>
          <input className={styles.input} placeholder="Buscar por usuario o texto..." value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') cargar(); }} />
          <select className={styles.select} value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
            <option value="">Todas las comunidades</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <button type="button" className={styles.btn} onClick={cargar}>
            <ion-icon name="search-outline" suppressHydrationWarning></ion-icon> Buscar
          </button>
        </div>
      )}

      {tab === 'reportes' && (
        <div className={styles.toolbar}>
          <select className={styles.select} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="revisado">Revisados</option>
            <option value="descartado">Descartados</option>
          </select>
          <button type="button" className={styles.btn} onClick={cargar}>Filtrar</button>
        </div>
      )}

      {tab === 'usuarios' && (
        <div className={styles.toolbar}>
          <input
            className={styles.input}
            placeholder="Buscar usuario, nombre o correo..."
            value={uQ}
            onChange={(e) => { setUQ(e.target.value); setUPage(1); }}
          />
          <select className={styles.select} value={uRol} onChange={(e) => { setURol(e.target.value); setUPage(1); }}>
            <option value="">Todos los roles</option>
            <option value="user">Usuarios</option>
            <option value="admin">Admins</option>
          </select>
          <button type="button" className={styles.btn} onClick={cargar}>
            <ion-icon name="search-outline" suppressHydrationWarning></ion-icon> Buscar
          </button>
        </div>
      )}

      <div className={styles.panel}>
        {tab === 'grupos' && (
          grupos.length === 0 ? <p className={styles.empty}>Sin comunidades.</p> : grupos.map((g) => (
            <GrupoRow
              key={g.id}
              g={g}
              busy={busy}
              onSave={guardarGrupo}
              solicitudes={solicitudesPend.filter((s) => s.comunidad_id === g.id)}
              onResolver={resolverSolGrupo}
            />
          ))
        )}

        {tab === 'posts' && (
          posts.length === 0 ? <p className={styles.empty}>Sin publicaciones.</p> : posts.map((p) => (
            <div key={p.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <strong>{p.usuario}</strong>
                  {p.grupo_nombre && <span className={styles.tag}>{p.grupo_nombre}</span>}
                  <span className={styles.time}>{fecha(p.created_at, 'es')}</span>
                </div>
                {p.texto && <p className={styles.text}>{p.texto}</p>}
                {Array.isArray(p.media) && p.media.length > 0 && (
                  <div className={styles.media}>
                    {p.media.slice(0, 4).map((m, i) => (
                      <span key={i} className={styles.mediaItem}>
                        {m.tipo === 'video'
                          ? <video src={comunidadMedia(m.url)} controls preload="metadata" />
                          : m.tipo === 'audio'
                            ? <audio src={comunidadMedia(m.url)} controls />
                            : <img src={comunidadMedia(m.url)} alt="" loading="lazy" />}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className={styles.btnDanger} onClick={() => borrarPost(p)} title="Eliminar">
                <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
          ))
        )}

        {tab === 'chats' && (
          mensajes.length === 0 ? <p className={styles.empty}>Sin mensajes.</p> : mensajes.map((m) => (
            <div key={m.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <strong>{m.usuario}</strong>
                  {m.grupo_nombre && <span className={styles.tag}>{m.grupo_nombre}</span>}
                  <span className={styles.time}>{fecha(m.created_at, 'es')}</span>
                </div>
                {m.texto && <p className={styles.text}>{m.texto}</p>}
                {m.media && m.tipo === 'foto' && <img className={styles.chatMedia} src={comunidadMedia(m.media)} alt="" />}
                {m.media && m.tipo === 'video' && <video className={styles.chatMedia} src={comunidadMedia(m.media)} controls />}
                {m.media && m.tipo === 'audio' && <audio src={comunidadMedia(m.media)} controls />}
              </div>
              <button type="button" className={styles.btnDanger} onClick={() => borrarMensaje(m)} title="Eliminar">
                <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
          ))
        )}

        {tab === 'stories' && (
          stories.length === 0 ? <p className={styles.empty}>Sin historias.</p> : stories.map((s) => (
            <div key={s.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <strong>{s.usuario}</strong>
                  <span className={styles.tag}>{s.tipo}</span>
                  <span className={styles.time}>{fecha(s.created_at, 'es')}</span>
                  <span className={styles.time}>· {s.vistas} vistas</span>
                </div>
                <div className={styles.media}>
                  {s.media && (s.tipo === 'video'
                    ? <video className={styles.mediaItem} src={comunidadMedia(s.media)} controls />
                    : <img className={styles.mediaItem} src={comunidadMedia(s.media)} alt="" />)}
                  {s.texto && <p className={styles.text}>{s.texto}</p>}
                </div>
              </div>
              <button type="button" className={styles.btnDanger} onClick={() => borrarStory(s)} title="Eliminar">
                <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
          ))
        )}

        {tab === 'solicitudes' && (
          solicitudes.length === 0 ? <p className={styles.empty}>Sin solicitudes.</p> : solicitudes.map((s) => (
            <div key={s.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <strong>{s.usuario || s.user_key}</strong>
                  {s.grupo_nombre && <span className={styles.tag}>{s.grupo_nombre}</span>}
                  <span className={styles.time}>{fecha(s.created_at, 'es')}</span>
                  <span className={`${styles.estado} ${styles['estado_' + (s.estado === 'aprobado' ? 'revisado' : s.estado === 'rechazado' ? 'descartado' : 'pendiente')] || ''}`}>{s.estado}</span>
                </div>
                {s.mensaje && <p className={styles.text}>{s.mensaje}</p>}
              </div>
              <div className={styles.rowActions}>
                <button type="button" className={styles.btn} onClick={() => resolverSolicitud(s, 'aprobado')}>Aprobar</button>
                <button type="button" className={styles.btnGhost} onClick={() => resolverSolicitud(s, 'rechazado')}>Rechazar</button>
              </div>
            </div>
          ))
        )}

        {tab === 'reportes' && (
          reportes.length === 0 ? <p className={styles.empty}>Sin reportes.</p> : reportes.map((rep) => (
            <div key={rep.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowHead}>
                  <span className={styles.tag}>{rep.tipo}</span>
                  <strong>#{rep.target_id}</strong>
                  <span className={styles.time}>{rep.motivo || 'sin motivo'}</span>
                  <span className={styles.time}>{fecha(rep.created_at, 'es')}</span>
                  <span className={`${styles.estado} ${styles['estado_' + rep.estado] || ''}`}>{rep.estado}</span>
                </div>
                {rep.detalle && <p className={styles.text}>{rep.detalle}</p>}
              </div>
              <div className={styles.rowActions}>
                <button type="button" className={styles.btn} onClick={() => resolverReporte(rep, 'revisado')}>Revisado</button>
                <button type="button" className={styles.btnGhost} onClick={() => resolverReporte(rep, 'descartado')}>Descartar</button>
              </div>
            </div>
          ))
        )}

        {tab === 'usuarios' && (
          <>
            {usuarios.length === 0 ? <p className={styles.empty}>Sin usuarios.</p> : usuarios.map((u) => (
              <UsuarioRow key={u.id} u={u} onSave={guardarLimite} />
            ))}
            {uPages > 1 && (
              <div className={styles.pager}>
                <button type="button" className={styles.btnGhost} disabled={uPage <= 1} onClick={() => setUPage((p) => Math.max(1, p - 1))}>‹ Anterior</button>
                <span className={styles.time}>Página {uPage} / {uPages} · {uTotal} usuarios</span>
                <button type="button" className={styles.btnGhost} disabled={uPage >= uPages} onClick={() => setUPage((p) => Math.min(uPages, p + 1))}>Siguiente ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GrupoRow({ g, busy, onSave, solicitudes = [], onResolver }) {
  const [reglas, setReglas] = useState(g.reglas || '');
  const [privacidad, setPrivacidad] = useState(g.privacidad || 'publica');
  const [modoUnion, setModoUnion] = useState(g.modo_union || 'libre');
  const [destacado, setDestacado] = useState(!!g.destacado);
  const [activo, setActivo] = useState(!!g.activo);

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <strong>{g.nombre}</strong>
          <span className={styles.tag}>{g.miembros} miembros</span>
          <span className={styles.tag}>{g.posts} posts</span>
          <span className={styles.tag}>{g.mensajes} msj</span>
          {!g.activo && <span className={styles.estadoInactivo}>Inactiva</span>}
        </div>
        <div className={styles.grupoForm}>
          <textarea className={styles.textarea} rows={2} placeholder="Reglas de la comunidad" value={reglas}
            onChange={(e) => setReglas(e.target.value)} />
          <select className={styles.select} value={privacidad} onChange={(e) => setPrivacidad(e.target.value)}>
            <option value="publica">Pública</option>
            <option value="privada">Privada</option>
          </select>
          <select className={styles.select} value={modoUnion} onChange={(e) => setModoUnion(e.target.value)}>
            <option value="libre">Unirse directo</option>
            <option value="invitacion">Con invitación</option>
          </select>
          <label className={styles.check}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activa
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={destacado} onChange={(e) => setDestacado(e.target.checked)} /> Destacada / VIP
          </label>
        </div>

        {solicitudes.length > 0 && (
          <div className={styles.solList}>
            <span className={styles.solTitle}>
              <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
              Solicitudes pendientes ({solicitudes.length})
            </span>
            {solicitudes.map((s) => (
              <div key={s.id} className={styles.solItem}>
                <div className={styles.solInfo}>
                  <strong>{s.usuario || s.user_key}</strong>
                  {s.mensaje && <span className={styles.solMsg}>{s.mensaje}</span>}
                </div>
                <div className={styles.rowActions}>
                  <button type="button" className={styles.btn} onClick={() => onResolver(s, 'aprobado')}>Aceptar</button>
                  <button type="button" className={styles.btnGhost} onClick={() => onResolver(s, 'rechazado')}>Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.rowActions}>
        <button type="button" className={styles.btn} disabled={busy}
          onClick={() => onSave(g, { reglas, privacidad, modo_union: modoUnion, activo, destacado })}>
          <ion-icon name="save-outline" suppressHydrationWarning></ion-icon> Guardar
        </button>
      </div>
    </div>
  );
}

function UsuarioRow({ u, onSave }) {
  const [modo, setModo] = useState(
    u.subida_mb === null || u.subida_mb === undefined ? 'std' : u.subida_mb === -1 ? 'inf' : 'custom'
  );
  const [mb, setMb] = useState(u.subida_mb && u.subida_mb > 0 ? String(u.subida_mb) : '500');
  const etiqueta = (u.subida_mb === null || u.subida_mb === undefined)
    ? 'Estándar (200 MB)'
    : u.subida_mb === -1 ? 'Sin límite' : `${u.subida_mb} MB`;

  function guardar() {
    const val = modo === 'std' ? null : modo === 'inf' ? -1 : (Number(mb) || null);
    onSave(u, val);
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          <strong>{u.usuario || u.nombre || u.email || u.user_key}</strong>
          <span className={styles.tag}>{u.rol}</span>
          <span className={styles.tag}>Límite: {etiqueta}</span>
          {u.email && <span className={styles.time}>{u.email}</span>}
          {u.email_verified
            ? <span className={styles.tag}>verificado</span>
            : <span className={styles.estadoInactivo}>no verificado</span>}
        </div>
        <div className={styles.grupoForm}>
          <select className={styles.select} value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="std">Estándar (200 MB)</option>
            <option value="inf">Sin límite</option>
            <option value="custom">Personalizado (MB)</option>
          </select>
          {modo === 'custom' && (
            <input className={styles.input} type="number" min="1" value={mb} onChange={(e) => setMb(e.target.value)} placeholder="MB" />
          )}
          <button type="button" className={styles.btn} onClick={guardar}>
            <ion-icon name="save-outline" suppressHydrationWarning></ion-icon> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
