'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './grupoDetalle.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { fecha } from '@/_Extras/Fecha/fecha.js';

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

export default function GrupoDetalle({ id, initialGrupo = null }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [grupo, setGrupo] = useState(initialGrupo);
  const [soyMiembro, setSoyMiembro] = useState(false);
  const [solicitud, setSolicitud] = useState(null);
  const [rol, setRol] = useState(null);
  const [soyDueno, setSoyDueno] = useState(false);
  const [posts, setPosts] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('conversacion');
  const [confirmar, setConfirmar] = useState(null); // 'entrar' | 'cancelar' | 'salir'

  const cargarGrupo = useCallback(async () => {
    const r = await apiComunidad.grupo(id, userKey);
    if (r && r.grupo) setGrupo(r.grupo);
    setSoyMiembro(!!r?.soyMiembro);
    setSolicitud(r?.solicitud || null);
    setRol(r?.rol || null);
    setSoyDueno(!!r?.soyDueno);
  }, [id, userKey]);

  // id numerico real (por si la URL trae slug).
  const grupoId = grupo?.id;

  const cargarPosts = useCallback(async () => {
    if (!grupoId) return;
    setCargando(true);
    const r = await apiComunidad.feed('recientes', userKey, grupoId);
    setPosts(Array.isArray(r?.data) ? r.data : []);
    setCargando(false);
  }, [grupoId, userKey]);

  useEffect(() => { cargarGrupo(); }, [cargarGrupo]);
  useEffect(() => { cargarPosts(); }, [cargarPosts]);

  // Lee ?tab= de la URL al entrar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t0 = new URLSearchParams(window.location.search).get('tab');
    if (t0 && ['conversacion', 'informacion', 'miembros'].includes(t0)) setTab(t0);
  }, []);

  // Refleja la pestaña activa en la URL (?tab=...).
  function cambiarTab(t) {
    setTab(t);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.pathname + url.search);
  }

  // Realtime
  useEffect(() => {
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (tipo.startsWith('comunidad_')) { cargarGrupo(); cargarPosts(); }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargarGrupo, cargarPosts]);

  function requiereAprobacion(g) {
    return g?.privacidad === 'privada' || g?.modo_union === 'invitacion';
  }

  // Pide confirmacion antes de entrar, cancelar o salir.
  function pedirConfirmacion(accion) {
    if (accion === 'entrar' && !authed) { router.push('/perfil'); return; }
    setConfirmar(accion);
  }

  async function unirse() {
    setConfirmar(null);
    if (!authed) { router.push('/perfil'); return; }
    if (!grupoId) return;
    const r = await apiComunidad.unirse(grupoId, userKey);
    if (r.error) { setMsg(r.error); return; }
    if (r.pending) { setMsg(es ? 'Solicitud enviada.' : 'Request sent.'); }
    cargarGrupo();
  }

  async function cancelarSolicitud() {
    setConfirmar(null);
    if (!grupoId) return;
    const r = await apiComunidad.unirse(grupoId, userKey, '', 'cancelar');
    if (r.error) { setMsg(r.error); return; }
    setMsg(es ? 'Solicitud cancelada.' : 'Request canceled.');
    cargarGrupo();
  }

  async function salirGrupo() {
    setConfirmar(null);
    if (!grupoId) return;
    const r = await apiComunidad.unirse(grupoId, userKey);
    if (r.error) { setMsg(r.error); return; }
    cargarGrupo();
  }

  // Configuracion del modal segun la accion.
  const confirmCfg = (() => {
    if (confirmar === 'entrar') {
      return {
        titulo: requiereAprobacion(grupo) ? (es ? 'Pedir entrar' : 'Ask to join') : (es ? 'Unirme al grupo' : 'Join group'),
        texto: requiereAprobacion(grupo)
          ? (es ? 'Se enviará una solicitud a los administradores. ¿Continuar?' : 'A request will be sent to the admins. Continue?')
          : (es ? '¿Seguro que quieres unirte a este grupo?' : 'Are you sure you want to join this group?'),
        ok: es ? 'Confirmar' : 'Confirm',
        run: unirse,
      };
    }
    if (confirmar === 'cancelar') {
      return {
        titulo: es ? 'Cancelar solicitud' : 'Cancel request',
        texto: es ? '¿Seguro que quieres cancelar tu solicitud para entrar?' : 'Are you sure you want to cancel your join request?',
        ok: es ? 'Cancelar solicitud' : 'Cancel request',
        run: cancelarSolicitud,
      };
    }
    if (confirmar === 'salir') {
      return {
        titulo: es ? 'Salir del grupo' : 'Leave group',
        texto: es ? '¿Seguro que quieres salir de este grupo?' : 'Are you sure you want to leave this group?',
        ok: es ? 'Salir' : 'Leave',
        run: salirGrupo,
      };
    }
    return null;
  })();

  function abrirChat() {
    if (!grupoId) return;
    router.push(`/chat?conv=${encodeURIComponent(grupo?.slug || grupoId)}`);
  }

  async function subirFoto(tipo, file) {
    if (!file || !userKey || !grupoId) return;
    const r = tipo === 'banner'
      ? await apiComunidad.grupoBanner(grupoId, userKey, file)
      : await apiComunidad.grupoAvatar(grupoId, userKey, file);
    if (r?.error) { setMsg(r.error); return; }
    cargarGrupo();
  }

  const portada = grupo ? (grupo.banner || grupo.avatar) : null;
  const esPublico = grupo?.privacidad !== 'privada' && grupo?.modo_union !== 'invitacion';
  const esPrivado = !esPublico;

  return (
    <main className={styles.main}>
      {/* ===== PORTADA ===== */}
      <div className={styles.cover}>
        {portada
          ? <img className={styles.coverImg} src={comunidadMedia(portada)} alt={grupo?.nombre || ''} />
          : <span className={styles.coverFallback}><ion-icon name="people" suppressHydrationWarning></ion-icon></span>}
        {soyDueno && (
          <label className={styles.coverEdit} title={es ? 'Cambiar portada' : 'Change cover'}>
            <ion-icon name="camera-outline" suppressHydrationWarning></ion-icon>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirFoto('banner', f); }} />
          </label>
        )}
        {grupo?.destacado && (
          <div className={styles.coverTag}>{es ? 'Comunidad destacada' : 'Featured community'}</div>
        )}
      </div>

      {/* ===== CABECERA: nombre + acciones ===== */}
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <span className={styles.avatarWrap}>
            {grupo?.avatar
              ? <img src={comunidadMedia(grupo.avatar)} alt="" className={styles.avatar} />
              : <span className={styles.avatarInitial}>{ini(grupo?.nombre)}</span>}
            {soyDueno && (
              <label className={styles.avatarEdit} title={es ? 'Cambiar foto' : 'Change photo'}>
                <ion-icon name="camera-outline" suppressHydrationWarning></ion-icon>
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirFoto('avatar', f); }} />
              </label>
            )}
          </span>
          <div className={styles.headInfo}>
            <h1 className={styles.name}>{grupo?.nombre || 'Comunidad'}</h1>
            <p className={styles.meta}>
              <ion-icon name={esPublico ? 'earth-outline' : 'lock-closed-outline'} suppressHydrationWarning></ion-icon>
              {esPublico ? (es ? 'Grupo público' : 'Public group') : (es ? 'Grupo privado' : 'Private group')}
              <span className={styles.dot}>·</span>
              {Number(grupo?.miembros || 0).toLocaleString(es ? 'es-PE' : 'en-US')} {es ? 'miembros' : 'members'}
              <span className={styles.dot}>·</span>
              {grupo?.activos || 0} {es ? 'activos' : 'active'}
            </p>
          </div>
        </div>

        <div className={styles.headActions}>
          {soyMiembro || soyDueno ? (
            <>
              <button type="button" className={styles.btnPrimary} onClick={abrirChat}>
                <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Entrar al chat' : 'Open chat'}
              </button>
              {!soyDueno && (
                <button type="button" className={styles.btnGhost} onClick={() => pedirConfirmacion('salir')}>
                  <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Salir' : 'Leave'}
                </button>
              )}
            </>
          ) : solicitud === 'pendiente' ? (
            <button type="button" className={styles.btnGhost} onClick={() => pedirConfirmacion('cancelar')}>
              <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Cancelar solicitud' : 'Cancel request'}
            </button>
          ) : (
            <button type="button" className={styles.btnPrimary} onClick={() => pedirConfirmacion('entrar')}>
              <ion-icon name={requiereAprobacion(grupo) ? 'lock-closed-outline' : 'person-add-outline'} suppressHydrationWarning></ion-icon>
              {requiereAprobacion(grupo) ? (es ? 'Pedir entrar' : 'Ask to join') : (es ? 'Unirme' : 'Join')}
            </button>
          )}
        </div>
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      {/* ===== TABS ===== */}
      <nav className={styles.tabs} role="tablist">
        {[
          { id: 'conversacion', es: 'Conversación', icon: 'chatbubbles-outline' },
          { id: 'informacion', es: 'Información', icon: 'information-circle-outline' },
          { id: 'miembros', es: 'Miembros', icon: 'people-outline' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
            aria-selected={tab === t.id}
            role="tab"
            onClick={() => cambiarTab(t.id)}
          >
            <ion-icon name={t.icon} suppressHydrationWarning></ion-icon>
            {es ? t.es : t.es}
          </button>
        ))}
      </nav>

      {/* ===== CONTENIDO ===== */}
      <div className={styles.body}>
        <div className={styles.feed}>
          {tab === 'conversacion' && (
            <>
              {/* En grupos privados solo los miembros (o el dueño) ven el contenido.
                  En públicos cualquiera ve las publicaciones, pero el chat es solo
                  para miembros. */}
              {esPrivado && !soyMiembro && !soyDueno ? (
                <div className={styles.joinBox}>
                  <ion-icon name="lock-closed-outline" className={styles.joinIcon} suppressHydrationWarning></ion-icon>
                  <p>{es ? 'Este grupo es privado. Únete para ver sus publicaciones y entrar al chat.' : 'This group is private. Join to see its posts and enter the chat.'}</p>
                  {solicitud === 'pendiente' ? (
                    <button type="button" className={styles.btnGhost} onClick={() => pedirConfirmacion('cancelar')}>
                      <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Cancelar solicitud' : 'Cancel request'}
                    </button>
                  ) : (
                    <button type="button" className={styles.btnPrimary} onClick={() => pedirConfirmacion('entrar')}>
                      {requiereAprobacion(grupo) ? (es ? 'Pedir entrar' : 'Ask to join') : (es ? 'Unirme' : 'Join')}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {!soyMiembro && !soyDueno && (
                    <div className={styles.publicNotice}>
                      <ion-icon name="globe-outline" suppressHydrationWarning></ion-icon>
                      <span>{es ? 'Puedes ver las publicaciones. Únete para publicar y entrar al chat.' : 'You can see posts. Join to post and enter the chat.'}</span>
                    </div>
                  )}
                  {cargando ? (
                    <p className={styles.empty}>{es ? 'Cargando...' : 'Loading...'}</p>
                  ) : posts.length === 0 ? (
                    <p className={styles.empty}>{es ? 'Este grupo aún no tiene publicaciones.' : 'This group has no posts yet.'}</p>
                  ) : posts.map((p) => (
                <article key={p.id} className={styles.post}>
                  <header className={styles.postHead}>
                    <span className={styles.postAvatar}>{p.avatar ? <img src={comunidadMedia(p.avatar)} alt="" /> : ini(p.usuario)}</span>
                    <div>
                      <span className={styles.postUser}>{p.usuario}</span>
                      <span className={styles.postTime}>{fecha(p.created_at, es ? 'es' : 'en')}</span>
                    </div>
                  </header>
                  {p.texto && <p className={styles.postText}>{p.texto}</p>}
                  {Array.isArray(p.media) && p.media.length > 0 && (
                    <div className={styles.postMedia}>
                      {p.media.map((m, i) => (
                        m.tipo === 'video'
                          ? <video key={i} src={comunidadMedia(m.url)} controls preload="metadata" playsInline />
                          : m.tipo === 'audio'
                            ? <audio key={i} src={comunidadMedia(m.url)} controls />
                            : <img key={i} src={comunidadMedia(m.url)} alt="" loading="lazy" />
                      ))}
                    </div>
                  )}
                  <div className={styles.postActions}>
                    <span><ion-icon name="heart-outline" suppressHydrationWarning></ion-icon> {p.likes}</span>
                    <span><ion-icon name="chatbubble-outline" suppressHydrationWarning></ion-icon> {p.comentarios}</span>
                    <span><ion-icon name="share-social-outline" suppressHydrationWarning></ion-icon> {p.compartidos}</span>
                  </div>
                </article>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'informacion' && (
            <div className={styles.infoCard}>
              <h3 className={styles.infoTitle}>{es ? 'Información' : 'Information'}</h3>
              {grupo?.descripcion && <p className={styles.infoDesc}>{grupo.descripcion}</p>}
              <div className={styles.infoRow}>
                <ion-icon name={esPublico ? 'earth-outline' : 'lock-closed-outline'} suppressHydrationWarning></ion-icon>
                <div>
                  <strong>{esPublico ? (es ? 'Público' : 'Public') : (es ? 'Privado' : 'Private')}</strong>
                  <p>{esPublico
                    ? (es ? 'Cualquier persona puede ver quién pertenece al grupo y lo que se publica.' : 'Anyone can see who is in the group and what is posted.')
                    : (es ? 'Solo los miembros pueden ver las publicaciones.' : 'Only members can see posts.')}</p>
                </div>
              </div>
              <div className={styles.infoRow}>
                <ion-icon name={requiereAprobacion(grupo) ? 'lock-closed-outline' : 'enter-outline'} suppressHydrationWarning></ion-icon>
                <div>
                  <strong>{requiereAprobacion(grupo) ? (es ? 'Con aprobación' : 'Approval required') : (es ? 'Unirse directo' : 'Open join')}</strong>
                  <p>{requiereAprobacion(grupo) ? (es ? 'Hay que pedir entrar.' : 'You must ask to join.') : (es ? 'Puedes unirte al instante.' : 'You can join instantly.')}</p>
                </div>
              </div>
              {grupo?.reglas && (
                <div className={styles.infoRow}>
                  <ion-icon name="document-text-outline" suppressHydrationWarning></ion-icon>
                  <div>
                    <strong>{es ? 'Reglas' : 'Rules'}</strong>
                    <p className={styles.rules}>{grupo.reglas}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'miembros' && (
            (esPrivado && !soyMiembro && !soyDueno) ? (
              <div className={styles.joinBox}>
                <ion-icon name="lock-closed-outline" className={styles.joinIcon} suppressHydrationWarning></ion-icon>
                <p>{es ? 'Únete al grupo para ver sus miembros.' : 'Join the group to see its members.'}</p>
              </div>
            ) : (
              <p className={styles.empty}>{es ? `Este grupo tiene ${Number(grupo?.miembros || 0).toLocaleString(es ? 'es-PE' : 'en-US')} miembros.` : `This group has ${Number(grupo?.miembros || 0)} members.`}</p>
            )
          )}
        </div>

        <aside className={styles.side}>
          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>{es ? 'Sobre el grupo' : 'About the group'}</h3>
            <div className={styles.sideRow}>
              <ion-icon name={esPublico ? 'earth-outline' : 'lock-closed-outline'} suppressHydrationWarning></ion-icon>
              <div>
                <strong>{esPublico ? (es ? 'Público' : 'Public') : (es ? 'Privado' : 'Private')}</strong>
                <p>{esPublico ? (es ? 'Visible para todos.' : 'Visible to everyone.') : (es ? 'Solo miembros.' : 'Members only.')}</p>
              </div>
            </div>
            <div className={styles.sideRow}>
              <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
              <div>
                <strong>{Number(grupo?.miembros || 0).toLocaleString(es ? 'es-PE' : 'en-US')} {es ? 'miembros' : 'members'}</strong>
                <p>{grupo?.activos || 0} {es ? 'activos ahora' : 'active now'}</p>
              </div>
            </div>
            {(soyMiembro || soyDueno) && (
              <button type="button" className={styles.sideBtn} onClick={abrirChat}>
                <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Entrar al chat del grupo' : 'Open group chat'}
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ===== Modal de confirmacion ===== */}
      {confirmCfg && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setConfirmar(null); }}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{confirmCfg.titulo}</h3>
            <p className={styles.modalText}>{confirmCfg.texto}</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setConfirmar(null)}>
                {es ? 'Cerrar' : 'Close'}
              </button>
              <button type="button" className={styles.modalOk} onClick={confirmCfg.run}>
                {confirmCfg.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
