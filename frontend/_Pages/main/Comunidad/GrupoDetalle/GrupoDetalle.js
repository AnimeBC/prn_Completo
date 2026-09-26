'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './grupoDetalle.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AuthModal from '@/_Pages/main/Auth/AuthModal';
import CrearPublicacion from '@/_Pages/main/Comunidad/GrupoDetalle/CrearPublicacion/CrearPublicacion';
import { apiComunidad, comunidadMedia } from '@/_Extras/Comunidad/api.js';
import { MencionCampo, TextoMenciones } from '@/_Extras/Comunidad/menciones.js';
import { sentimientoTexto, sentimientoPorId } from '@/_Extras/Comunidad/sentimientos.js';
import { fecha, hace, presenciaEstado } from '@/_Extras/Fecha/fecha.js';
import { abrirCanal } from '@/_Extras/Canales/canal.js';
import { fmtNum } from '@/_Extras/Datos/num.js';
// Reproductor propio del sitio (el mismo de /videos) para los videos del feed.
import Reproductor from '@/_Pages/main/Videos/componentes/reproductor/reproductor';

function ini(n) {
  return String(n || 'U').trim().slice(0, 1).toUpperCase();
}

// Reacciones estilo Facebook (los iconos SON los emojis de siempre).
const REACCIONES = [
  { id: 'like', icon: '👍', es: 'Me gusta', en: 'Like', color: '#F20D16' },
  { id: 'love', icon: '❤️', es: 'Me encanta', en: 'Love', color: '#F33E58' },
  { id: 'joy', icon: '😂', es: 'Me divierte', en: 'Haha', color: '#F7B928' },
  { id: 'wow', icon: '😮', es: 'Me asombra', en: 'Wow', color: '#36C5F0' },
  { id: 'sad', icon: '😢', es: 'Me entristece', en: 'Sad', color: '#4A9BFF' },
  { id: 'angry', icon: '😡', es: 'Me enoja', en: 'Angry', color: '#E9710F' },
];

// Texto largo: a partir de aqui el post se corta con "ver mas".
const TXT_MAX = 560;

// Cuantos comentarios se pintan de golpe (carga progresiva: al abrir y al
// tocar "Ver mas"; asi un hilo largo no traba el navegador).
const COM_POR_LOTE = 15;

/** Clave de instancia para menus/reacciones: cada copia del mismo post
 *  (feed, modal de comentarios, visor) abre y cierra lo SUYO. */
function claveInst(inst, id) {
  return `${inst || 'feed'}:${id}`;
}

