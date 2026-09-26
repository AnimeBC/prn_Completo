'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from '@/_Pages/main/Chat/componentes/InfoGrupo/infoGrupo.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL } from '@/_Extras/Api/api.js';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { presenciaEstado } from '@/_Extras/Fecha/fecha.js';
import { abrirCanal } from '@/_Extras/Canales/canal.js';

// Página por carga de la pestaña Multimedia.
const PAGE_MEDIA = 24;

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

/** media puede ser un path simple o un JSON array (álbum). */
function parseMedia(m) {
  if (!m) return [];
  try {
    const v = JSON.parse(m);
    if (Array.isArray(v)) return v;
    return [m];
  } catch { return [m]; }
}

function kindSrc(src) {
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(src)) return 'img';
  if (/\.(mp4|mov|webm|mkv|m4v)$/i.test(src)) return 'video';
  return 'audio';
}

/**
 * Modal de información de una conversación 1 a 1 (estilo Facebook):
 * portada + foto + datos, botones de ver perfil / silenciar / bloquear
 * y la pestaña Multimedia con todos los archivos compartidos.
 */
export default function InfoDM({ open, otroKey, chat, userKey, otroEdad, onClose }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';

  const [cargando, setCargando] = useState(true);
  const [rel, setRel] = useState({ bloqueoMio: false, bloqueadoPorEl: false, silenciado: false });
  const [canal, setCanal] = useState(null); // { slug, banner, descripcion, nombre }
  const [vista, setVista] = useState('perfil');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmarBloqueo, setConfirmarBloqueo] = useState(false);
  // Multimedia paginada.
  const [medios, setMedios] = useState([]);
  const [medCargando, setMedCargando] = useState(false);
  const [medMas, setMedMas] = useState(false);
  const [medCargandoMas, setMedCargandoMas] = useState(false);
  const medOffsetRef = useRef(0);
  const medMasRef = useRef(false);
  const medCargandoRef = useRef(false);
  const medReqRef = useRef(0);
  const medListRef = useRef(null);
  const ultimoRefrescoRef = useRef(0);
  // Visor (índice sobre la lista aplanada de archivos).
  const [visor, setVisor] = useState(null);

  const nombre = chat?.usuario || (es ? 'Usuario' : 'User');
  const est = presenciaEstado(otroEdad, es);
  const hayBloqueo = rel.bloqueoMio || rel.bloqueadoPorEl;

  const cargar = useCallback(async () => {
    const [r, slugR] = await Promise.all([
      apiComunidad.relacion(otroKey, userKey),
      apiComunidad.canalSlug(otroKey),
    ]);
    if (r && !r.error) {
      setRel({
        bloqueoMio: !!r.bloqueoMio,
        bloqueadoPorEl: !!r.bloqueadoPorEl,
        silenciado: !!r.silenciado,
      });
    }
    const slug = slugR?.slug || null;
    if (slug) {
      try {
        const res = await fetch(`${API_URL}/api/channels/${encodeURIComponent(slug)}`);
        const j = await res.json().catch(() => ({}));
        const ch = j.channel || j.data || j;
        setCanal({
          slug,
          banner: (ch && ch.banner) || null,
          descripcion: (ch && ch.descripcion) || null,
          nombre: (ch && ch.nombre) || null,
        });
      } catch { setCanal({ slug, banner: null, descripcion: null, nombre: null }); }
    } else {
      setCanal({ slug: null, banner: null, descripcion: null, nombre: null });
    }
    setCargando(false);
  }, [otroKey, userKey]);

  useEffect(() => {
    if (!open) return;
    setCargando(true);
    setMsg('');
    setVista('perfil');
    setConfirmarBloqueo(false);
    setVisor(null);
    // Multimedia: se resetea y vuelve a cargar cuando se abra la pestaña.
    setMedios([]);
    setMedCargando(true);
    setMedMas(false);
    medReqRef.current = 0;
    medOffsetRef.current = 0;
    medMasRef.current = false;
    medCargandoRef.current = false;
    cargar();
  }, [open, cargar]);

  // Tiempo real: bloqueos/silencios y cambios llegan por Redis a ambos lados.
  useEffect(() => {
    if (!open) return undefined;
    const onChange = () => {
      const ahora = Date.now();
      if (ahora - ultimoRefrescoRef.current >= 2500) {
        ultimoRefrescoRef.current = ahora;
        cargar();
      }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [open, cargar]);

  // El modal abierto no deja scrollear la página de atrás.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Cierra el visor con Escape.
  useEffect(() => {
    if (visor === null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setVisor(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visor]);

  // ---- Multimedia (paginada con scroll) ----
  const cargarMedios = useCallback(async (off) => {
    if (!otroKey) return;
    const reqId = ++medReqRef.current;
    const r = await apiComunidad.dmMultimedia(otroKey, { userKey, offset: off, limit: PAGE_MEDIA });
    if (reqId !== medReqRef.current) return; // una recarga más nueva ganó
    const rows = Array.isArray(r?.data) ? r.data : [];
    setMedios((p) => (off === 0 ? rows : [...p, ...rows]));
    medOffsetRef.current = off + rows.length;
    medMasRef.current = !!r?.hasMore;
    setMedMas(!!r?.hasMore);
    medCargandoRef.current = false;
    setMedCargandoMas(false);
    setMedCargando(false);
  }, [otroKey, userKey]);

  // Primera carga al entrar a la pestaña.
  useEffect(() => {
    if (!open || vista !== 'media') return;
    if (medReqRef.current > 0) return;
    setMedCargando(true);
    cargarMedios(0);
  }, [open, vista, cargarMedios]);

  function onScrollMedios() {
    const el = medListRef.current;
    if (!el || medCargandoRef.current || !medMasRef.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      medCargandoRef.current = true;
      setMedCargandoMas(true);
      cargarMedios(medOffsetRef.current);
    }
  }

  // ---- Acciones ----
  async function toggleSilencio() {
    setBusy(true);
    setMsg('');
    const r = await apiComunidad.dmSilencio(otroKey, userKey);
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setRel((x) => ({ ...x, silenciado: !!r.silenciado }));
  }

  async function ejecutarBloqueo(bloquearAhora) {
    setBusy(true);
    setMsg('');
    const r = await apiComunidad.bloquear(userKey, otroKey, bloquearAhora ? 'bloquear' : 'desbloquear');
    setBusy(false);
    setConfirmarBloqueo(false);
    if (r?.error) { setMsg(r.error); return; }
    setRel((x) => ({ ...x, bloqueoMio: bloquearAhora }));
    if (bloquearAhora) setMsg(es ? 'Usuario bloqueado.' : 'User blocked.');
    else setMsg(es ? 'Usuario desbloqueado.' : 'User unblocked.');
  }

  function irPerfil() {
    onClose();
    abrirCanal(router, otroKey, chat?.usuario);
  }

  if (!open) return null;

  // Archivos aplanados (los álbumes se abren en piezas sueltas).
  const flat = [];
  medios.forEach((m) => {
    parseMedia(m.media).forEach((src) => flat.push({ src, key: `${m.id}-${flat.length}` }));
  });
  const visorItem = visor !== null ? flat[visor] : null;
  const visorKind = visorItem ? kindSrc(visorItem.src) : null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label={es ? 'Información' : 'Information'}>
        <header className={styles.head}>
          <button type="button" className={styles.headBtn} onClick={onClose} aria-label={es ? 'Volver' : 'Back'}>
            <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
          </button>
          <strong className={styles.title}>{es ? 'Información' : 'Information'}</strong>
          <button type="button" className={styles.headBtn} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </header>

        <div className={styles.body}>
          {cargando && <p className={styles.muted}>{es ? 'Cargando…' : 'Loading…'}</p>}

          {!cargando && (
            <>
              {/* Pestañas */}
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={vista === 'perfil'}
                  className={`${styles.tab} ${vista === 'perfil' ? styles.tabOn : ''}`}
                  onClick={() => setVista('perfil')}
                >
                  <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Perfil' : 'Profile'}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={vista === 'media'}
                  className={`${styles.tab} ${vista === 'media' ? styles.tabOn : ''}`}
                  onClick={() => setVista('media')}
                >
                  <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Multimedia' : 'Media'}
                </button>
              </div>

              {msg && <p className={styles.msg}>{msg}</p>}

              {vista === 'perfil' ? (
                <>
                  {/* Portada del canal (o gradiente) */}
                  <div
                    className={styles.banner}
                    style={canal?.banner ? { backgroundImage: `url(${comunidadMedia(canal.banner)})` } : undefined}
                  />

                  {/* Foto + nombre */}
                  <div className={styles.identity}>
                    <div className={styles.avatarWrap}>
                      {chat?.avatar
                        ? <img src={comunidadMedia(chat.avatar)} alt="" />
                        : <span>{ini(nombre)}</span>}
                    </div>
                    <div className={styles.names}>
                      <h2 className={styles.nombre}>{nombre}</h2>
                      <div className={styles.tags}>
                        {/* Bloqueados: no se muestra si está en línea. */}
                        {!hayBloqueo && (
                          <span className={styles.tagRol}>
                            <ion-icon name={est.online ? 'radio-button-on' : 'moon-outline'} suppressHydrationWarning></ion-icon>
                            {est.label}
                          </span>
                        )}
                        {rel.silenciado && (
                          <span className={styles.tagRol}>
                            <ion-icon name="notifications-off-outline" suppressHydrationWarning></ion-icon>
                            {es ? 'Silenciado' : 'Muted'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <section className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      <ion-icon name="options-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Acciones' : 'Actions'}
                    </h3>

                    <div className={styles.relBtns}>
                      {/* Bloqueados: sin ver perfil ni silenciar. */}
                      {!hayBloqueo && (
                        <button type="button" className={styles.primaryBtn} onClick={irPerfil}>
                          <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Ver perfil' : 'View profile'}
                        </button>
                      )}
                      {!hayBloqueo && (
                        <button type="button" className={styles.ghostBtn} onClick={toggleSilencio} disabled={busy}>
                          <ion-icon name={rel.silenciado ? 'notifications-outline' : 'notifications-off-outline'} suppressHydrationWarning></ion-icon>
                          {rel.silenciado ? (es ? 'Desactivar silencio' : 'Unmute') : (es ? 'Silenciar' : 'Mute')}
                        </button>
                      )}
                      {rel.bloqueoMio ? (
                        <button type="button" className={styles.ghostBtn} onClick={() => ejecutarBloqueo(false)} disabled={busy}>
                          <ion-icon name="lock-open-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Desbloquear' : 'Unblock'}
                        </button>
                      ) : !hayBloqueo ? (
                        <button type="button" className={styles.dangerBtn} onClick={() => setConfirmarBloqueo(true)} disabled={busy}>
                          <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
                          {es ? 'Bloquear' : 'Block'}
                        </button>
                      ) : null}
                    </div>

                    {rel.bloqueadoPorEl && (
                      <p className={styles.avisoBloqueo}>
                        <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
                        {es
                          ? 'Este usuario te ha bloqueado: no puede escribirte.'
                          : 'This user has blocked you: they cannot message you.'}
                      </p>
                    )}
                    {rel.bloqueoMio && (
                      <p className={styles.hint}>
                        {es
                          ? 'Tú bloqueaste a esta persona: ninguno de los dos puede escribir al otro hasta que lo desbloquees.'
                          : 'You blocked this person: neither can message the other until you unblock.'}
                      </p>
                    )}
                    {canal?.descripcion && (
                      <p className={styles.hint}>{canal.descripcion}</p>
                    )}
                  </section>
                </>
              ) : (
                /* Multimedia de la conversación */
                <section className={styles.card}>
                  <h3 className={styles.cardTitle}>
                    <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Multimedia' : 'Media'}
                    <span className={styles.count}>{medios.length > 0 && medMas ? '+' : ''}{flat.length}</span>
                  </h3>

                  <div className={styles.mediaWrap} ref={medListRef} onScroll={onScrollMedios}>
                    {medCargando && flat.length === 0 && (
                      <p className={styles.hint}>{es ? 'Cargando archivos…' : 'Loading files…'}</p>
                    )}
                    {!medCargando && flat.length === 0 && (
                      <p className={styles.hint}>{es ? 'No hay archivos en esta conversación.' : 'No files in this conversation.'}</p>
                    )}

                    <div className={styles.gridMedia}>
                      {flat.map((it, i) => {
                        const k = kindSrc(it.src);
                        return (
                          <button
                            key={it.key}
                            type="button"
                            className={styles.mediaCell}
                            onClick={() => setVisor(i)}
                            title={es ? 'Ver' : 'View'}
                          >
                            {k === 'img' && <img src={comunidadMedia(it.src)} alt="" loading="lazy" />}
                            {k === 'video' && <video src={comunidadMedia(it.src)} preload="metadata" muted playsInline />}
                            {k === 'audio' && (
                              <span className={styles.mediaAudio}>
                                <ion-icon name="musical-notes-outline" suppressHydrationWarning></ion-icon>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {medCargandoMas && (
                      <p className={styles.hint}>{es ? 'Cargando más…' : 'Loading more…'}</p>
                    )}
                    {!medCargandoMas && medMas && flat.length > 0 && (
                      <p className={styles.hint}>{es ? 'Desliza para ver más.' : 'Scroll to see more.'}</p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Confirmación de bloqueo */}
        {confirmarBloqueo && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmarBloqueo(false); }}
          >
            <div className={styles.rolModal} role="dialog" aria-modal="true" aria-label={es ? 'Bloquear' : 'Block'}>
              <div className={styles.rolHead}>
                <strong>{es ? 'Bloquear a' : 'Block'} {nombre}</strong>
                <button type="button" className={styles.headBtn} onClick={() => setConfirmarBloqueo(false)} aria-label={es ? 'Cerrar' : 'Close'}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>
              <div className={styles.rolBody}>
                <p className={styles.kickText}>
                  {es
                    ? 'Ninguno de los dos podrá escribirle al otro hasta que lo desbloquees. La conversación se conserva.'
                    : 'Neither of you will be able to message each other until you unblock. The conversation is kept.'}
                </p>
                <div className={styles.rolActions}>
                  <button type="button" className={styles.ghostBtn} onClick={() => setConfirmarBloqueo(false)}>
                    {es ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button type="button" className={styles.kickBtn} onClick={() => ejecutarBloqueo(true)} disabled={busy}>
                    <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
                    {busy ? (es ? 'Bloqueando…' : 'Blocking…') : (es ? 'Bloquear' : 'Block')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visor de archivos */}
        {visorItem && (
          <div
            className={styles.rolOverlay}
            onClick={(e) => { if (e.target === e.currentTarget) setVisor(null); }}
          >
            <div className={styles.visorBox}>
              {visorKind === 'img' && (
                <img className={styles.visorMedia} src={comunidadMedia(visorItem.src)} alt="" />
              )}
              {visorKind === 'video' && (
                <video className={styles.visorMedia} src={comunidadMedia(visorItem.src)} controls autoPlay playsInline />
              )}
              {visorKind === 'audio' && (
                <audio className={styles.visorAudio} src={comunidadMedia(visorItem.src)} controls autoPlay />
              )}

              <button type="button" className={styles.visorClose} onClick={() => setVisor(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>

              {visor > 0 && (
                <button type="button" className={`${styles.visorNav} ${styles.visorPrev}`} onClick={() => setVisor((i) => i - 1)} aria-label="Anterior">
                  <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
              {visor < flat.length - 1 && (
                <button type="button" className={`${styles.visorNav} ${styles.visorNext}`} onClick={() => setVisor((i) => i + 1)} aria-label="Siguiente">
                  <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}

              <span className={styles.visorCount}>{visor + 1} / {flat.length}</span>
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body
  );
}
