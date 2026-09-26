'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './CrearPublicacion.module.css';
import { apiComunidad, comunidadMedia, comprimirImagen } from '@/_Extras/Comunidad/api.js';
import { comprimirVideo } from '@/_Extras/Comunidad/comprimirVideo.js';
import { SENTIMIENTOS, sentimientoTexto, sentimientoPorId } from '@/_Extras/Comunidad/sentimientos.js';
import { MencionCampo } from '@/_Extras/Comunidad/menciones.js';

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

// Previsualizaciones de archivos adjuntos (una sola URL por archivo).
// Map (no WeakMap) para poder liberar TODAS las urls al cerrar el modal.
const OBJ_URLS = new Map();
function objUrl(f) {
  if (!OBJ_URLS.has(f)) OBJ_URLS.set(f, URL.createObjectURL(f));
  return OBJ_URLS.get(f);
}
function liberaUrl(f) {
  const u = OBJ_URLS.get(f);
  if (!u) return;
  try { URL.revokeObjectURL(u); } catch { /* noop */ }
  OBJ_URLS.delete(f);
}

/** Tamano legible del archivo (1.2 MB, 340 KB...). */
function tamano(b) {
  const n = Number(b) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Tipo de preview: 'imagen' | 'video' | 'otro'.
 *  (Los audios NO se aceptan en publicaciones: solo fotos y videos.) */
function tipoPreview(f) {
  const t = String(f?.type || '');
  if (/^image\//.test(t)) return 'imagen';
  if (/^video\//.test(t)) return 'video';
  return 'otro';
}

/**
 * Modal "Crear publicacion" (estilo Facebook).
 * Se abre desde el disparador del feed y aqui vive TODO el composer:
 * texto, fotos/videos, encuesta, sentimiento y publicacion anonima.
 * En movil ocupa la zona entre el header y la navegacion inferior
 * (el overlay nunca las tapa).
 */
export default function CrearPublicacion({ inicial = 'texto', es, grupo, user, userKey, exigirAuth, onExito, onCerrar }) {
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [anonimo, setAnonimo] = useState(false);
  const [sentimiento, setSentimiento] = useState(null);
  const [encuesta, setEncuesta] = useState(null); // { pregunta, opciones: [''] }
  const [publicando, setPublicando] = useState(false);
  // 0..1 mientras el navegador convierte un video a calidad media (null = off).
  const [convirtiendo, setConvirtiendo] = useState(null);
  const [aviso, setAviso] = useState('');
  // 'main' = editor, 'sentimiento' = selector de como te sientes.
  const [vista, setVista] = useState(inicial === 'sentimiento' ? 'sentimiento' : 'main');
  const [qSent, setQSent] = useState('');
  const [tabSent, setTabSent] = useState('sentimientos');
  const fileRef = useRef(null);
  // Arrastrar y soltar archivos sobre el editor.
  const [arrastrando, setArrastrando] = useState(false);

  // Vistas de entrada: encuesta abre el editor, media abre el selector de archivo.
  useEffect(() => {
    if (inicial === 'encuesta') setEncuesta({ pregunta: '', opciones: ['', ''] });
    if (inicial === 'media') {
      const t = setTimeout(() => fileRef.current?.click(), 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [inicial]);

  // Cierra con Escape y bloquea el scroll de la pagina de fondo.
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onCerrar]);

  // Mientras el modal esta abierto, el navegador NO debe abrir el archivo
  // suelto fuera del editor: se cancela el comportamiento por defecto.
  useEffect(() => {
    const bloquear = (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', bloquear);
    window.addEventListener('drop', bloquear);
    return () => {
      window.removeEventListener('dragover', bloquear);
      window.removeEventListener('drop', bloquear);
    };
  }, []);

  // Al cerrar el modal libera todas las previsualizaciones creadas.
  useEffect(() => () => {
    for (const f of Array.from(OBJ_URLS.keys())) liberaUrl(f);
  }, []);

  const nombre = user?.usuario || user?.nombre || '';
  const sent = sentimientoPorId(sentimiento);
  const encuestaOk = !!encuesta
    && encuesta.pregunta.trim().length > 0
    && encuesta.opciones.filter((o) => o.trim()).length >= 2;
  const puedeEnviar = (!!texto.trim() || adjuntos.length > 0 || !!encuesta)
    && !publicando && convirtiendo === null;

  // Limite de PESO del usuario (mb): 200 por defecto, -1 = sin limite.
  // No hay limite de cantidad: solo de peso, para no saturar el servidor.
  const [limiteMb, setLimiteMb] = useState(200);

  useEffect(() => {
    let vivo = true;
    apiComunidad.miLimite(userKey).then((r) => {
      if (vivo && Number.isFinite(r?.mb)) setLimiteMb(r.mb);
    }).catch(() => { /* deja el default */ });
    return () => { vivo = false; };
  }, [userKey]);

  /** Peso total de los adjuntos en MB. */
  function pesoMb() {
    return adjuntos.reduce((s, f) => s + (Number(f?.size) || 0), 0) / (1024 * 1024);
  }

  function agregarArchivos(list) {
    // En publicaciones SOLO se aceptan fotos y videos (nada de audios u otros).
    const arr = Array.from(list || []).filter((f) => f && f.size > 0 && /^(image|video)\//.test(String(f.type || '')));
    const descartados = Array.from(list || []).length - arr.length;
    if (!arr.length) {
      if (descartados > 0) {
        setAviso(es ? 'Solo se pueden adjuntar fotos o videos.' : 'Only photos or video files can be attached.');
      }
      return;
    }
    // Sin limite de cantidad: solo de peso total (no saturar el servidor).
    if (limiteMb > 0) {
      const nuevoPeso = (adjuntos.reduce((s, f) => s + (Number(f?.size) || 0), 0)
        + arr.reduce((s, f) => s + (Number(f?.size) || 0), 0)) / (1024 * 1024);
      if (nuevoPeso > limiteMb) {
        setAviso(es
          ? `Los archivos pesan ${nuevoPeso.toFixed(1)} MB y tu límite es de ${limiteMb} MB. Quita alguno.`
          : `The files weigh ${nuevoPeso.toFixed(1)} MB and your limit is ${limiteMb} MB. Remove some.`);
        return;
      }
    }
    setAviso('');
    setAdjuntos([...adjuntos, ...arr]);
  }

  function quitarAdjunto(i) {
    const quitado = adjuntos[i];
    if (quitado) liberaUrl(quitado);
    setAdjuntos(adjuntos.filter((_, k) => k !== i));
  }

  // ===== Arrastrar y soltar =====
  function esArchivo(e) {
    // types es FileList/array en navegadores actuales; se normaliza por si acaso.
    return Array.from(e.dataTransfer?.types || []).includes('Files');
  }

  function arrastreEnter(e) {
    if (!esArchivo(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setArrastrando(true);
  }

  // Se cierra solo cuando el puntero sale del overlay entero
  // (moverse hacia el dialogo o sus hijos no debe apagar el aviso).
  function arrastreLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setArrastrando(false);
  }

  function arrastreOver(e) {
    if (!esArchivo(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function soltar(e) {
    e.preventDefault();
    setArrastrando(false);
    if (!esArchivo(e)) return;
    if (encuesta) {
      setAviso(es
        ? 'No se puede combinar con lo que ya agregaste a la publicación.'
        : "Can't be combined with what you've already added to the post.");
      return;
    }
    // Si estaba en el selector de sentimiento, vuelve al editor para ver el preview.
    setVista('main');
    agregarArchivos(e.dataTransfer?.files);
  }

  function cambiarPregunta(v) { setAviso(''); setEncuesta((e) => ({ ...e, pregunta: v })); }
  function cambiarOpcion(i, v) { setAviso(''); setEncuesta((e) => ({ ...e, opciones: e.opciones.map((o, k) => (k === i ? v : o)) })); }
  function agregarOpcion() { setEncuesta((e) => (e.opciones.length < 6 ? { ...e, opciones: [...e.opciones, ''] } : e)); }
  function quitarOpcion(i) { setEncuesta((e) => (e.opciones.length > 2 ? { ...e, opciones: e.opciones.filter((_, k) => k !== i) } : e)); }

  async function publicar() {
    if (exigirAuth && !exigirAuth()) return;
    if (encuesta && !texto.trim()) {
      setAviso(es
        ? 'No puedes crear una encuesta sin texto en tu publicación.'
        : "You can't create a poll without text in your post.");
      return;
    }
    if (encuesta && !encuestaOk) {
      setAviso(es
        ? 'Completa la encuesta: pregunta y al menos 2 opciones.'
        : 'Complete the poll: question and at least 2 options.');
      return;
    }
    if (!texto.trim() && !adjuntos.length && !encuesta) return;
    // Peso total: el limite real es de MB, no de cantidad de archivos.
    if (limiteMb > 0 && pesoMb() > limiteMb) {
      setAviso(es
        ? `Los archivos pesan ${pesoMb().toFixed(1)} MB y tu límite es de ${limiteMb} MB.`
        : `The files weigh ${pesoMb().toFixed(1)} MB and your limit is ${limiteMb} MB.`);
      return;
    }
    setPublicando(true);
    setAviso('');
    try {
      const fd = new FormData();
      fd.append('userKey', userKey);
      fd.append('texto', texto.trim());
      if (grupo?.id) fd.append('grupo', String(grupo.id));
      if (anonimo) fd.append('anonimo', '1');
      if (sentimiento) fd.append('sentimiento', sentimiento);
      if (encuesta) {
        fd.append('encuesta', JSON.stringify({
          pregunta: encuesta.pregunta.trim(),
          opciones: encuesta.opciones.map((t, i) => ({ id: String(i), texto: t.trim() })).filter((o) => o.texto),
        }));
      }
      for (const f of adjuntos) {
        let archivo = f;
        if (tipoPreview(f) === 'video') {
          // Las publicaciones no son peliculas: baja el video a 720p (media)
          // en el navegador antes de subirlo.
          setConvirtiendo(0);
          archivo = await comprimirVideo(f, (p) => setConvirtiendo(p));
        } else {
          archivo = await comprimirImagen(f);
        }
        fd.append('media', archivo);
      }
      setConvirtiendo(null);
      const r = await apiComunidad.crearPost(fd);
      if (r?.error) { setAviso(r.error); return; }
      if (onExito) await onExito();
      onCerrar();
    } finally {
      setPublicando(false);
      setConvirtiendo(null);
    }
  }

  // ===== Selector "¿Como te sientes?" =====
  const sentFiltrados = SENTIMIENTOS.filter((s) => {
    const tipoOk = tabSent === 'sentimientos' ? s.tipo === 'sentimiento' : s.tipo === 'actividad';
    if (!tipoOk) return false;
    const q = qSent.trim().toLowerCase();
    if (!q) return true;
    return s.es.toLowerCase().includes(q) || s.en.toLowerCase().includes(q);
  });

  const esAnon = anonimo;
  const privLabel = grupo?.privacidad === 'privada' || grupo?.modo_union === 'invitacion'
    ? (es ? 'Grupo privado' : 'Private group')
    : (es ? 'Grupo público' : 'Public group');
  const privIcon = privLabel.startsWith('Grupo privado') || privLabel.startsWith('Private')
    ? 'lock-closed-outline' : 'earth-outline';

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      onDragEnter={arrastreEnter}
      onDragOver={arrastreOver}
      onDragLeave={arrastreLeave}
      onDrop={soltar}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true">
        {/* Soltar archivos: aviso visible mientras se arrastra */}
        {arrastrando && (
          <div className={styles.dropZona}>
            <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
            <strong>{es ? 'Suelta aquí tus archivos' : 'Drop your files here'}</strong>
            <span>{es ? 'Fotos o videos · sin límite de cantidad' : 'Photos or videos · no file count limit'}</span>
          </div>
        )}
        {/* ===== Cabecera del modal ===== */}
        <div className={styles.head}>
          {vista === 'sentimiento' ? (
            <button type="button" className={styles.headBtn} onClick={() => setVista('main')} aria-label={es ? 'Volver' : 'Back'}>
              <ion-icon name="chevron-back" suppressHydrationWarning></ion-icon>
            </button>
          ) : (
            <button type="button" className={styles.headBtn} onClick={onCerrar} aria-label={es ? 'Cerrar' : 'Close'}>
              <ion-icon name="close" suppressHydrationWarning></ion-icon>
            </button>
          )}
          <h2 className={styles.headTitle}>
            {vista === 'sentimiento'
              ? (es ? '¿Cómo te sientes?' : 'How are you feeling?')
              : (es ? 'Crear publicación' : 'Create post')}
          </h2>
          <span className={styles.headSpacer} />
        </div>

        {vista === 'sentimiento' ? (
          /* ===== Vista: sentimientos / actividades ===== */
          <div className={styles.sentBody}>
            <label className={styles.sentBuscador}>
              <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
              <input
                type="search"
                placeholder={es ? 'Buscar' : 'Search'}
                value={qSent}
                onChange={(e) => setQSent(e.target.value)}
              />
            </label>
            <div className={styles.sentTabs} role="tablist">
              {[
                { id: 'sentimientos', es: 'Sentimientos', en: 'Feelings' },
                { id: 'actividades', es: 'Actividades', en: 'Activities' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tabSent === t.id}
                  className={`${styles.sentTab} ${tabSent === t.id ? styles.sentTabOn : ''}`}
                  onClick={() => setTabSent(t.id)}
                >
                  {es ? t.es : t.en}
                </button>
              ))}
            </div>
            <ul className={styles.sentList}>
              {sentimiento && (
                <li>
                  <button type="button" className={styles.sentQuitar} onClick={() => { setSentimiento(null); setVista('main'); }}>
                    <ion-icon name="close-circle" suppressHydrationWarning></ion-icon>
                    {es ? 'Quitar sentimiento' : 'Remove feeling'}
                  </button>
                </li>
              )}
              {sentFiltrados.map((s) => (
                <li key={s.id}>
                  <button type="button" className={styles.sentItem} onClick={() => { setSentimiento(s.id); setVista('main'); }}>
                    <span className={styles.sentIcono}><ion-icon name={s.icon} suppressHydrationWarning></ion-icon></span>
                    {es ? s.es : s.en}
                  </button>
                </li>
              ))}
              {sentFiltrados.length === 0 && (
                <li className={styles.sentVacio}>{es ? 'Sin resultados.' : 'No results.'}</li>
              )}
            </ul>
          </div>
        ) : (
          <>
            {/* ===== Vista: editor ===== */}
            <div className={styles.body}>
              {/* Publicacion anonima */}
              <label className={`${styles.anonRow} ${anonimo ? styles.anonRowOn : ''}`}>
                <span className={styles.anonIcono}>
                  <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon>
                </span>
                <span className={styles.anonTxt}>
                  <strong>{es ? 'Publicar de forma anónima' : 'Post anonymously'}</strong>
                  <small>{es ? 'Nadie verá tu nombre ni tu foto en esta publicación.' : 'Nobody will see your name or photo on this post.'}</small>
                </span>
                <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} />
                <span className={styles.switchPista} />
              </label>

              {/* Identidad + privacidad */}
              <div className={styles.ident}>
                <span className={styles.identAvatar}>
                  {esAnon
                    ? <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon>
                    : user?.avatar
                      ? <img src={comunidadMedia(user.avatar)} alt="" />
                      : ini(nombre)}
                </span>
                <div className={styles.identInfo}>
                  <span className={styles.identNombre}>{esAnon ? (es ? 'Participante anónimo' : 'Anonymous participant') : nombre}</span>
                  <span className={styles.privChip}>
                    <ion-icon name={privIcon} suppressHydrationWarning></ion-icon>
                    {privLabel}
                  </span>
                </div>
              </div>

              {/* Linea de sentimiento/actividad elegido */}
              {sent && (
                <div className={styles.feelLine}>
                  <span className={styles.feelNombre}>{esAnon ? (es ? 'Participante anónimo' : 'Anonymous participant') : nombre}</span>
                  {' '}{es ? 'está' : 'is'}{' '}
                  <ion-icon name={sent.icon} suppressHydrationWarning></ion-icon>{' '}
                  <button type="button" className={styles.feelBtn} onClick={() => setVista('sentimiento')}>
                    {sentimientoTexto(sent, es)}
                  </button>
                  <button type="button" className={styles.feelQuitar} onClick={() => setSentimiento(null)} aria-label={es ? 'Quitar' : 'Remove'}>
                    <ion-icon name="close" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
              )}

              {/* Texto */}
              <MencionCampo
                as="textarea"
                autoFocus
                className={styles.textarea}
                placeholder={esAnon
                  ? (es ? 'Envía una publicación anónima...' : 'Share an anonymous post...')
                  : (es ? 'Crea una publicación pública...' : 'Create a public post...')}
                value={texto}
                onChange={(e) => { setAviso(''); setTexto(e.target.value); }}
                userKey={userKey}
                es={es}
              />

              {/* Fotos y videos adjuntos (preview real del archivo) */}
              {adjuntos.length > 0 && (
                <div className={styles.adjGrid}>
                  {adjuntos.map((f, i) => {
                    const kind = tipoPreview(f);
                    return (
                      <div key={`${f.name}-${i}`} className={`${styles.adjItem} ${styles[`adj_${kind}`] || ''}`}>
                        {kind === 'imagen' && <img src={objUrl(f)} alt={f.name || ''} />}
                        {kind === 'video' && (
                          <video src={objUrl(f)} preload="metadata" muted playsInline />
                        )}
                        {kind === 'otro' && (
                          <span className={styles.adjFile}>
                            <ion-icon name="document-outline" suppressHydrationWarning></ion-icon>
                          </span>
                        )}
                        <span className={styles.adjPie}>
                          <span className={styles.adjNombre} title={f.name || ''}>{f.name || (es ? 'archivo' : 'file')}</span>
                          <span className={styles.adjTam}>{tamano(f.size)}</span>
                        </span>
                        <button type="button" className={styles.adjQuitar} onClick={() => quitarAdjunto(i)} aria-label={es ? 'Quitar' : 'Remove'}>
                          <ion-icon name="close" suppressHydrationWarning></ion-icon>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Peso total de los adjuntos (el limite real es de MB) */}
              {adjuntos.length > 0 && (
                <div className={styles.pesoBarra}>
                  <span className={styles.pesoTxt}>
                    {`${adjuntos.length} ${es ? 'archivo' : 'file'}${adjuntos.length > 1 ? (es ? 's' : 's') : ''} · ${tamano(adjuntos.reduce((s, f) => s + (Number(f?.size) || 0), 0))}`}
                    {limiteMb > 0 && ` / ${limiteMb} MB`}
                  </span>
                  {limiteMb > 0 && (
                    <span className={styles.pesoPista}>
                      <span
                        className={styles.pesoRelleno}
                        style={{ width: `${Math.min(100, (pesoMb() / limiteMb) * 100)}%` }}
                      />
                    </span>
                  )}
                </div>
              )}

              {/* Encuesta */}
              {encuesta && (
                <div className={styles.pollEdit}>
                  <div className={styles.pollEditHead}>
                    <strong>
                      <ion-icon name="pie-chart-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Agregar encuesta' : 'Add poll'}
                    </strong>
                    <button type="button" onClick={() => setEncuesta(null)} aria-label={es ? 'Quitar encuesta' : 'Remove poll'}>
                      <ion-icon name="close" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>
                  <MencionCampo
                    className={styles.pollPreguntaIn}
                    placeholder={es ? 'Escribe aquí tu pregunta' : 'Write your question here'}
                    value={encuesta.pregunta}
                    onChange={(e) => cambiarPregunta(e.target.value)}
                    userKey={userKey}
                    es={es}
                  />
                  {encuesta.opciones.map((o, i) => (
                    <div key={i} className={styles.pollOptRow}>
                      <MencionCampo
                        placeholder={`${es ? 'Opción' : 'Option'} ${i + 1}`}
                        maxLength={80}
                        value={o}
                        onChange={(e) => cambiarOpcion(i, e.target.value)}
                        userKey={userKey}
                        es={es}
                      />
                      {encuesta.opciones.length > 2 && (
                        <button type="button" onClick={() => quitarOpcion(i)} aria-label={es ? 'Eliminar opción' : 'Remove option'}>
                          <ion-icon name="close-circle" suppressHydrationWarning></ion-icon>
                        </button>
                      )}
                    </div>
                  ))}
                  {encuesta.opciones.length < 6 && (
                    <button type="button" className={styles.pollAdd} onClick={agregarOpcion}>
                      <ion-icon name="add-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Agregar opción' : 'Add option'}
                    </button>
                  )}
                </div>
              )}

              {aviso && <p className={styles.aviso}>{aviso}</p>}
            </div>

            {/* ===== Barra inferior: agregar a la publicacion ===== */}
            <div className={styles.toolbar}>
              <span className={styles.toolbarLabel}>{es ? 'Agregar a tu publicación' : 'Add to your post'}</span>
              <div className={styles.tools}>
                <button
                  type="button"
                  className={styles.tool}
                  disabled={!!encuesta}
                  title={encuesta ? (es ? 'No se puede combinar con lo que ya agregaste a la publicación.' : "Can't be combined with what you've already added to the post.") : undefined}
                  onClick={() => fileRef.current?.click()}
                >
                  <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                  <span>{es ? 'Foto/video' : 'Photo/video'}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.tool} ${encuesta ? styles.toolOn : ''}`}
                  disabled={adjuntos.length > 0}
                  title={adjuntos.length ? (es ? 'No se puede combinar con lo que ya agregaste a la publicación.' : "Can't be combined with what you've already added to the post.") : undefined}
                  onClick={() => setEncuesta(encuesta ? null : { pregunta: '', opciones: ['', ''] })}
                >
                  <ion-icon name="pie-chart-outline" suppressHydrationWarning></ion-icon>
                  <span>{es ? 'Encuesta' : 'Poll'}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.tool} ${sentimiento ? styles.toolOn : ''}`}
                  onClick={() => setVista('sentimiento')}
                >
                  <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
                  <span>{es ? 'Sentimiento' : 'Feeling'}</span>
                </button>
              </div>
              <button type="button" className={styles.btnPublicar} disabled={!puedeEnviar} onClick={publicar}>
                {convirtiendo !== null
                  ? (es ? `Convirtiendo… ${Math.round(convirtiendo * 100)}%` : `Converting… ${Math.round(convirtiendo * 100)}%`)
                  : publicando
                    ? (es ? 'Publicando...' : 'Posting...')
                    : (es ? 'Publicar' : 'Post')}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }}
            />
          </>
        )}
      </div>
    </div>
  );
}