/** Raices del hilo segun el orden elegido (relevancia | recientes | todos). */
function ordenarRaices(lista, orden) {
  const base = lista.filter((c) => !c.parent_id);
  if (orden === 'todos') return base; // orden del servidor (mas antiguo primero)
  if (orden === 'recientes') {
    return base.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  return base.sort((a, b) => ((b.likes || 0) - (a.likes || 0))
    || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

// Orden del hilo de comentarios (menu con descripcion, estilo Facebook).
const ORDENES = [
  {
    id: 'relevantes', es: 'Más relevantes', en: 'Most relevant',
    descEs: 'Se muestran primero los comentarios con más interacciones.',
    descEn: 'Comments with the most interactions are shown first.',
  },
  {
    id: 'recientes', es: 'Más recientes', en: 'Most recent',
    descEs: 'Se muestran todos los comentarios; los más recientes aparecen primero.',
    descEn: 'All comments are shown; the most recent appear first.',
  },
  {
    id: 'todos', es: 'Todos los comentarios', en: 'All comments',
    descEs: 'Se muestran todos los comentarios, del más antiguo al más nuevo.',
    descEn: 'All comments are shown, from oldest to newest.',
  },
];

/** Comentario (con respuestas anidadas de un solo nivel). */
function Comentario({ c, p, es, ctx, hijos }) {
  const {
    respondiendo, setRespondiendo, respTexto, setRespTexto, comentar,
    likeComentario, borrarComentario, puedeBorrarComentario, meAvatar, meIni,
    comEnviando, userKey,
  } = ctx;
  const autor = c.usuario || (es ? 'Alguien' : 'Someone');
  const sePuedeBorrar = puedeBorrarComentario(p, c);
  // Texto largo: se corta y se despliega con "Ver mas" (como Facebook).
  const [verTexto, setVerTexto] = useState(false);
  // Varias respuestas: se muestran 2 y el resto tras "Ver N respuestas".
  const [verHijos, setVerHijos] = useState(false);
  const largo = !!c.texto && c.texto.length > 480;
  const texto = largo && !verTexto ? c.texto.slice(0, 480) + '...' : c.texto;
  const colapsar = !verHijos && hijos.length > 3;
  const visibles = colapsar ? hijos.slice(0, 2) : hijos;
  return (
    <div className={styles.comentario}>
      <span className={styles.comAvatar}>
        {c.avatar ? <img src={comunidadMedia(c.avatar)} alt="" /> : (c.usuario ? ini(c.usuario) : '?')}
      </span>
      <div className={styles.comCuerpo}>
        <div className={styles.comBubble}>
          <span className={styles.comUser}>{autor}</span>
          <p className={styles.comTexto}><TextoMenciones>{texto}</TextoMenciones></p>
          {/* Contador de "me gusta" flotando sobre la burbuja (Facebook) */}
          {c.likes > 0 && (
            <span
              className={`${styles.comBadge} ${c.liked ? styles.comBadgeOn : ''}`}
              title={es ? 'Me gusta' : 'Like'}
            >
              <ion-icon name="heart" suppressHydrationWarning></ion-icon>
              {fmtNum(c.likes)}
            </span>
          )}
        </div>
        {largo && !verTexto && (
          <button type="button" className={styles.verRespuestas} onClick={() => setVerTexto(true)}>
            {es ? 'Ver más' : 'See more'}
          </button>
        )}
        <div className={styles.comMeta}>
          <span className={styles.comTiempo}>{hace(c.created_at, es ? 'es' : 'en')}</span>
          <button
            type="button"
            className={`${styles.comAccion} ${c.liked ? styles.comAccionOn : ''}`}
            onClick={() => likeComentario(c, p.id)}
          >
            <ion-icon name={c.liked ? 'heart' : 'heart-outline'} suppressHydrationWarning></ion-icon>
            {es ? 'Me gusta' : 'Like'}
          </button>
          <button type="button" className={styles.comAccion} onClick={() => setRespondiendo(respondiendo === c.id ? null : c.id)}>
            {es ? 'Responder' : 'Reply'}
          </button>
          {sePuedeBorrar && (
            <button type="button" className={`${styles.comAccion} ${styles.comBorrar}`} onClick={() => borrarComentario(c, p.id)} aria-label={es ? 'Eliminar' : 'Delete'}>
              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
            </button>
          )}
        </div>

        {respondiendo === c.id && (
          <div className={styles.comRow}>
            <span className={styles.comAvatarMe}>{meAvatar ? <img src={comunidadMedia(meAvatar)} alt="" /> : meIni}</span>
            <MencionCampo
              className={styles.comInput}
              autoFocus
              placeholder={es ? 'Responde...' : 'Reply...'}
              value={respTexto}
              onChange={(e) => setRespTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') comentar(p, respTexto, c.parent_id || c.id, ctx.media); }}
              userKey={userKey}
              es={es}
            />
            <button
              type="button"
              className={styles.comSend}
              disabled={!respTexto.trim() || comEnviando}
              onClick={() => comentar(p, respTexto, c.parent_id || c.id, ctx.media)}
              aria-label="Enviar"
            >
              <ion-icon
                name={comEnviando ? 'reload-outline' : 'send-outline'}
                className={comEnviando ? styles.comSendCarga : undefined}
                suppressHydrationWarning
              ></ion-icon>
            </button>
          </div>
        )}

        {hijos.length > 0 && (
          <div className={styles.hijos}>
            {visibles.map((h) => <Comentario key={h.id} c={h} p={p} es={es} ctx={ctx} hijos={[]} />)}
          </div>
        )}
        {colapsar && (
          <button type="button" className={styles.verRespuestas} onClick={() => setVerHijos(true)}>
            {es ? `Ver ${hijos.length - 2} respuestas` : `View ${hijos.length - 2} replies`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Menu de 3 puntos del post (destacar / copiar enlace / eliminar).
 *  Se usa en el feed, en el modal de comentarios y en el visor: cada uno
 *  lleva su propia "instancia" (inst) para que el menu abierto NO se abra
 *  en las demas copias del mismo post. */
function MenuPost({ p, es, ctx, inst = 'feed' }) {
  const { menuPost, puedoModerar, puedoExpulsar, esDueno, fijar, copiarEnlace, borrarPostPedir, expulsarDelPost, userKey } = ctx;
  const clave = claveInst(inst, p.id);
  if (menuPost !== clave) return null;
  // Destacar: SOLO el dueño del grupo (ni moderadores ni semiduenos).
  const puedeFijarPost = !!esDueno && !!p.comunidad_id;
  // Borrar ajenas: igual que el backend (dueño o semidueno con 'editar_grupo').
  const puedeBorrarPost = !!p.mio || !!puedoModerar;
  // Expulsar al autor: igual que el backend (dueño o semidueno con
  // 'eliminar_miembros'); nunca a uno mismo ni a un post anonimo.
  const puedeExpulsarPost = !!puedoExpulsar && !!p.comunidad_id
    && !!p.user_key && !!userKey && String(p.user_key) !== String(userKey);
  return (
    <div className={styles.postMenu} role="menu">
      {puedeFijarPost && (
        <button type="button" onClick={() => fijar(p)}>
          <ion-icon name="pin-outline" suppressHydrationWarning></ion-icon>
          {p.fijado ? (es ? 'Quitar de destacados' : 'Unpin') : (es ? 'Destacar publicación' : 'Pin post')}
        </button>
      )}
      <button type="button" onClick={() => copiarEnlace(p)}>
        <ion-icon name="link-outline" suppressHydrationWarning></ion-icon>
        {es ? 'Copiar enlace' : 'Copy link'}
      </button>
      {puedeBorrarPost && (
        <button type="button" className={styles.menuDanger} onClick={() => borrarPostPedir(p)}>
          <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
          {es ? 'Eliminar publicación' : 'Delete post'}
        </button>
      )}
      {puedeExpulsarPost && (
        <button type="button" className={styles.menuDanger} onClick={() => expulsarDelPost(p)}>
          <ion-icon name="person-remove-outline" suppressHydrationWarning></ion-icon>
          {es ? 'Expulsar del grupo' : 'Kick from group'}
        </button>
      )}
    </div>
  );
}

/** Barra de acciones del post (Me gusta / Comentar / Compartir + chips).
 *  Se usa en el feed, en el modal de comentarios y en el visor: cada copia
 *  tiene su propia "instancia" (inst), asi el selector de reacciones abierto
 *  solo se ve en la que lo abrio. */
function BarraAcciones({ p, es, ctx, inst = 'feed' }) {
  const { reaccionar, abrirComentarios, compartir, abrirReacciones, toggleRx, rxAbierta } = ctx;
  const clave = claveInst(inst, p.id);
  const rx = REACCIONES.find((r) => r.id === p.mi_reaccion);
  // Maximo 3 tipos de reaccion con contador (los de mayor cantidad).
  const topReac = Object.entries(p.reacciones || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Movil: mantener pulsado "Me gusta" abre las reacciones (como Facebook).
  const lpTimer = useRef(null);
  const lpHecho = useRef(false);
  function lpInicio() {
    lpTimer.current = setTimeout(() => {
      lpHecho.current = true;
      toggleRx(clave);
    }, 420);
  }
  function lpFin(e) {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
    if (lpHecho.current) {
      lpHecho.current = false;
      // Cancela el click sintetico (evita reaccionar al soltar).
      if (e && e.preventDefault) e.preventDefault();
    }
  }
  function clickMeGusta() {
    if (lpHecho.current) { lpHecho.current = false; return; }
    toggleRx(null);
    reaccionar(p, p.mi_reaccion || 'like');
  }

  return (
    <div className={styles.actionsBar}>
      <div className={`${styles.rxWrap} ${rxAbierta === clave ? styles.rxAbierto : ''}`} data-pop="1">
        <button
          type="button"
          className={`${styles.actBtn} ${rx ? styles.actBtnOn : ''}`}
          style={rx ? { color: rx.color } : null}
          onClick={clickMeGusta}
          onTouchStart={lpInicio}
          onTouchEnd={lpFin}
          onTouchCancel={lpFin}
        >
          <span className={styles.actEmoji}>{rx ? rx.icon : '👍'}</span>
          <span>{rx ? (es ? rx.es : rx.en) : (es ? 'Me gusta' : 'Like')}</span>
        </button>
        {/* Las demas reacciones salen al pasar el raton (escritorio)
            o manteniendo pulsado el boton (movil). */}
        <div className={styles.rxPop} data-pop="1">
          {REACCIONES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={styles.rxItem}
              style={{ '--rx': r.color }}
              onClick={() => { toggleRx(null); reaccionar(p, r.id); }}
            >
              <span className={styles.rxIcono}>{r.icon}</span>
              <span className={styles.rxLabel}>{es ? r.es : r.en}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={styles.actBtn} onClick={() => abrirComentarios(p)}>
        <ion-icon name="chatbubble-outline" suppressHydrationWarning></ion-icon>
        <span>{es ? 'Comentar' : 'Comment'}</span>
        {p.comentarios > 0 && <span className={styles.actNum}>{fmtNum(p.comentarios)}</span>}
      </button>
      <button type="button" className={styles.actBtn} onClick={() => compartir(p)}>
        <ion-icon name="share-social-outline" suppressHydrationWarning></ion-icon>
        <span>{es ? 'Compartir' : 'Share'}</span>
        {p.compartidos > 0 && <span className={styles.actNum}>{fmtNum(p.compartidos)}</span>}
      </button>
      {/* Cantidades de reacciones (maximo 3 tipos): abren el modal
          con la lista de quienes reaccionaron. */}
      {topReac.length > 0 && (
        <div className={styles.rxTop}>
          {topReac.map(([rid, n]) => {
            const r = REACCIONES.find((x) => x.id === rid);
            if (!r) return null;
            return (
              <button
                key={rid}
                type="button"
                className={styles.rxTopItem}
                style={{ '--rx': r.color }}
                title={`${es ? r.es : r.en}: ${n}`}
                onClick={() => abrirReacciones(p, rid)}
              >
                <span className={styles.rxTopIcono}>{r.icon}</span>
                <span className={styles.rxTopNum}>{fmtNum(n)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Publicacion del grupo: cabecera, media, encuesta, reacciones y comentarios.
 *  enModal: se dibuja dentro del modal de comentarios (sin id duplicado).
 *  onCerrar: solo en el modal, la "X" del lado del boton de opciones. */
function PostGrupo({ p, es, ctx, enModal = false, onCerrar = null }) {
  const {
    expandidos, verMas, comentar, toggleMenu, votar, flash, meAvatar, meIni, abrirVisor,
    comEnviando, comAviso, userKey,
  } = ctx;

  const media = Array.isArray(p.media) ? p.media : [];
  // Se separa por tipo: las fotos van en collage (estilo Facebook) y los
  // videos con el reproductor del sitio. (Los audios ya no se aceptan.)
  const fotos = media.filter((m) => m.tipo === 'foto');
  const videos = media.filter((m) => m.tipo === 'video');
  // Mas de 6 fotos: se muestran 5 y la ultima lleva el contador "+N".
  const fotosVisibles = fotos.length > 6 ? fotos.slice(0, 5) : fotos;
  const fotosOcultas = fotos.length - fotosVisibles.length;
  const largo = !!p.texto && p.texto.length > TXT_MAX;
  const expandido = !!expandidos[p.id];
  const texto = !p.texto ? '' : (expandido || !largo ? p.texto : p.texto.slice(0, TXT_MAX) + '...');
  const sent = sentimientoPorId(p.sentimiento);
  const autor = p.anonimo ? (es ? 'Publicación anónima' : 'Anonymous') : (p.usuario || (es ? 'Usuario' : 'User'));
  // Instancia de esta copia: menu/reacciones abiertos NO se pasan a las demas.
  const inst = enModal ? 'modal' : 'feed';

  return (
    <article id={enModal ? undefined : `post-${p.id}`} className={`${styles.post} ${flash === p.id ? styles.postFlash : ''}`}>
      {p.fijado && (
        <div className={styles.pinTag}>
          <ion-icon name="pin-outline" suppressHydrationWarning></ion-icon>
          {es ? 'Destacado por los administradores' : 'Pinned by admins'}
        </div>
      )}

      <header className={styles.postHead}>
        <span className={styles.postAvatar}>
          {p.avatar
            ? <img src={comunidadMedia(p.avatar)} alt="" />
            : p.anonimo
              ? <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon>
              : ini(autor)}
        </span>
        <div className={styles.postWho}>
          <span className={styles.postUser}>{autor}</span>
          <span className={styles.postTime}>
            {sent && (
              <span className={styles.moodChip}>
                <ion-icon name={sent.icon} suppressHydrationWarning></ion-icon>
                {sentimientoTexto(sent, es)}
              </span>
            )}
            {fecha(p.created_at, es ? 'es' : 'en')}
          </span>
        </div>

        <div className={styles.postMoreWrap} data-pop="1">
          <button type="button" className={styles.postMore} data-pop="1" onClick={() => toggleMenu(claveInst(inst, p.id))} aria-label={es ? 'Opciones' : 'Options'}>
            <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
          </button>
          <MenuPost p={p} es={es} ctx={ctx} inst={inst} />
        </div>

        {/* Cerrar el modal de comentarios (a la derecha del boton de opciones) */}
        {enModal && onCerrar && (
          <button type="button" className={styles.postClose} onClick={onCerrar} aria-label={es ? 'Cerrar' : 'Close'}>
            <ion-icon name="close" suppressHydrationWarning></ion-icon>
          </button>
        )}
      </header>

      {texto && <p className={styles.postText}><TextoMenciones>{texto}</TextoMenciones></p>}
      {largo && (
        <button type="button" className={styles.verMas} onClick={() => verMas(p.id)}>
          {expandido ? (es ? 'Ver menos' : 'See less') : (es ? 'Ver más' : 'See more')}
        </button>
      )}

      {/* Fotos: collage estilo Facebook (1..6, con "+N" si sobran) */}
      {fotosVisibles.length > 0 && (
        <div className={`${styles.mediaGrid} ${styles['m' + fotosVisibles.length]}`}>
          {fotosVisibles.map((m, i) => {
            const esUltima = i === fotosVisibles.length - 1;
            const conContador = esUltima && fotosOcultas > 0;
            return (
              <div key={`${p.id}-${m.url}`} className={styles.mediaItem}>
                <img
                  src={comunidadMedia(m.url)}
                  alt=""
                  loading="lazy"
                  onClick={() => abrirVisor(p, m)}
                />
                {/* Lupa: abrir la foto con la lupa puesta (ver en detalle) */}
                <button
                  type="button"
                  className={styles.mediaLupa}
                  title={es ? 'Ver en detalle' : 'View in detail'}
                  aria-label={es ? 'Ver en detalle' : 'View in detail'}
                  onClick={() => abrirVisor(p, m, 'foto', true)}
                >
                  <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
                </button>
                {/* "+N": abre la preview en la PRIMERA foto que no se ve */}
                {conContador && (
                  <button
                    type="button"
                    className={styles.mediaMas}
                    title={es ? 'Ver las fotos ocultas' : 'See the hidden photos'}
                    onClick={() => abrirVisor(p, fotos[fotosVisibles.length], 'foto')}
                  >
                    +{fotosOcultas}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Videos: reproductor propio + su PROPIO apartado de comentarios */}
      {videos.map((m, i) => {
        const hilo = comMedia[m.url];
        return (
          <div key={`v-${p.id}-${i}`} className={styles.postVideo}>
            <button
              type="button"
              className={styles.videoAmpliar}
              onClick={() => abrirVisor(p, m, 'video')}
              title={es ? 'Pantalla completa' : 'Fullscreen'}
              aria-label={es ? 'Ver el video a pantalla completa' : 'View video fullscreen'}
            >
              <ion-icon name="expand-outline" suppressHydrationWarning></ion-icon>
            </button>
            <Reproductor src={comunidadMedia(m.url)} compact ads={false} />
            <button type="button" className={styles.videoComBtn} onClick={() => toggleVideoCom(p.id, m.url)}>
              <ion-icon name="chatbubble-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Comentarios del video' : 'Video comments'}
              {hilo?.lista ? ` (${fmtNum(hilo.lista.length)})` : ''}
            </button>
            {hilo?.abierto && (
              <div className={styles.videoCom}>
                {comAviso && <p className={styles.comAvisoTxt}>{comAviso}</p>}
                {!hilo.lista ? (
                  <p className={styles.videoComTitulo}>{es ? 'Cargando...' : 'Loading...'}</p>
                ) : (
                  <>
                    <p className={styles.videoComTitulo}>
                      {es ? `Comentarios de este video · ${hilo.lista.length}` : `Video comments · ${hilo.lista.length}`}
                    </p>
                    {hilo.lista.filter((c) => !c.parent_id).map((c) => (
                      <Comentario
                        key={c.id}
                        c={c}
                        p={p}
                        es={es}
                        ctx={{ ...ctx, media: m.url }}
                        hijos={hilo.lista.filter((h) => h.parent_id === c.id)}
                      />
                    ))}
                    <div className={styles.comRow}>
                      <span className={styles.comAvatarMe}>{meAvatar ? <img src={comunidadMedia(meAvatar)} alt="" /> : meIni}</span>
                      <MencionCampo
                        className={styles.comInput}
                        autoFocus
                        placeholder={es ? 'Comenta este video...' : 'Comment on this video...'}
                        value={hilo.texto || ''}
                        onChange={(e) => setTextoMedia(m.url, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') comentar(p, textoMedia(m.url), null, m.url); }}
                        userKey={userKey}
                        es={es}
                      />
                      <button
                        type="button"
                        className={styles.comSend}
                        disabled={!(hilo.texto || '').trim() || comEnviando}
                        onClick={() => comentar(p, textoMedia(m.url), null, m.url)}
                        aria-label="Enviar"
                      >
                        <ion-icon
                          name={comEnviando ? 'reload-outline' : 'send-outline'}
                          className={comEnviando ? styles.comSendCarga : undefined}
                          suppressHydrationWarning
                        ></ion-icon>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {p.encuesta && Array.isArray(p.encuesta.opciones) && p.encuesta.opciones.length > 0 && (
        <div className={styles.poll}>
          <strong className={styles.pollPregunta}>{p.encuesta.pregunta}</strong>
          <div className={styles.pollOpciones}>
            {p.encuesta.opciones.map((o) => {
              const total = p.encuesta.total || 0;
              const pct = total ? Math.round(((o.votos || 0) / total) * 100) : 0;
              const mia = p.encuesta.mi_voto === o.id;
              return (
                <button key={o.id} type="button" className={`${styles.pollOpt} ${mia ? styles.pollOptMia : ''}`} onClick={() => votar(p, o.id)}>
                  <span className={styles.pollBarra} style={{ width: `${pct}%` }} />
                  <span className={styles.pollOptTxt}>
                    {mia && <ion-icon name="checkmark-circle" suppressHydrationWarning></ion-icon>}
                    {o.texto}
                  </span>
                  <span className={styles.pollPct}>{pct}%</span>
                </button>
              );
            })}
          </div>
          <span className={styles.pollTotal}>
            {fmtNum(p.encuesta.total || 0)} {es ? 'votos' : 'votes'}
            <span className={styles.dot}>·</span>
            {es ? 'Toca una opción para votar' : 'Tap an option to vote'}
          </span>
        </div>
      )}

      <BarraAcciones p={p} es={es} ctx={ctx} inst={inst} />
    </article>
  );
}

export default function GrupoDetalle({ id, initialGrupo = null }) {
  const router = useRouter();
  // Reacciona a cambios de ?tab= aunque la pagina ya este montada (p. ej. al
  // pulsar "Información"/"Miembros" desde el chat flotante).
  const searchParams = useSearchParams();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { user, userKey, authed } = useAuth();

  const [grupo, setGrupo] = useState(initialGrupo);
  const [soyMiembro, setSoyMiembro] = useState(false);
  const [solicitud, setSolicitud] = useState(null);
  const [rol, setRol] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [soyDueno, setSoyDueno] = useState(false);
  // true = lo expulsaron del grupo: el chat no existe para él.
  const [expulsado, setExpulsado] = useState(false);
  const [posts, setPosts] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('conversacion');
  const [confirmar, setConfirmar] = useState(null); // 'entrar' | 'cancelar' | 'salir' | 'borrar'
  // Evita repetir la salida si el grupo sigue eliminado y llegan más eventos.
  const salioRef = useRef(false);
  const postsRef = useRef([]);
  // Campo de comentario del modal (al pulsar "Comentar" ya abierto se enfoca).
  const comInputRef = useRef(null);
  // Id del hilo abierto (evita recargar/repetir el efecto de la URL).
  const comAbiertoRef = useRef(0);
  // Campo de comentario del visor de fotos/videos.
  const visorComInputRef = useRef(null);
  // La proxima apertura del visor arranca con la lupa puesta (ver detalle).
  const visorZoomRef = useRef(false);

  // ===== Feed: orden =====
  const [filtro, setFiltro] = useState('recientes');

  // ===== Publicaciones: interacciones =====
  const [expandidos, setExpandidos] = useState({});
  const [comAbierto, setComAbierto] = useState(null);
  const [comList, setComList] = useState([]);
  const [comTexto, setComTexto] = useState('');
  const [respondiendo, setRespondiendo] = useState(null);
  const [respTexto, setRespTexto] = useState('');
  const [menuPost, setMenuPost] = useState(null);
  const [rxAbierta, setRxAbierta] = useState(null);
  const [flash, setFlash] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [postBorrar, setPostBorrar] = useState(null);
  // Post cuyo autor vamos a expulsar del grupo (confirmacion).
  const [postExpulsar, setPostExpulsar] = useState(null);
  // Visor de foto/video a pantalla completa: { lista, i, tipo, postId }.
  const [visor, setVisor] = useState(null);
  // Comentarios POR ARCHIVO (foto o video): { [url]: { lista, texto, abierto } }.
  // Cada foto/video tiene su propio hilo, aparte del general de la publicacion.
  const [comMedia, setComMedia] = useState({});
  // Modal "quien reacciono": { post, filtro, data, total, cargando, fin, error }.
  const [reacModal, setReacModal] = useState(null);

  // ===== Modal "Crear publicacion" =====
  // null = cerrado; 'texto' | 'media' | 'encuesta' | 'sentimiento' = vista inicial.
  const [crear, setCrear] = useState(null);

  // ===== Modal "Comentarios" (hilo completo de una publicacion) =====
  const [comCargando, setComCargando] = useState(false);
  const [comErr, setComErr] = useState('');
  // Orden del hilo: 'relevantes' | 'recientes' | 'todos' (+ su menu abierto).
  const [comOrden, setComOrden] = useState('relevantes');
  const [comOrdenMenu, setComOrdenMenu] = useState(false);
  // Carga progresiva: cuantas raices se pintan en el modal y en el visor.
  const [comVisibles, setComVisibles] = useState(COM_POR_LOTE);
  const [visorVisibles, setVisorVisibles] = useState(COM_POR_LOTE);
  // Anti-spam: una peticion en vuelo + intervalo por publicacion + aviso
  // local (el aviso general quedaria DETRAS del overlay del modal).
  const [comEnviando, setComEnviando] = useState(false);
  const [comAviso, setComAviso] = useState('');
  const comUltimasRef = useRef({}); // post_id -> fecha del ultimo comentario
  const comAvisoTimer = useRef(null);

  // ===== Modal "Compartir" (hoja estilo Android / Facebook) =====
  const [sharePost, setSharePost] = useState(null);     // publicacion a compartir
  const [shareVista, setShareVista] = useState('menu'); // 'menu' | 'amigos'
  const [shareQ, setShareQ] = useState('');
  const [shareGente, setShareGente] = useState([]);
  const [shareListo, setShareListo] = useState(false); // primera busqueda hecha
  const [shareEnviado, setShareEnviado] = useState({});    // { user_key: true } ya enviados
  const [shareEnviando, setShareEnviando] = useState(null); // user_key en curso
  const [shareCopiado, setShareCopiado] = useState(false);
  const [shareErr, setShareErr] = useState('');

  const cargarGrupo = useCallback(async () => {
    if (salioRef.current) return;
    const r = await apiComunidad.grupo(id, userKey);
    if (r?.error === 'Comunidad no encontrada') {
      // Fue eliminado (Redis -> SSE): aviso y salida en TODAS las sesiones.
      salioRef.current = true;
      setMsg(es ? 'Este grupo fue eliminado.' : 'This group was deleted.');
      setTimeout(() => { router.push('/comunidad'); }, 1400);
      return;
    }
    if (r && r.grupo) setGrupo(r.grupo);
    setSoyMiembro(!!r?.soyMiembro);
    setSolicitud(r?.solicitud || null);
    setRol(r?.rol || null);
    setPermisos(Array.isArray(r?.permisos) ? r.permisos : []);
    setSoyDueno(!!r?.soyDueno);
    setExpulsado(!!r?.expulsado);
  }, [id, userKey, es, router]);

  // id numerico real (por si la URL trae slug).
  const grupoId = grupo?.id;

  const cargarPosts = useCallback(async () => {
    if (!grupoId) return;
    // Solo muestra el "cargando" si no hay nada en pantalla (evita parpadeos).
    if (postsRef.current.length === 0) setCargando(true);
    const r = await apiComunidad.feed(filtro, userKey, grupoId);
    const arr = Array.isArray(r?.data) ? r.data : [];
    postsRef.current = arr;
    setPosts(arr);
    setCargando(false);
  }, [grupoId, userKey, filtro]);

  // Lista de miembros con presencia real (edad desde la BD) para la pestaña.
  const cargarMiembros = useCallback(async () => {
    if (!grupoId) return;
    const r = await apiComunidad.gruposMiembros(grupoId, { limit: 300, userKey });
    setMiembros(Array.isArray(r?.data) ? r.data : []);
  }, [grupoId, userKey]);

  const recargarComentarios = useCallback(async (pid) => {
    if (!pid) return;
    const r = await apiComunidad.comentarios(pid, userKey);
    setComList(Array.isArray(r?.data) ? r.data : []);
  }, [userKey]);

  // ===== Comentarios de una foto/video concreta =====
  const cargarMediaCom = useCallback(async (pid, url) => {
    if (!pid || !url) return;
    const r = await apiComunidad.comentarios(pid, userKey, url);
    const lista = Array.isArray(r?.data) ? r.data : [];
    setComMedia((m) => ({ ...m, [url]: { ...(m[url] || {}), lista } }));
  }, [userKey]);

  /** Abre/cierra el hilo de comentarios de un video (en el feed). */
  function toggleVideoCom(pid, url) {
    const actual = comMedia[url];
    if (actual?.abierto) {
      setComMedia((m) => ({ ...m, [url]: { ...m[url], abierto: false } }));
      return;
    }
    // Al abrir otro hilo se limpia la respuesta pendiente (es estado global).
    setRespondiendo(null);
    setRespTexto('');
    setComMedia((m) => ({ ...m, [url]: { ...(m[url] || {}), abierto: true } }));
    if (!actual?.lista) cargarMediaCom(pid, url);
  }

  function textoMedia(url) { return comMedia[url]?.texto || ''; }
  function setTextoMedia(url, v) {
    setComMedia((m) => ({ ...m, [url]: { ...(m[url] || {}), texto: v } }));
  }

  // Carga los comentarios del archivo visible en el visor (si aun no estan).
  const visorUrl = visor?.lista?.[visor.i]?.url || null;
  useEffect(() => {
    if (!visor || !visorUrl) return;
    if (comMedia[visorUrl]?.lista) return;
    cargarMediaCom(visor.postId, visorUrl);
  }, [visor, visorUrl, comMedia, cargarMediaCom]);

  // Cada archivo (foto/video) arranca con la ventana de comentarios al minimo.
  useEffect(() => { setVisorVisibles(COM_POR_LOTE); }, [visorUrl]);

  useEffect(() => { cargarGrupo(); }, [cargarGrupo]);
  useEffect(() => { cargarPosts(); }, [cargarPosts]);
  useEffect(() => { if (tab === 'miembros') cargarMiembros(); }, [tab, cargarMiembros]);

  // Lee ?tab= de la URL (y reacciona si cambia).
  useEffect(() => {
    const t0 = searchParams?.get('tab');
    if (t0 && ['conversacion', 'informacion', 'miembros'].includes(t0)) setTab(t0);
  }, [searchParams]);

  // Refleja la pestaña activa en la URL (?tab=...).
  function cambiarTab(t) {
    setTab(t);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  // Aviso temporal (se borra solo).
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  // Enlace profundo a una publicacion (?post=123).
  const yaScroll = useRef(0);
  useEffect(() => {
    const pid = Number(searchParams?.get('post'));
    if (!pid || yaScroll.current === pid || posts.length === 0) return;
    yaScroll.current = pid;
    const t = setTimeout(() => {
      const el = document.getElementById(`post-${pid}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlash(pid);
      setTimeout(() => setFlash((f) => (f === pid ? null : f)), 1600);
    }, 300);
    return () => clearTimeout(t);
  }, [searchParams, posts]);

  // Cierre de menus flotantes al hacer clic fuera.
  useEffect(() => {
    if (!menuPost && !rxAbierta && !comOrdenMenu) return;
    const h = (e) => {
      if (e.target?.closest?.('[data-pop]')) return;
      setMenuPost(null);
      setRxAbierta(null);
      setComOrdenMenu(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuPost, rxAbierta, comOrdenMenu]);

  // Visor de fotos: teclado (Esc / flechas). El campo de comentario arranca
  // ya enfocado, asi que solo cede al teclado si hay TEXTO escrito (para no
  // perder lo que se esta escribiendo).
  useEffect(() => {
    if (!visor) return;
    const h = (e) => {
      const t = e.target;
      const conTexto = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        && String(t.value || '').length > 0;
      if (conTexto) return;
      if (e.key === 'Escape') { cerrarVisor(); return; }
      if (e.key === 'ArrowRight') { navegarVisor(1); return; }
      if (e.key === 'ArrowLeft') { navegarVisor(-1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [visor, posts]);

  // El visor se rige por la URL (?post=<id>&foto=<indice en media>): asi el
  // "atras" del navegador o del movil lo cierra y la foto queda enlazable.
  const urlPostId = Number(searchParams?.get('post') || 0);
  const urlFotoIdx = Number(searchParams?.get('foto') || 0);
  useEffect(() => {
    if (!urlFotoIdx || !urlPostId) {
      setVisor((v) => (v ? null : v));
      return;
    }
    const p = posts.find((x) => x.id === urlPostId);
    if (!p) {
      if (posts.length) setVisor((v) => (v ? null : v));
      return;
    }
    const media = Array.isArray(p.media) ? p.media : [];
    if (!media.length) { setVisor((v) => (v ? null : v)); return; }
    const idx = Math.min(Math.max(urlFotoIdx, 1), media.length) - 1;
    const item = media[idx];
    const lista = media.filter((x) => x.tipo === item.tipo);
    const i = Math.max(0, lista.findIndex((x) => x.url === item.url));
    // Lupa pedida al abrir (solo aplica a fotos).
    const zoom0 = visorZoomRef.current;
    visorZoomRef.current = false;
    setVisor((v) => (v && v.postId === urlPostId && v.i === i && v.tipo === item.tipo
      ? v
      : {
        lista,
        i,
        tipo: item.tipo,
        postId: urlPostId,
        zoom: zoom0 && item.tipo === 'foto' ? { x: 50, y: 50 } : null,
      }));
  }, [urlPostId, urlFotoIdx, posts]);

  // El modal de comentarios se rige por la URL (?com=<id>): asi el "atras"
  // del navegador o del movil lo cierra y el hilo se puede enlazar.
  const urlComId = Number(searchParams?.get('com') || 0);
  useEffect(() => {
    if (!urlComId) {
      if (comAbiertoRef.current) cerrarComentarios();
      return;
    }
    if (comAbiertoRef.current === urlComId) return; // ya abierto
    const p = posts.find((x) => x.id === urlComId);
    if (!p) {
      if (posts.length) cerrarComentarios();
      return;
    }
    // Abre y carga el hilo con carga progresiva (COM_POR_LOTE por pantalla).
    comAbiertoRef.current = p.id;
    setComAbierto(p.id);
    setComList([]);
    setComTexto('');
    setComErr('');
    setComAviso('');
    setComOrdenMenu(false);
    setRespondiendo(null);
    setRespTexto('');
    setComVisibles(COM_POR_LOTE);
    setComCargando(true);
    apiComunidad.comentarios(p.id, userKey).then((r) => {
      // Se cerro o cambio de hilo mientras cargaba: se ignora.
      if (comAbiertoRef.current !== p.id) return;
      if (r?.error) setComErr(r.error);
      setComList(Array.isArray(r?.data) ? r.data : []);
      setComCargando(false);
    });
  }, [urlComId, posts, userKey]);

  // Realtime
  useEffect(() => {
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (tipo.startsWith('comunidad_')) {
        cargarGrupo();
        cargarPosts();
        if (tipo === 'comunidad_comment') {
          // Si el comentario es de una foto/video concreta, refresca ese hilo.
          const media = String(e?.detail?.payload?.media || '');
          const pid = Number(e?.detail?.payload?.post_id || 0);
          if (media && pid && comMedia[media]) cargarMediaCom(pid, media);
          else if (comAbierto) recargarComentarios(comAbierto);
        }
        if (tab === 'miembros') cargarMiembros();
      }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargarGrupo, cargarPosts, cargarMiembros, recargarComentarios, cargarMediaCom, comAbierto, comMedia, tab]);

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

  async function borrarPostConfirm() {
    setConfirmar(null);
    const pid = postBorrar?.id;
    setPostBorrar(null);
    if (!pid) return;
    const r = await apiComunidad.borrarPost(pid, userKey);
    if (r?.error) { setMsg(r.error); return; }
    postsRef.current = postsRef.current.filter((x) => x.id !== pid);
    setPosts(postsRef.current);
    if (comAbierto === pid) cerrarComentarios();
    setMsg(es ? 'Publicación eliminada.' : 'Post deleted.');
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
    if (confirmar === 'borrar') {
      return {
        titulo: es ? 'Eliminar publicación' : 'Delete post',
        texto: es ? '¿Seguro que quieres eliminar esta publicación? No se puede deshacer.' : 'Are you sure you want to delete this post? This cannot be undone.',
        ok: es ? 'Eliminar' : 'Delete',
        run: borrarPostConfirm,
      };
    }
    if (confirmar === 'expulsar') {
      return {
        titulo: es ? 'Expulsar del grupo' : 'Kick from group',
        texto: es
          ? `¿Seguro que quieres expulsar a ${postExpulsar?.usuario || 'este miembro'} del grupo? No podrá ver el grupo ni volver a unirse hasta que lo agregues de nuevo.`
          : `Are you sure you want to kick ${postExpulsar?.usuario || 'this member'} from the group? They won't be able to see or rejoin the group until you add them again.`,
        ok: es ? 'Expulsar' : 'Kick',
        run: expulsarConfirm,
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

  // ===== Interacciones del feed =====
  function exigirAuth() {
    if (authed) return true;
    setAuthOpen(true);
    return false;
  }

  function toggleMenu(id) {
    setRxAbierta(null);
    setMenuPost((m) => (m === id ? null : id));
  }

  function toggleRx(id) {
    setMenuPost(null);
    setRxAbierta((m) => (id === null ? null : m === id ? null : id));
  }

  async function reaccionar(p, r) {
    if (!exigirAuth()) return;
    const previa = p.mi_reaccion || null;
    // Optimista: cambia al instante y el servidor manda al final.
    setPosts((list) => list.map((x) => {
      if (x.id !== p.id) return x;
      const nueva = previa === r ? null : r;
      const reacciones = { ...(x.reacciones || {}) };
      if (previa) reacciones[previa] = Math.max(0, (reacciones[previa] || 0) - 1);
      if (nueva) reacciones[nueva] = (reacciones[nueva] || 0) + 1;
      const likes = Math.max(0, x.likes + (nueva ? (previa ? 0 : 1) : -1));
      return { ...x, mi_reaccion: nueva, liked: !!nueva, likes, reacciones };
    }));
    const r2 = await apiComunidad.like(p.id, userKey, r);
    if (r2?.error) { setMsg(r2.error); cargarPosts(); return; }
    setPosts((list) => list.map((x) => (x.id === p.id
      ? { ...x, mi_reaccion: r2.liked ? r2.reaccion : null, liked: !!r2.liked, likes: r2.likes ?? x.likes }
      : x)));
  }

  function urlPost(p) {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/comunidad/grupo/${grupo?.slug || grupoId}?tab=conversacion&post=${p.id}`;
  }

  async function copiarEnlace(p) {
    setMenuPost(null);
    const url = urlPost(p);
    try {
      await navigator.clipboard.writeText(url);
      setMsg(es ? 'Enlace copiado.' : 'Link copied.');
    } catch {
      setMsg(url);
    }
  }

  // ===== Modal "Compartir" (hoja estilo Android / Facebook) =====
  // Abre la hoja con las opciones (antes copiaba el enlace al instante).
  function compartir(p) {
    setMenuPost(null);
    setSharePost(p);
    setShareVista('menu');
    setShareQ('');
    setShareGente([]);
    setShareListo(false);
    setShareEnviado({});
    setShareEnviando(null);
    setShareCopiado(false);
    setShareErr('');
  }

  function cerrarShare() {
    setSharePost(null);
    setShareVista('menu');
  }

  /** Cuenta la publicacion como compartida (contador + evento Redis). */
  function registrarShare(p) {
    if (!p) return;
    apiComunidad.compartir(p.id);
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, compartidos: (x.compartidos || 0) + 1 } : x)));
  }

  async function copiarShare() {
    const p = sharePost;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(urlPost(p));
      registrarShare(p);
      setShareCopiado(true);
      setTimeout(() => setShareCopiado(false), 1800);
    } catch {
      setShareErr(urlPost(p));
    }
  }

  // Compartir del sistema (movil / navegador con Web Share API).
  async function shareNativo() {
    const p = sharePost;
    if (!p || typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({
        title: 'PICANTE.pe',
        text: (p.texto || '').trim().slice(0, 140),
        url: urlPost(p),
      });
      registrarShare(p);
      cerrarShare();
    } catch { /* el usuario cancelo */ }
  }

  // Personas para "Enviar a un amigo" (buscador con retardo).
  async function buscarGente(q) {
    if (!userKey) return;
    const r = await apiComunidad.amigos(userKey, { q, filtro: 'todos', limit: 12 });
    setShareGente(Array.isArray(r?.data) ? r.data : []);
    setShareListo(true);
  }

  useEffect(() => {
    if (!sharePost || shareVista !== 'amigos') return undefined;
    // La primera carga entra de inmediato; al escribir, con retardo.
    const t = setTimeout(() => buscarGente(shareQ.trim()), shareQ.trim() ? 260 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharePost, shareVista, shareQ, userKey]);

  // Envia el enlace de la publicacion por mensaje directo a esa persona.
  async function enviarAPersona(g) {
    const p = sharePost;
    if (!p || !g?.user_key || shareEnviando) return;
    if (!exigirAuth()) return;
    setShareErr('');
    const url = urlPost(p);
    const base = (p.texto || '').trim().slice(0, 140);
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('texto', base ? `${base} ${url}` : url);
    setShareEnviando(g.user_key);
    const r = await apiComunidad.dmEnviarFd(g.user_key, fd);
    setShareEnviando(null);
    if (r?.error) { setShareErr(r.error); return; }
    setShareEnviado((m) => ({ ...m, [g.user_key]: true }));
    registrarShare(p);
  }

  async function fijar(p) {
    setMenuPost(null);
    const r = await apiComunidad.fijarPost(p.id, userKey);
    if (r?.error) { setMsg(r.error); return; }
    setPosts((list) => list.map((x) => (x.id === p.id
      ? { ...x, fijado: !!r.fijado, fijado_en: r.fijado ? new Date().toISOString() : null }
      : x)));
    setMsg(r.fijado
      ? (es ? 'Publicación destacada.' : 'Post pinned.')
      : (es ? 'Se quitó de destacados.' : 'Unpinned.'));
  }

  function borrarPostPedir(p) {
    setMenuPost(null);
    setPostBorrar(p);
    setConfirmar('borrar');
  }

  // Expulsar al autor de la publicacion (solo dueño / semidueno con permiso).
  function expulsarDelPost(p) {
    setMenuPost(null);
    setPostExpulsar(p);
    setConfirmar('expulsar');
  }

  async function expulsarConfirm() {
    setConfirmar(null);
    const p = postExpulsar;
    setPostExpulsar(null);
    if (!p?.user_key || !grupoId) return;
    const r = await apiComunidad.quitarMiembro(grupoId, p.user_key, userKey);
    if (r?.error) { setMsg(r.error); return; }
    setMsg(es
      ? `${p.usuario || 'El miembro'} fue expulsado del grupo.`
      : `${p.usuario || 'Member'} was kicked from the group.`);
    cargarGrupo();
    cargarMiembros();
  }

  async function votar(p, opcion) {
    if (!exigirAuth()) return;
    const r = await apiComunidad.votarEncuesta(p.id, userKey, opcion);
    if (r?.error) { setMsg(r.error); return; }
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, encuesta: r.encuesta } : x)));
  }

  function verMas(pid) {
    setExpandidos((e) => ({ ...e, [pid]: !e[pid] }));
  }

  function cerrarComentarios() {
    comAbiertoRef.current = 0;
    setComAbierto(null);
    setComList([]);
    setComTexto('');
    setComErr('');
    setComCargando(false);
    setComOrdenMenu(false);
    setComAviso('');
    setRespondiendo(null);
    setRespTexto('');
    // Limpia ?com= de la URL (asi el "atras" no deja un hilo fantasma).
    if (typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('com')) {
      router.replace(urlCom(null), { scroll: false });
    }
  }

  /** URL del modal de comentarios (?com=<id>) para poder retroceder. */
  function urlCom(pid) {
    const url = new URL(window.location.href);
    if (pid) url.searchParams.set('com', String(pid));
    else url.searchParams.delete('com');
    return url.pathname + url.search;
  }

  // Abre el modal del hilo: pide sesion y mete ?com= en la URL; el efecto
  // de mas abajo (URL -> estado) es el que lo carga y lo pinta.
  function abrirComentarios(p) {
    if (!exigirAuth()) return;
    // Ya abierto (p. ej. el boton del post DENTRO del modal): solo enfoca
    // el campo de comentario en vez de cerrar.
    if (comAbierto === p.id) { comInputRef.current?.focus(); return; }
    router.push(urlCom(p.id), { scroll: false });
  }

  // Aviso DENTRO del modal/visor (el aviso general se pinta detras del overlay).
  function comAvisoMostrar(txt) {
    setComAviso(txt);
    if (comAvisoTimer.current) clearTimeout(comAvisoTimer.current);
    comAvisoTimer.current = setTimeout(() => setComAviso(''), 3200);
  }

  // ===== Comentarios =====
  // media: null = hilo general de la publicacion; url = hilo de esa foto/video.
  async function comentar(p, txt, parentId, media = null) {
    const tx = String(txt || '').trim();
    if (!tx) return;
    if (!exigirAuth()) return;
    // Anti-spam: una peticion en vuelo y un intervalo por publicacion
    // (el backend tambien lo exige: 429 si se pasa).
    if (comEnviando) return;
    const ultima = comUltimasRef.current[p?.id] || 0;
    const falta = 3000 - (Date.now() - ultima);
    if (falta > 0) {
      const s = Math.ceil(falta / 1000);
      comAvisoMostrar(es
        ? `Espera ${s}s antes de comentar otra vez en esta publicación.`
        : `Wait ${s}s before commenting again in this post.`);
      return;
    }
    setComEnviando(true);
    let r = null;
    try {
      r = await apiComunidad.comentar(p.id, userKey, tx, parentId, media);
    } finally {
      setComEnviando(false);
    }
    if (!r || r.error) {
      comAvisoMostrar(r?.error || (es ? 'No se pudo enviar el comentario.' : 'Could not send the comment.'));
      return;
    }
    comUltimasRef.current[p.id] = Date.now();
    if (media) {
      // Hilo de una foto/video: entra a su propia lista.
      const previa = comMedia[media]?.lista || [];
      setComMedia((m) => ({
        ...m,
        [media]: { ...(m[media] || {}), lista: [...previa, r.comentario], texto: '' },
      }));
      // Si queda fuera de la ventana visible, se amplia para verlo.
      const raices = previa.filter((c) => !c.parent_id).length + (parentId ? 0 : 1);
      if (raices > visorVisibles) setVisorVisibles(raices);
    } else {
      const nuevas = [...comList, r.comentario];
      setComList(nuevas);
      // Si el comentario nuevo queda fuera de la ventana visible, se amplia.
      if (!parentId) {
        const idx = ordenarRaices(nuevas, comOrden).findIndex((c) => c.id === r.comentario.id);
        if (idx >= comVisibles) setComVisibles(idx + 1);
      }
      if (parentId) { setRespTexto(''); setRespondiendo(null); } else setComTexto('');
    }
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, comentarios: (x.comentarios || 0) + 1 } : x)));
  }

  /** Aplica un cambio a un comentario esté donde esté (general o de archivo). */
  function mapComentario(cid, fn) {
    setComList((l) => l.map((c) => (c.id === cid ? fn(c) : c)));
    setComMedia((m) => {
      const out = {};
      for (const k of Object.keys(m)) {
        out[k] = { ...m[k], lista: (m[k].lista || []).map((c) => (c.id === cid ? fn(c) : c)) };
      }
      return out;
    });
  }

  function quitarComentario(cid) {
    setComList((l) => l.filter((c) => c.id !== cid && c.parent_id !== cid));
    setComMedia((m) => {
      const out = {};
      for (const k of Object.keys(m)) {
        out[k] = { ...m[k], lista: (m[k].lista || []).filter((c) => c.id !== cid && c.parent_id !== cid) };
      }
      return out;
    });
  }

  async function likeComentario(c, pid) {
    if (!exigirAuth()) return;
    mapComentario(c.id, (x) => ({ ...x, liked: !x.liked, likes: Math.max(0, (x.likes || 0) + (x.liked ? -1 : 1)) }));
    const r = await apiComunidad.likeComentario(pid, c.id, userKey);
    if (r?.error) { setMsg(r.error); return; }
    mapComentario(c.id, (x) => ({ ...x, liked: !!r.liked, likes: r.likes }));
  }

  async function borrarComentario(c, pid) {
    if (!exigirAuth()) return;
    const r = await apiComunidad.borrarComentario(pid, c.id, userKey);
    if (r?.error) { setMsg(r.error); return; }
    quitarComentario(c.id);
    setPosts((list) => list.map((x) => (x.id === pid ? { ...x, comentarios: Math.max(0, (x.comentarios || 0) - 1) } : x)));
  }

  // Moderar (borrar publicaciones/comentarios ajenos): igual que el backend
  // (dueño, o semidueno con el permiso 'editar_grupo'; no los moderadores).
  const puedoModerar = soyDueno || (rol === 'semidueno' && permisos.includes('editar_grupo'));
  // Expulsar miembros: igual que el backend (dueño, o semidueno con el
  // permiso 'eliminar_miembros').
  const puedoExpulsar = soyDueno || (rol === 'semidueno' && permisos.includes('eliminar_miembros'));

  function puedeBorrarComentario(p, c) {
    if (!authed) return false;
    if (c.user_key && userKey && c.user_key === userKey) return true;
    if (p.mio || (p.user_key && userKey && p.user_key === userKey)) return true;
    return puedoModerar;
  }

  // ===== Modal "quien reacciono" (lista con carga progresiva) =====
  function abrirReacciones(p, rid) {
    if (!exigirAuth()) return;
    setReacModal({ post: p, filtro: rid || null, data: [], total: 0, cargando: true, fin: false, error: null });
    cargarReacciones(p.id, rid || null, 0);
  }

  async function cargarReacciones(pid, filtro, offset) {
    const r = await apiComunidad.reaccionesPost(pid, userKey, { reaccion: filtro || undefined, offset, limit: 20 });
    if (r?.error) {
      setReacModal((m) => (m && m.post.id === pid ? { ...m, cargando: false, error: r.error } : m));
      return;
    }
    setReacModal((m) => {
      if (!m || m.post.id !== pid || (m.filtro || null) !== (filtro || null)) return m;
      const nuevos = Array.isArray(r?.data) ? r.data : [];
      return {
        ...m,
        data: offset === 0 ? nuevos : [...m.data, ...nuevos],
        total: Number.isFinite(r?.total) ? r.total : m.total,
        cargando: false,
        fin: nuevos.length < 20,
      };
    });
  }

  function filtrarReacciones(rid) {
    const m = reacModal;
    if (!m) return;
    setReacModal({ ...m, filtro: rid, data: [], total: 0, cargando: true, fin: false, error: null });
    cargarReacciones(m.post.id, rid, 0);
  }

  // Carga mas al llegar al final de la lista (scroll progresivo).
  function scrollearReacciones(e) {
    const el = e.currentTarget;
    const m = reacModal;
    if (!m || m.cargando || m.fin || m.error) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 90) return;
    setReacModal({ ...m, cargando: true });
    cargarReacciones(m.post.id, m.filtro, m.data.length);
  }

  // Escape cierra el modal de reacciones.
  useEffect(() => {
    if (!reacModal) return;
    const h = (e) => { if (e.key === 'Escape') setReacModal(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [reacModal]);

  // Escape cierra los modales (primero el menu flotante de encima).
  useEffect(() => {
    if (!comAbierto && !sharePost) return undefined;
    const h = (e) => {
      if (e.key !== 'Escape') return;
      // Con texto escrito en el campo, el Escape es del campo (asi no se
      // pierde el borrador); el popup "@" ya corta el evento el solo.
      const t = e.target;
      const conTexto = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        && String(t.value || '').length > 0;
      if (conTexto) return;
      if (comOrdenMenu) { setComOrdenMenu(false); return; }
      if (menuPost || rxAbierta) { setMenuPost(null); setRxAbierta(null); return; }
      if (visor || reacModal) return;
      if (sharePost) { setSharePost(null); return; }
      cerrarComentarios();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [comAbierto, sharePost, comOrdenMenu, menuPost, rxAbierta, visor, reacModal]);

  // Con un modal abierto la pagina de fondo NO debe hacer scroll.
  useEffect(() => {
    if (!comAbierto && !sharePost && !reacModal && !visor) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    // Compensa el hueco que deja la barra de scroll al desaparecer.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [comAbierto, sharePost, reacModal, visor]);

  // Si la publicacion del modal de comentarios dejo de existir (borrada en
  // vivo), el modal se cierra solo en vez de quedar colgado.
  useEffect(() => {
    if (!comAbierto || cargando) return;
    if (posts.some((x) => x.id === comAbierto)) return;
    cerrarComentarios();
  }, [comAbierto, cargando, posts]);

  // ===== Modal "Crear publicacion" =====
  const puedePublicar = (soyMiembro || soyDueno) && !expulsado;

  // Abre el modal en la vista indicada (texto | media | encuesta | sentimiento).
  function abrirCrear(vista) {
    if (!exigirAuth()) return;
    setCrear(vista || 'texto');
  }

  // Cierra y recarga el feed cuando el modal publica con exito.
  async function cerroDePublicar() {
    await cargarPosts();
    setMsg(es ? 'Publicado.' : 'Posted.');
  }

  // Resalta una publicacion al tocar "Destacados" del lateral.
  function irAPost(pid) {
    if (tab !== 'conversacion') cambiarTab('conversacion');
    requestAnimationFrame(() => {
      const el = document.getElementById(`post-${pid}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlash(pid);
      setTimeout(() => setFlash((f) => (f === pid ? null : f)), 1600);
    });
  }

  // ===== Visor sincronizado con la URL (?post=&foto=) =====
  // Asi el "atras" del navegador o del movil lo cierra y cada foto tiene
  // su propia direccion (se puede enlazar o recargar).
  function urlVisor(postId, idx1) {
    const url = new URL(window.location.href);
    if (postId) url.searchParams.set('post', String(postId));
    if (idx1) url.searchParams.set('foto', String(idx1));
    else url.searchParams.delete('foto');
    return url.pathname + url.search;
  }

  /** Abre el visor con la foto (o el video) indicado del post (push).
   *  zoom = true: arranca con la lupa puesta (ver la foto en detalle). */
  function abrirVisor(p, m, tipo = 'foto', zoom = false) {
    const media = Array.isArray(p.media) ? p.media : [];
    if (!media.length) return;
    const lista = media.filter((x) => x.tipo === tipo);
    if (!lista.length) return;
    const u = m?.url || lista[0].url;
    const raw = media.findIndex((x) => x.url === u);
    visorZoomRef.current = !!zoom;
    router.push(urlVisor(p.id, (raw >= 0 ? raw : 0) + 1), { scroll: false });
  }

  /** Lupa de la foto: zoom en el punto exacto donde se hizo clic
   *  (otro clic aleja; la foto ocupa ya toda el area). */
  function alternarZoomFoto(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / (r.width || 1)) * 100;
    const y = ((e.clientY - r.top) / (r.height || 1)) * 100;
    const origen = {
      x: Math.round(Math.min(100, Math.max(0, x))),
      y: Math.round(Math.min(100, Math.max(0, y))),
    };
    setVisor((v) => (v ? { ...v, zoom: v.zoom ? null : origen } : v));
  }

  /** Boton lupa del visor: zoom al centro / alejar. */
  function alternarZoomCentro() {
    setVisor((v) => (v ? { ...v, zoom: v.zoom ? null : { x: 50, y: 50 } } : v));
  }

  /** Siguiente/anterior (dentro del mismo tipo): cambia ?foto con replace
   *  para que el "atras" cierre el visor en vez de andar pagina por pagina. */
  function navegarVisor(paso) {
    const pid = visor?.postId;
    if (!pid || !visor || !visor.lista.length) return;
    const n = (((visor.i + paso) % visor.lista.length) + visor.lista.length) % visor.lista.length;
    const u = visor.lista[n].url;
    const p = posts.find((x) => x.id === pid);
    const media = Array.isArray(p?.media) ? p.media : [];
    const raw = media.findIndex((x) => x.url === u);
    router.replace(urlVisor(pid, (raw >= 0 ? raw : 0) + 1), { scroll: false });
  }

  /** Cierra el visor (quito ?foto de la URL; el estado lo limpia el efecto). */
  function cerrarVisor() {
    setVisor(null);
    if (typeof window === 'undefined') return;
    if (new URL(window.location.href).searchParams.get('foto')) {
      router.replace(urlVisor(null, null), { scroll: false });
    }
  }

  const portada = grupo ? (grupo.banner || grupo.avatar) : null;
  const esPublico = grupo?.privacidad !== 'privada' && grupo?.modo_union !== 'invitacion';
  const esPrivado = !esPublico;
  const destacados = posts.filter((p) => p.fijado);
  const meAvatar = user?.avatar || null;
  const meIni = user?.usuario ? ini(user.usuario) : 'U';

  const ctx = {
    expandidos, verMas, reaccionar, abrirComentarios, compartir, abrirReacciones,
    comTexto, setComTexto, comentar, respondiendo, setRespondiendo, respTexto, setRespTexto,
    likeComentario, borrarComentario, puedeBorrarComentario,
    menuPost, toggleMenu, rxAbierta, toggleRx,
    puedoModerar, puedoExpulsar, esDueno: soyDueno, fijar, borrarPostPedir, expulsarDelPost, copiarEnlace, votar,
    flash, meAvatar, meIni, abrirVisor,
    // Envio de comentarios: spinner + aviso inline (queda detras del overlay).
    comEnviando, comAviso,
    // Para el autocompletado "@" de las menciones.
    userKey,
    // Comentarios por archivo (foto/video): null = hilo general del post.
    media: null, comMedia, toggleVideoCom, textoMedia, setTextoMedia,
  };
  // Mismo contexto pero apuntando al archivo visible en el visor, con las
  // acciones adaptadas: "Comentar" enfoca el campo del PROPIO visor y
  // compartir / "quien reacciono" cierran el visor antes de abrir su modal
  // (esos modales van en z 9500/9510 y quedarian DETRAS del visor, z 9700).
  const ctxVisor = {
    ...ctx,
    media: visorUrl,
    abrirComentarios: () => { visorComInputRef.current?.focus(); },
    compartir: (pp) => { cerrarVisor(); compartir(pp); },
    abrirReacciones: (pp, rid) => { cerrarVisor(); abrirReacciones(pp, rid); },
  };
  // Post del visor (para permisos de borrar comentarios).
  const postVisor = visor?.postId
    ? (posts.find((x) => x.id === visor.postId) || { id: visor.postId })
    : null;
  const visorAutor = postVisor
    ? (postVisor.anonimo ? (es ? 'Publicación anónima' : 'Anonymous') : (postVisor.usuario || (es ? 'Usuario' : 'User')))
    : '';
  // Hilo de comentarios del archivo visible en el visor.
  const visorHilo = visorUrl ? comMedia[visorUrl] : null;
  const visorRaices = (visorHilo?.lista || []).filter((c) => !c.parent_id);
  const visorHijos = (id) => (visorHilo?.lista || []).filter((c) => c.parent_id === id);

  // ===== Modal de comentarios: publicacion abierta =====
  const comPost = comAbierto ? (posts.find((x) => x.id === comAbierto) || null) : null;
  // Opcion de orden activa (etiqueta del disparador del menu).
  const ordenActivo = ORDENES.find((o) => o.id === comOrden) || ORDENES[0];
  // Raices ordenadas segun la opcion elegida (y cortadas a la ventana
  // visible: el resto se pinta al tocar "Ver mas comentarios").
  const comRaices = ordenarRaices(comList, comOrden);
  const comHijos = (id) => comList.filter((c) => c.parent_id === id);

  // ===== Modal de compartir: enlaces de cada red =====
  const shareUrl = sharePost ? urlPost(sharePost) : '';
  const shareBase = sharePost
    ? ((sharePost.texto || '').trim().slice(0, 140) || (es ? 'Mira esto en PICANTE.pe' : 'Check this out on PICANTE.pe'))
    : '';
  const shareAutor = sharePost
    ? (sharePost.anonimo ? (es ? 'Publicación anónima' : 'Anonymous') : (sharePost.usuario || (es ? 'Usuario' : 'User')))
    : '';
  const shareRedes = !sharePost ? [] : [
    { label: 'WhatsApp', icon: 'logo-whatsapp', cls: styles.shareOptWa, href: `https://wa.me/?text=${encodeURIComponent(`${shareBase} ${shareUrl}`)}` },
    { label: 'Telegram', icon: 'send-outline', cls: styles.shareOptTg, href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareBase)}` },
    { label: 'Facebook', icon: 'logo-facebook', cls: styles.shareOptFb, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { label: 'X', icon: 'logo-twitter', cls: styles.shareOptX, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareBase)}` },
  ];
  // Web Share API (movil): "Más aplicaciones" solo si el navegador la soporta.
  const shareNativoOk = typeof navigator !== 'undefined' && !!navigator.share;

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
              {fmtNum(grupo?.miembros || 0)} {es ? 'miembros' : 'members'}
              <span className={styles.dot}>·</span>
              {fmtNum(grupo?.activos || 0)} {es ? 'en línea' : 'online'}
            </p>
          </div>
        </div>

        <div className={styles.headActions}>
          {expulsado ? (
            <button type="button" className={styles.btnExpulsado} disabled>
              <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Fuiste eliminado' : 'You were removed'}
            </button>
          ) : soyMiembro || soyDueno ? (
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

      {/* Expulsado: el chat y el grupo no existen para él hasta que lo agreguen. */}
      {expulsado && (
        <div className={styles.avisoExpulsado} role="alert">
          <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
          <span>
            {es
              ? 'Fuiste eliminado de este grupo. No puedes ver su chat ni volver a unirte hasta que te agreguen de nuevo.'
              : 'You were removed from this group. You cannot see its chat or rejoin until you are added again.'}
          </span>
        </div>
      )}

      {msg && <p className={styles.msg}>{msg}</p>}

      {/* ===== TABS ===== */}
      <nav className={styles.tabs} role="tablist">
        {[
          { id: 'conversacion', es: 'Publicaciones', en: 'Posts', icon: 'newspaper-outline' },
          { id: 'informacion', es: 'Información', en: 'About', icon: 'information-circle-outline' },
          { id: 'miembros', es: 'Miembros', en: 'Members', icon: 'people-outline' },
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
            {es ? t.es : t.en}
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
                  {!puedePublicar && (
                    <div className={styles.publicNotice}>
                      <ion-icon name="globe-outline" suppressHydrationWarning></ion-icon>
                      <span>{es ? 'Puedes ver las publicaciones. Únete para publicar y entrar al chat.' : 'You can see posts. Join to post and enter the chat.'}</span>
                    </div>
                  )}

                  {/* ===== Disparador del modal "Crear publicacion" ===== */}
                  {puedePublicar && (
                    <div className={styles.composer}>
                      <div className={styles.compTop}>
                        <button type="button" className={styles.compTrigger} onClick={() => abrirCrear('texto')}>
                          <span className={styles.compAvatar}>
                            {meAvatar ? <img src={comunidadMedia(meAvatar)} alt="" /> : meIni}
                          </span>
                          <span className={styles.compPlaceholder}>
                            {es ? `Escribe algo en ${grupo?.nombre || 'este grupo'}` : `Write something in ${grupo?.nombre || 'this group'}`}
                          </span>
                        </button>
                      </div>
                      <div className={styles.compBar}>
                        <button type="button" className={styles.compTool} onClick={() => abrirCrear('media')}>
                          <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                          <span>{es ? 'Foto o video' : 'Photo or video'}</span>
                        </button>
                        <button type="button" className={styles.compTool} onClick={() => abrirCrear('encuesta')}>
                          <ion-icon name="pie-chart-outline" suppressHydrationWarning></ion-icon>
                          <span>{es ? 'Encuesta' : 'Poll'}</span>
                        </button>
                        <button type="button" className={styles.compTool} onClick={() => abrirCrear('sentimiento')}>
                          <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
                          <span>{es ? 'Sentimiento' : 'Feeling'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ===== Orden del feed ===== */}
                  <div className={styles.feedBar}>
                    <span className={styles.feedBarTitle}>
                      {es ? 'Publicaciones' : 'Posts'}
                      <span className={styles.feedCount}>{fmtNum(posts.length)}</span>
                    </span>
                    <div className={styles.orden}>
                      <span className={styles.ordenLabel}>{es ? 'Ordenar feed' : 'Sort feed'}</span>
                      {[
                        { id: 'recientes', es: 'Más recientes', en: 'Newest' },
                        { id: 'populares', es: 'Más relevantes', en: 'Top' },
                      ].map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className={`${styles.ordenBtn} ${filtro === o.id ? styles.ordenBtnOn : ''}`}
                          onClick={() => setFiltro(o.id)}
                        >
                          {es ? o.es : o.en}
                        </button>
                      ))}
                    </div>
                  </div>

                  {cargando ? (
                    <div className={styles.emptyBox}>
                      <ion-icon name="hourglass-outline" suppressHydrationWarning></ion-icon>
                      <p>{es ? 'Cargando...' : 'Loading...'}</p>
                    </div>
                  ) : posts.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <ion-icon name="newspaper-outline" suppressHydrationWarning></ion-icon>
                      <p>{es ? 'Aún no hay publicaciones aquí. ¡Sé el primero!' : 'No posts here yet. Be the first!'}</p>
                    </div>
                  ) : posts.map((p) => (
                    <PostGrupo
                      key={p.id}
                      p={p}
                      es={es}
                      ctx={ctx}
                    />
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
              <div className={styles.miBox}>
                <p className={styles.miResumen}>
                  <strong>{fmtNum(grupo?.miembros || 0)}</strong> {es ? 'miembros' : 'members'}
                  {' · '}
                  <span className={styles.miOnlineCount}>
                    {miembros.filter((m) => presenciaEstado(m.edad, es).online).length}
                  </span> {es ? 'en línea' : 'online'}
                </p>
                {miembros.length === 0 ? (
                  <p className={styles.empty}>{es ? `Este grupo tiene ${fmtNum(grupo?.miembros || 0)} miembros.` : `This group has ${fmtNum(grupo?.miembros || 0)} members.`}</p>
                ) : (
                  <div className={styles.miList}>
                    {miembros.map((m) => {
                      const est = presenciaEstado(m.edad, es);
                      const ir = () => abrirCanal(router, m.user_key, m.usuario || m.nombre);
                      return (
                        <div
                          key={m.user_key}
                          className={styles.miItem}
                          role="button"
                          tabIndex={0}
                          onClick={ir}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } }}
                          title={es ? 'Ver perfil' : 'View profile'}
                        >
                          <span className={styles.miAvatar}>
                            {m.avatar ? <img src={comunidadMedia(m.avatar)} alt="" /> : ini(m.usuario)}
                          </span>
                          <span className={styles.miName}>{m.usuario || m.nombre}</span>
                          <span className={`${styles.miState} ${est.online ? '' : styles.miStateOff}`}>
                            {est.online && <span className={styles.miDot} />}
                            {est.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <aside className={styles.side}>
          {/* ===== Destacados (como el panel lateral de Facebook) ===== */}
          {destacados.length > 0 && (
            <div className={styles.sideCard}>
              <h3 className={styles.sideTitle}>
                <ion-icon name="pin-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Destacados' : 'Pinned'}
              </h3>
              <div className={styles.destList}>
                {destacados.slice(0, 5).map((p) => (
                  <button key={p.id} type="button" className={styles.destItem} onClick={() => irAPost(p.id)}>
                    <span className={styles.destAvatar}>
                      {p.avatar ? <img src={comunidadMedia(p.avatar)} alt="" /> : (p.anonimo ? <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon> : ini(p.usuario))}
                    </span>
                    <span className={styles.destBody}>
                      <strong>{p.anonimo ? (es ? 'Anónimo' : 'Anonymous') : p.usuario}</strong>
                      <p>{(p.texto || (es ? 'Publicación' : 'Post')).slice(0, 90)}</p>
                      <small>{hace(p.created_at, es ? 'es' : 'en')}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                <strong>{fmtNum(grupo?.miembros || 0)} {es ? 'miembros' : 'members'}</strong>
                <p>{fmtNum(grupo?.activos || 0)} {es ? 'en línea ahora' : 'online now'}</p>
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

      {/* ===== Visor de foto/video + el post y sus comentarios ===== */}
      {visor && visor.lista.length > 0 && postVisor && (
        <div className={styles.visor} data-visor="1">
          {/* Contenido: tocar fuera cierra el visor */}
          <div className={styles.visorCielo} onClick={() => cerrarVisor()}>
            <button type="button" className={styles.visorClose} onClick={() => cerrarVisor()} aria-label={es ? 'Cerrar' : 'Close'}>
              <ion-icon name="close" suppressHydrationWarning></ion-icon>
            </button>
            <button
              type="button"
              className={`${styles.visorNav} ${styles.visorNavL}`}
              onClick={(e) => { e.stopPropagation(); navegarVisor(-1); }}
              aria-label={es ? 'Anterior' : 'Previous'}
            >
              <ion-icon name="chevron-back" suppressHydrationWarning></ion-icon>
            </button>
            {visor.tipo === 'video' ? (
              <video
                className={styles.visorVideo}
                src={comunidadMedia(visor.lista[visor.i]?.url)}
                controls
                playsInline
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                className={styles.visorImg}
                src={comunidadMedia(visor.lista[visor.i]?.url)}
                alt=""
                style={visor.zoom
                  ? { transform: 'scale(2.6)', transformOrigin: `${visor.zoom.x}% ${visor.zoom.y}%` }
                  : undefined}
                onClick={(e) => { e.stopPropagation(); alternarZoomFoto(e); }}
              />
            )}
            <button
              type="button"
              className={`${styles.visorNav} ${styles.visorNavR}`}
              onClick={(e) => { e.stopPropagation(); navegarVisor(1); }}
              aria-label={es ? 'Siguiente' : 'Next'}
            >
              <ion-icon name="chevron-forward" suppressHydrationWarning></ion-icon>
            </button>
            <span className={styles.visorCount}>{visor.i + 1} / {visor.lista.length}</span>
            {/* Lupa: ver la foto en detalle (tambien sirve para alejar) */}
            {visor.tipo === 'foto' && (
              <button
                type="button"
                className={styles.visorLupa}
                onClick={(e) => { e.stopPropagation(); alternarZoomCentro(); }}
                title={visor.zoom ? (es ? 'Alejar' : 'Zoom out') : (es ? 'Ver en detalle' : 'View in detail')}
                aria-label={visor.zoom ? (es ? 'Alejar' : 'Zoom out') : (es ? 'Ver en detalle' : 'View in detail')}
              >
                <ion-icon name={visor.zoom ? 'contract-outline' : 'search-outline'} suppressHydrationWarning></ion-icon>
              </button>
            )}
          </div>

          {/* Post + comentarios PROPIOS de esta foto/video (igual que el modal) */}
          <aside className={styles.visorPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.visorPanelHead}>
              <span className={styles.postAvatar}>
                {postVisor.avatar
                  ? <img src={comunidadMedia(postVisor.avatar)} alt="" />
                  : postVisor.anonimo
                    ? <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon>
                    : ini(visorAutor)}
              </span>
              <div className={styles.postWho}>
                <span className={styles.postUser}>{visorAutor}</span>
                <span className={styles.postTime}>{fecha(postVisor.created_at, es ? 'es' : 'en')}</span>
              </div>
              <div className={styles.postMoreWrap} data-pop="1">
                <button type="button" className={styles.postMore} data-pop="1" onClick={() => toggleMenu(claveInst('visor', postVisor.id))} aria-label={es ? 'Opciones' : 'Options'}>
                  <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
                </button>
                <MenuPost p={postVisor} es={es} ctx={ctx} inst="visor" />
              </div>
              <button
                type="button"
                className={`${styles.postClose} ${styles.visorClosePanel}`}
                onClick={() => cerrarVisor()}
                aria-label={es ? 'Cerrar' : 'Close'}
              >
                <ion-icon name="close" suppressHydrationWarning></ion-icon>
              </button>
            </div>

            {(postVisor.texto || '').trim() && (
              <p className={styles.visorCaption}><TextoMenciones>{postVisor.texto}</TextoMenciones></p>
            )}

            {/* Me gusta / Comentar / Compartir + chips de reacciones */}
            <div className={styles.visorAcciones}>
              <BarraAcciones p={postVisor} es={es} ctx={ctxVisor} inst="visor" />
            </div>

            <div className={styles.visorPanelBody}>
              {!visorHilo?.lista ? (
                <p className={styles.visorPanelVacio}>{es ? 'Cargando...' : 'Loading...'}</p>
              ) : visorRaices.length === 0 ? (
                <p className={styles.visorPanelVacio}>{es ? 'Sé la primera persona en comentar.' : 'Be the first to comment.'}</p>
              ) : (
                <>
                  {/* Carga progresiva: solo las primeras raices */}
                  {visorRaices.slice(0, visorVisibles).map((c) => (
                    <Comentario key={c.id} c={c} p={postVisor} es={es} ctx={ctxVisor} hijos={visorHijos(c.id)} />
                  ))}
                  {visorVisibles < visorRaices.length && (
                    <button
                      type="button"
                      className={styles.comMas}
                      onClick={() => setVisorVisibles((v) => v + COM_POR_LOTE)}
                    >
                      <ion-icon name="chevron-down" suppressHydrationWarning></ion-icon>
                      {es
                        ? `Ver más comentarios (${visorRaices.length - visorVisibles})`
                        : `View more comments (${visorRaices.length - visorVisibles})`}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className={styles.visorPanelFoot}>
              {comAviso && <p className={styles.comAvisoTxt}>{comAviso}</p>}
              <div className={styles.comRow}>
                <span className={styles.comAvatarMe}>{meAvatar ? <img src={comunidadMedia(meAvatar)} alt="" /> : meIni}</span>
                <MencionCampo
                  inputRef={visorComInputRef}
                  autoFocus
                  className={styles.comInput}
                  placeholder={es ? 'Escribe un comentario...' : 'Write a comment...'}
                  value={visorHilo?.texto || ''}
                  onChange={(e) => setTextoMedia(visorUrl, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') comentar(postVisor, visorHilo?.texto || '', null, visorUrl); }}
                  userKey={userKey}
                  es={es}
                />
                <button
                  type="button"
                  className={styles.comSend}
                  disabled={!(visorHilo?.texto || '').trim() || comEnviando}
                  onClick={() => comentar(postVisor, visorHilo?.texto || '', null, visorUrl)}
                  aria-label="Enviar"
                >
                  <ion-icon
                    name={comEnviando ? 'reload-outline' : 'send-outline'}
                    className={comEnviando ? styles.comSendCarga : undefined}
                    suppressHydrationWarning
                  ></ion-icon>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ===== Modal "Quien reacciono" ===== */}
      {reacModal && (
        <div className={styles.reacOverlay} onClick={(e) => { if (e.target === e.currentTarget) setReacModal(null); }}>
          <div className={styles.reacModal} role="dialog" aria-modal="true">
            <header className={styles.reacHead}>
              <h3>
                {es ? 'Reacciones' : 'Reactions'}
                <span className={styles.reacTotal}>{fmtNum(reacModal.total)}</span>
              </h3>
              <button type="button" className={styles.reacClose} onClick={() => setReacModal(null)} aria-label={es ? 'Cerrar' : 'Close'}>
                <ion-icon name="close" suppressHydrationWarning></ion-icon>
              </button>
            </header>

            {/* Filtros: todas + cada tipo de reaccion con su cantidad */}
            <div className={styles.reacTabs}>
              <button
                type="button"
                className={`${styles.reacTab} ${!reacModal.filtro ? styles.reacTabOn : ''}`}
                onClick={() => filtrarReacciones(null)}
              >
                {es ? 'Todas' : 'All'}
              </button>
              {Object.entries(reacModal.post.reacciones || {})
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([rid, n]) => {
                  const r = REACCIONES.find((x) => x.id === rid);
                  if (!r) return null;
                  return (
                    <button
                      key={rid}
                      type="button"
                      className={`${styles.reacTab} ${reacModal.filtro === rid ? styles.reacTabOn : ''}`}
                      title={`${es ? r.es : r.en}: ${n}`}
                      onClick={() => filtrarReacciones(rid)}
                    >
                      <span className={styles.reacTabIcono}>{r.icon}</span>
                      {fmtNum(n)}
                    </button>
                  );
                })}
            </div>

            {/* Lista con carga progresiva (scroll) */}
            <div className={styles.reacLista} onScroll={scrollearReacciones}>
              {reacModal.error && <p className={styles.reacVacio}>{reacModal.error}</p>}
              {!reacModal.error && reacModal.data.length === 0 && (
                <p className={styles.reacVacio}>
                  {reacModal.cargando
                    ? (es ? 'Cargando...' : 'Loading...')
                    : (es ? 'Nadie ha reaccionado todavía.' : 'Nobody has reacted yet.')}
                </p>
              )}
              {reacModal.data.map((r) => {
                const rr = REACCIONES.find((x) => x.id === r.reaccion);
                return (
                  <div key={`${r.user_key}-${r.reaccion}-${r.created_at}`} className={styles.reacFila}>
                    <span className={styles.reacAvatar}>
                      {r.avatar ? <img src={comunidadMedia(r.avatar)} alt="" /> : ini(r.usuario || 'U')}
                    </span>
                    <div className={styles.reacInfo}>
                      <strong title={r.usuario}>{r.usuario}</strong>
                      <small>{hace(r.created_at, es ? 'es' : 'en')}</small>
                    </div>
                    <span
                      className={styles.reacMi}
                      style={{ '--rx': rr ? rr.color : '#F20D16' }}
                      title={rr ? (es ? rr.es : rr.en) : ''}
                    >
                      {rr ? rr.icon : '👍'}
                    </span>
                  </div>
                );
              })}
              {reacModal.cargando && reacModal.data.length > 0 && (
                <p className={styles.reacVacio}>{es ? 'Cargando más...' : 'Loading more...'}</p>
              )}
              {!reacModal.cargando && reacModal.fin && reacModal.data.length > 0 && (
                <p className={styles.reacFin}>{es ? 'No hay más reacciones.' : 'No more reactions.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal "Comentarios" (hilo completo de la publicacion) ===== */}
      {comAbierto && comPost && (
        <div
          className={styles.comOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) cerrarComentarios(); }}
        >
          <div className={styles.comModal} role="dialog" aria-modal="true" aria-label={es ? 'Comentarios' : 'Comments'}>
            <div className={styles.comBody}>
              {/* La publicacion COMPLETA (cabecera, fotos/video, encuesta y
                  barra de reacciones), igual que en el feed. La "X" de cerrar
                  esta junto al boton de opciones. */}
              <PostGrupo p={comPost} es={es} ctx={ctx} enModal onCerrar={cerrarComentarios} />

              {/* Sus comentarios, justo debajo */}
              <div className={styles.comHilo}>
                {!comCargando && !comErr && (
                  <div className={styles.comOrden} data-pop="1">
                    <button
                      type="button"
                      className={styles.comOrdenBtn}
                      onClick={() => setComOrdenMenu((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={comOrdenMenu}
                    >
                      {ordenActivo ? (es ? ordenActivo.es : ordenActivo.en) : ''}
                      <ion-icon name={comOrdenMenu ? 'chevron-up' : 'chevron-down'} suppressHydrationWarning></ion-icon>
                    </button>
                    {comOrdenMenu && (
                      <div className={styles.comOrdenMenu} role="menu">
                        {ORDENES.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            role="menuitem"
                            className={`${styles.comOrdenItem} ${comOrden === o.id ? styles.comOrdenItemOn : ''}`}
                            onClick={() => { setComOrden(o.id); setComOrdenMenu(false); }}
                          >
                            <span className={styles.comOrdenTitulo}>{es ? o.es : o.en}</span>
                            <span className={styles.comOrdenDesc}>{es ? o.descEs : o.descEn}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {comCargando ? (
                  <p className={styles.comVacio}>{es ? 'Cargando comentarios...' : 'Loading comments...'}</p>
                ) : comErr ? (
                  <p className={styles.comVacio}>{comErr}</p>
                ) : comRaices.length === 0 ? (
                  <p className={styles.comVacio}>{es ? 'Sé la primera persona en comentar.' : 'Be the first to comment.'}</p>
                ) : (
                  <>
                    {/* Carga progresiva: solo las primeras raices */}
                    {comRaices.slice(0, comVisibles).map((c) => (
                      <Comentario key={c.id} c={c} p={comPost} es={es} ctx={ctx} hijos={comHijos(c.id)} />
                    ))}
                    {comVisibles < comRaices.length && (
                      <button
                        type="button"
                        className={styles.comMas}
                        onClick={() => setComVisibles((v) => v + COM_POR_LOTE)}
                      >
                        <ion-icon name="chevron-down" suppressHydrationWarning></ion-icon>
                        {es
                          ? `Ver más comentarios (${comRaices.length - comVisibles})`
                          : `View more comments (${comRaices.length - comVisibles})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <footer className={styles.comFoot}>
              {comAviso && <p className={styles.comAvisoTxt}>{comAviso}</p>}
              <div className={styles.comRow}>
                <span className={styles.comAvatarMe}>{meAvatar ? <img src={comunidadMedia(meAvatar)} alt="" /> : meIni}</span>
                <MencionCampo
                  inputRef={comInputRef}
                  autoFocus
                  className={styles.comInput}
                  placeholder={es ? 'Escribe un comentario...' : 'Write a comment...'}
                  value={comTexto}
                  onChange={(e) => setComTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') comentar(comPost, comTexto, null); }}
                  userKey={userKey}
                  es={es}
                />
                <button
                  type="button"
                  className={styles.comSend}
                  disabled={!comTexto.trim() || comEnviando}
                  onClick={() => comentar(comPost, comTexto, null)}
                  aria-label="Enviar"
                >
                  <ion-icon
                    name={comEnviando ? 'reload-outline' : 'send-outline'}
                    className={comEnviando ? styles.comSendCarga : undefined}
                    suppressHydrationWarning
                  ></ion-icon>
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ===== Modal "Compartir" (hoja estilo Android / Facebook) ===== */}
      {sharePost && (
        <div
          className={styles.shareOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) cerrarShare(); }}
        >
          <div className={styles.shareModal} role="dialog" aria-modal="true" aria-label={es ? 'Compartir publicación' : 'Share post'}>
            <header className={styles.shareHead}>
              <h3 className={styles.shareTitulo}>
                {shareVista === 'amigos'
                  ? (es ? 'Enviar a un amigo' : 'Send to a friend')
                  : (es ? 'Compartir publicación' : 'Share post')}
              </h3>
              <button
                type="button"
                className={styles.shareClose}
                onClick={() => (shareVista === 'amigos' ? setShareVista('menu') : cerrarShare())}
                aria-label={shareVista === 'amigos' ? (es ? 'Volver' : 'Back') : (es ? 'Cerrar' : 'Close')}
              >
                <ion-icon name={shareVista === 'amigos' ? 'arrow-back' : 'close'} suppressHydrationWarning></ion-icon>
              </button>
            </header>

            {shareVista === 'menu' ? (
              <>
                {/* Publicacion que se va a compartir */}
                <div className={styles.sharePreview}>
                  <span className={styles.sharePreviewAvatar}>
                    {sharePost.avatar
                      ? <img src={comunidadMedia(sharePost.avatar)} alt="" />
                      : sharePost.anonimo
                        ? <ion-icon name="eye-off-outline" suppressHydrationWarning></ion-icon>
                        : ini(shareAutor)}
                  </span>
                  <div className={styles.sharePreviewCuerpo}>
                    <span className={styles.sharePreviewUser}>{shareAutor}</span>
                    <p className={styles.sharePreviewTexto}>
                      {(sharePost.texto || '').trim() || (es ? 'Publicación con fotos o videos.' : 'Post with photos or videos.')}
                    </p>
                  </div>
                </div>

                {/* Con sesion: enviarselo a alguien de la cuenta */}
                {authed && (
                  <button type="button" className={styles.shareGrande} onClick={() => { setShareVista('amigos'); setShareErr(''); }}>
                    <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Enviar a un amigo' : 'Send to a friend'}
                  </button>
                )}

                {/* Redes externas */}
                <div className={styles.shareGrid}>
                  {shareRedes.map((s) => (
                    <a
                      key={s.label}
                      className={`${styles.shareOpt} ${s.cls}`}
                      href={s.href}
                      target="_blank"
                      rel="nofollow noopener"
                      onClick={() => { registrarShare(sharePost); cerrarShare(); }}
                    >
                      <ion-icon name={s.icon} suppressHydrationWarning></ion-icon>
                      {s.label}
                    </a>
                  ))}
                </div>

                <div className={styles.shareAnchos}>
                  <button
                    type="button"
                    className={`${styles.shareLinea} ${shareCopiado ? styles.shareLineaOk : ''}`}
                    onClick={copiarShare}
                  >
                    <ion-icon name={shareCopiado ? 'checkmark-circle' : 'link-outline'} suppressHydrationWarning></ion-icon>
                    {shareCopiado ? (es ? 'Enlace copiado' : 'Link copied') : (es ? 'Copiar enlace' : 'Copy link')}
                  </button>
                  {shareNativoOk && (
                    <button type="button" className={styles.shareLinea} onClick={shareNativo}>
                      <ion-icon name="apps-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Más aplicaciones' : 'More apps'}
                    </button>
                  )}
                </div>
                {shareErr && <p className={styles.shareAviso}>{shareErr}</p>}
              </>
            ) : (
              <>
                {/* Buscador de personas */}
                <div className={styles.shareBusca}>
                  <ion-icon name="search-outline" className={styles.shareBuscaIcon} suppressHydrationWarning></ion-icon>
                  <input
                    className={styles.shareBuscaInput}
                    placeholder={es ? 'Escribe un nombre' : 'Type a name'}
                    value={shareQ}
                    onChange={(e) => setShareQ(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.shareGente}>
                  {shareErr && <p className={styles.shareAviso}>{shareErr}</p>}
                  {!shareListo && (
                    <p className={styles.shareVacio}>{es ? 'Buscando...' : 'Searching...'}</p>
                  )}
                  {shareListo && shareGente.length === 0 && (
                    <p className={styles.shareVacio}>{es ? 'No se encontraron personas.' : 'No people found.'}</p>
                  )}
                  {shareGente.map((g) => {
                    const enviado = !!shareEnviado[g.user_key];
                    const enviando = shareEnviando === g.user_key;
                    return (
                      <div key={g.user_key} className={styles.sharePersona}>
                        <span className={styles.sharePersonaAvatar}>
                          {g.avatar ? <img src={comunidadMedia(g.avatar)} alt="" /> : ini(g.usuario || g.nombre)}
                        </span>
                        <div className={styles.sharePersonaInfo}>
                          <strong>{g.usuario || g.nombre}</strong>
                          {g.nombre && g.usuario && <small>{g.nombre}</small>}
                        </div>
                        <button
                          type="button"
                          className={enviado ? styles.shareEnviarOk : styles.shareEnviar}
                          disabled={enviado || enviando}
                          onClick={() => enviarAPersona(g)}
                        >
                          {enviado && <ion-icon name="checkmark-circle" suppressHydrationWarning></ion-icon>}
                          {enviado ? (es ? 'Enviado' : 'Sent') : (es ? 'Enviar' : 'Send')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Modal "Crear publicación" ===== */}
      {crear && (
        <CrearPublicacion
          inicial={crear}
          es={es}
          grupo={grupo}
          user={user}
          userKey={userKey}
          exigirAuth={exigirAuth}
          onExito={cerroDePublicar}
          onCerrar={() => setCrear(null)}
        />
      )}

      <AuthModal open={authOpen} reason="like" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
