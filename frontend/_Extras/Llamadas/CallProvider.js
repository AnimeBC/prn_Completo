'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './llamadas.module.css';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { playRing, stopRing } from '@/_Extras/Sonido/sonido.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

const CallContext = createContext({
  iniciar: () => {}, colgar: () => {}, enLlamada: false,
  iniciarGrupo: () => {}, unirseGrupo: () => {}, salirGrupo: () => {},
  sala: null, grupoEnLlamada: false, avisar: () => {},
});

// Logs de diagnostico: activar con localStorage.setItem('pkpDebugCalls','1') y recargar.
// Ademas se guardan en window.__pkpCallLogs para verlos desde el panel en pantalla
// (util en celular, donde no hay consola).
const DEBUG_CALLS = typeof window !== 'undefined' && (() => {
  try { return window.localStorage.getItem('pkpDebugCalls') === '1'; } catch { return false; }
})();
function dlog(...args) {
  try {
    if (typeof window !== 'undefined') {
      const w = window;
      w.__pkpCallLogs = w.__pkpCallLogs || [];
      const txt = args.map((a) => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      w.__pkpCallLogs.push(`${new Date().toLocaleTimeString()} ${txt}`);
      if (w.__pkpCallLogs.length > 120) w.__pkpCallLogs.shift();
      if (typeof w.__pkpCallLogsOnScreen === 'function') w.__pkpCallLogsOnScreen();
    }
  } catch { /* noop */ }
  if (DEBUG_CALLS) { try { console.log('[calls]', ...args); } catch { /* noop */ } }
}

function nuevoCallId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * "Puerta" de ruido (noise gate) sobre el microfono local.
 * Cuando no detecta voz, baja el volumen casi a cero: asi los demas no
 * escuchan el ruido de fondo (chillidos) mientras no hablas.
 * Devuelve un MediaStream con el audio procesado (mismo video track).
 */
function gateActivo() {
  try { return window.localStorage.getItem('pkpNoiseGate') === '1'; } catch { return false; }
}

function aplicarGateRuido(stream) {
  try {
    // Opt-in: por defecto el silencio lo maneja DTX de Opus (no rompe AEC).
    if (!gateActivo()) return stream;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return stream;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return stream;

    const ctx = new AC();
    const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    src.connect(gain);

    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let cerrado = false;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const avg = sum / data.length;
      // Umbral: por debajo se considera silencio/ruido de fondo.
      const hablar = avg > 8;
      const objetivo = hablar ? 1 : 0.02;
      // Transicion suave para que no se note el corte (evita chasquidos).
      const actual = gain.gain.value;
      const nuevo = actual + (objetivo - actual) * (hablar ? 0.5 : 0.12);
      try { gain.gain.setTargetAtTime(nuevo, ctx.currentTime, 0.03); } catch { gain.gain.value = nuevo; }
      cerrado = !hablar;
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);

    const nuevaTrack = dest.stream.getAudioTracks()[0];
    // Guarda cleanup en la track para detener todo al colgar.
    nuevaTrack._pkpCleanup = () => {
      try { cancelAnimationFrame(raf); } catch { /* noop */ }
      try { gain.gain.value = 0; } catch { /* noop */ }
      try { ctx.close(); } catch { /* noop */ }
    };
    void cerrado;

    const out = new MediaStream();
    out.addTrack(nuevaTrack);
    for (const t of stream.getVideoTracks()) out.addTrack(t);
    return out;
  } catch {
    return stream;
  }
}

/**
 * Ajusta el SDP de Opus para mejorar la nitidez de la voz.
 * - Detecta el payload type real de Opus (no asumir 111).
 * - FEC dentro de banda (recupera paquetes perdidos: evita el "robot").
 * - Sin DTX (evita cortes y chasquidos al empezar/parar de hablar).
 * - minptime=10 (mas fluidez), bitrate 48 kbps mono (voz clara y estable).
 */
function mejorarSdp(sdp) {
  if (typeof sdp !== 'string') return sdp;
  // Busca "a=rtpmap:<pt> opus/48000" y captura el payload type.
  const m = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!m) return sdp;
  const pt = m[1];

  // fmtp: agrega/actualiza parametros de Opus (sin .test() con flag 'g'
  // para no dejar lastIndex avanzado y romper el SDP).
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
  const limpiar = (params) => {
    const set = new Set(String(params).split(';').map((x) => x.trim()).filter(Boolean));
    for (const k of ['stereo', 'sprop-stereo', 'useinbandfec', 'usedtx', 'maxaveragebitrate', 'minptime', 'maxplaybackrate']) {
      for (const item of [...set]) if (item.startsWith(`${k}=`)) set.delete(item);
    }
    set.add('minptime=10');
    set.add('useinbandfec=1');
    // usedtx=0: DTX corta el inicio de las palabras (se "entrecortan").
    set.add('usedtx=0');
    set.add('maxaveragebitrate=48000');
    set.add('maxplaybackrate=48000');
    return `a=fmtp:${pt} ${[...set].join(';')}`;
  };
  let encontrada = false;
  sdp = sdp.replace(fmtpRe, (full, params) => { encontrada = true; return limpiar(params); });
  if (!encontrada) {
    // Si no habia linea fmtp, la inserta justo despues del rtpmap de Opus.
    sdp = sdp.replace(
      new RegExp(`(a=rtpmap:${pt}\\s+opus/48000[^\\r\\n]*)`, 'i'),
      `$1\r\na=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=48000;maxplaybackrate=48000`
    );
  }
  return sdp;
}

/**
 * Configura el sender/receiver de audio para maxima nitidez:
 * - sender: bitrate alto y prioridad alta (evita que la red baje la calidad).
 * - receiver: jitter buffer mayor (absorbe variaciones y evita el sonido robot).
 * Se ejecuta tras cada negotiationneeded / conexion.
 */
async function afinarAudio(pc) {
  try {
    const senders = pc.getSenders ? pc.getSenders() : [];
    for (const s of senders) {
      if (!s.track || s.track.kind !== 'audio') continue;
      try {
        const params = s.getParameters();
        params.encodings = params.encodings && params.encodings.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = 64000;
        // Propiedades estandar de RTCEncodingParameters (evita errores de setParameters).
        if ('networkPriority' in params.encodings[0]) params.encodings[0].networkPriority = 'high';
        if ('dtx' in params.encodings[0]) params.encodings[0].dtx = 'disabled';
        await s.setParameters(params);
      } catch { /* algunos navegadores no soportan setParameters */ }
    }
    const receivers = pc.getReceivers ? pc.getReceivers() : [];
    for (const r of receivers) {
      if (!r.track || r.track.kind !== 'audio') continue;
      // Jitter buffer amplio: absorbe la red y evita que se entrecorten las palabras.
      try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 300; } catch { /* noop */ }
      try { if ('playoutDelayHint' in r) r.playoutDelayHint = 0.3; } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

function esCamara(e) {
  const n = String(e?.name || '');
  const m = String(e?.message || '').toLowerCase();
  return n === 'NotFoundError' || n === 'OverconstrainedError' || m.includes('camera') || m.includes('camara');
}
function mensajeMedia(e) {
  const n = String(e?.name || '');
  if (n === 'NotAllowedError') return 'Permiso de cámara/micrófono denegado';
  if (n === 'NotFoundError') return 'No se encontró cámara o micrófono';
  if (n === 'NotReadableError') return 'La cámara o micrófono está en uso por otra app';
  return 'No se pudo acceder a la cámara/micrófono';
}

// ======================================================================
// Deteccion de voz: devuelve true mientras la persona del stream habla.
// Usa UN solo AudioContext compartido (limitan los navegadores) y muestrea
// el nivel de audio cada 100ms con histeresis para que no parpadee.
// ======================================================================
let _ctxAudio = null;
function getAudioCtx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_ctxAudio || _ctxAudio.state === 'closed') _ctxAudio = new AC();
    if (_ctxAudio.state === 'suspended') _ctxAudio.resume().catch(() => {});
    return _ctxAudio;
  } catch { return null; }
}

function useIsSpeaking(stream) {
  const [hablando, setHablando] = useState(false);
  useEffect(() => {
    setHablando(false);
    if (!stream || typeof window === 'undefined') return undefined;
    if (!stream.getAudioTracks || !stream.getAudioTracks().length) return undefined;
    const ctx = getAudioCtx();
    if (!ctx) return undefined;
    let src = null;
    let an = null;
    let iv = 0;
    let acum = 0;
    let prevHablando = false;
    try {
      src = ctx.createMediaStreamSource(stream);
      an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      iv = setInterval(() => {
        an.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length;
        // Histeresis: encendido ~330ms de voz seguida, apagado tras silencio.
        if (avg > 11) acum = Math.min(acum + 110, 1100);
        else acum = Math.max(0, acum - 140);
        const h = prevHablando ? acum >= 60 : acum >= 330;
        if (h !== prevHablando) { prevHablando = h; setHablando(h); }
      }, 100);
    } catch { /* noop */ }
    return () => {
      clearInterval(iv);
      try { src?.disconnect(); } catch { /* noop */ }
    };
  }, [stream]);
  return hablando;
}

// Avatar grande con "ondas" de voz: emite pulsos verdes cuando la persona
// del stream esta hablando (para identificar al que habla sin camara).
function WaveAvatar({ stream, avatar, nombre }) {
  const hablando = useIsSpeaking(stream);
  const ini = String(nombre || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={`${styles.bigAvatar} ${hablando ? styles.speaking : ''}`}>
      {avatar ? <img src={mediaUrl(avatar)} alt="" /> : ini}
    </span>
  );
}

// Tile de video grupal (estilo Meet/Teams): video o avatar, nombre SIEMPRE
// visible y boton para fijar/quitar fijado (pantalla completa). Sin arrastre.
function VideoTile({ stream, info, onPin, pinned }) {
  const videoRef = useRef(null);
  const [hayVideo, setHayVideo] = useState(false);
  const hablando = useIsSpeaking(stream);

  useEffect(() => {
    const el = videoRef.current;
    if (!stream) { setHayVideo(false); return undefined; }
    if (el && el.srcObject !== stream) el.srcObject = stream;
    const tiene = () => stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted);
    const upd = () => setHayVideo(tiene());
    upd();
    stream.addEventListener?.('addtrack', upd);
    stream.addEventListener?.('removetrack', upd);
    const iv = setInterval(upd, 1500); // por si solo cambia "enabled" (camara on/off)
    return () => {
      stream.removeEventListener?.('addtrack', upd);
      stream.removeEventListener?.('removetrack', upd);
      clearInterval(iv);
    };
  }, [stream]);

  const inicial = String(info?.nombre || '?').charAt(0).toUpperCase();
  const mostrarVideo = hayVideo && info?.camOn !== false;
  return (
    <div
      className={`${styles.tile} ${pinned ? styles.tilePinned : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onPin?.()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin?.(); } }}
      title={pinned ? 'Quitar de pantalla completa' : 'Ver en pantalla completa'}
    >
      <video
        ref={videoRef}
        className={styles.tileVideo}
        style={{ visibility: mostrarVideo ? 'visible' : 'hidden' }}
        autoPlay
        playsInline
        muted
      />
      {!mostrarVideo && (
        <div className={styles.tileFallback}>
          <span className={`${styles.tileAvatar} ${hablando ? styles.speaking : ''}`}>
            {info?.avatar ? <img src={mediaUrl(info.avatar)} alt="" /> : inicial}
          </span>
        </div>
      )}
      <div className={styles.tileChip}>
        <span className={styles.tileChipNombre}>{info?.nombre || ''}</span>
        <span className={styles.tileChipAcc}>
          <button
            type="button"
            className={styles.tileChipBtn}
            onClick={(e) => { e.stopPropagation(); onPin?.(); }}
            title={pinned ? 'Quitar de pantalla completa' : 'Ver en pantalla completa'}
            aria-label={pinned ? 'Quitar de pantalla completa' : 'Ver en pantalla completa'}
          >
            <ion-icon name={pinned ? 'contract-outline' : 'expand-outline'} suppressHydrationWarning></ion-icon>
          </button>
        </span>
      </div>
    </div>
  );
}

// Reproduce la voz del peer. En video se usa SIEMPRE aparte del <video>
// (que va muted): asi el audio no depende del autoplay del video.
// Reintenta play() hasta que suene y en cada gesto del usuario.
function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    if (el.srcObject !== stream) el.srcObject = stream;
    const intentar = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* se reintenta */ });
    };
    intentar();
    // Reintenta en silencio mientras el navegador lo tenga bloqueado.
    const iv = setInterval(() => { if (el.paused) intentar(); }, 1000);
    const gesto = () => intentar();
    window.addEventListener('pointerdown', gesto);
    window.addEventListener('touchstart', gesto);
    return () => {
      clearInterval(iv);
      window.removeEventListener('pointerdown', gesto);
      window.removeEventListener('touchstart', gesto);
    };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

// Video local (mi camara). Estable: solo reasigna srcObject si cambia el stream
// (evita el parpadeo/tizne que causaba reasignarlo en cada render).
function LocalVideo({ stream, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    const track = stream.getVideoTracks()[0];
    if (el.srcObject !== stream) el.srcObject = stream;
    // Si la camara se apaga/enciende, el navegador puede pausar el video.
    const reintentar = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* noop */ });
    };
    reintentar();
    track?.addEventListener?.('mute', reintentar);
    track?.addEventListener?.('unmute', reintentar);
    return () => {
      track?.removeEventListener?.('mute', reintentar);
      track?.removeEventListener?.('unmute', reintentar);
    };
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

// Recuadro "mi cara" en la videollamada: si hay camara, video local; si no
// (PC sin webcam o camara apagada), muestra la foto de perfil y el nombre.
// Es arrastrable por el asa de su esquina (la posicion se guarda).
function LocalBox({ stream, videoOn, user, userKey }) {
  const wrapRef = useRef(null);
  const [pos, setPos] = useState(null);
  // Ondas en MI foto cuando hablo (caso: PC sin camara).
  const hablando = useIsSpeaking(stream);

  // Recuerda donde lo dejo el usuario (entre recargas y llamadas).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('pkp_localbox_pos');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) setPos(p);
      }
    } catch { /* noop */ }
  }, []);

  const guardar = (x, y) => {
    const p = { x: Math.round(x), y: Math.round(y) };
    setPos(p);
    try { window.localStorage.setItem('pkp_localbox_pos', JSON.stringify(p)); } catch { /* noop */ }
  };

  // Arrastre del asa (pointer events: funciona con raton y dedo).
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const wrap = wrapRef.current;
    const cont = wrap?.offsetParent;
    if (!wrap || !cont) return;
    e.preventDefault();
    e.stopPropagation();
    const cRect = cont.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const offX = e.clientX - wRect.left;
    const offY = e.clientY - wRect.top;
    const move = (ev) => {
      const x = Math.max(4, Math.min(cRect.width - wRect.width - 4, ev.clientX - cRect.left - offX));
      const y = Math.max(4, Math.min(cRect.height - wRect.height - 4, ev.clientY - cRect.top - offY));
      guardar(x, y);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const estilo = pos ? { top: `${pos.y}px`, left: `${pos.x}px`, right: 'auto' } : undefined;
  const nombre = user?.nombre || user?.usuario || '';
  return (
    <div ref={wrapRef} className={styles.localVideo} style={estilo}>
      <button type="button" className={styles.localDrag} onPointerDown={onDown} title="Mover" aria-label="Mover recuadro">
        <ion-icon name="move-outline" suppressHydrationWarning></ion-icon>
      </button>
      {videoOn && stream ? (
        <LocalVideo stream={stream} className={styles.localVideoInner} />
      ) : (
        <div className={styles.localFallback}>
          {user?.avatar ? (
            <img className={`${styles.localFallbackImg} ${hablando ? styles.speaking : ''}`} src={mediaUrl(user.avatar)} alt="" />
          ) : (
            <span className={`${styles.localFallbackImg} ${hablando ? styles.speaking : ''}`}>{String(nombre || userKey || '?').trim().charAt(0).toUpperCase()}</span>
          )}
          <span className={styles.localFallbackName}>{nombre || userKey || ''}</span>
        </div>
      )}
    </div>
  );
}

// Video remoto: SOLO IMAGEN (siempre muted). La voz llega por <RemoteAudio>,
// asi el video jamas queda bloqueado/mudo por la politica de autoplay.
function RemoteVideo({ stream, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* muted: no deberia bloquearse */ });
    return undefined;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

// Barra de titulo estilo ventana de app: minimizar / agrandar / cerrar.
function WindowBar({ titulo, sub, minimizado, pipWin, onMin, onClose }) {
  return (
    <div className={styles.winBar}>
      <span className={styles.winDot} />
      <div className={styles.winInfo}>
        <strong className={styles.winTitle}>{titulo}</strong>
        {sub && <span className={styles.winSub}>{sub}</span>}
      </div>
      <div className={styles.winBtns}>
        <button type="button" className={styles.winBtn} onClick={onMin} title={minimizado || pipWin ? 'Restaurar' : 'Minimizar'}>
          <ion-icon name={minimizado || pipWin ? 'chevron-up-outline' : 'chevron-down-outline'} suppressHydrationWarning></ion-icon>
        </button>
        <button type="button" className={`${styles.winBtn} ${styles.winClose}`} onClick={onClose} title="Cerrar (colgar)">
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>
      </div>
    </div>
  );
}

// Panel de diagnostico en pantalla (util en celular, sin consola).
function PanelDiagnostico({ onCerrar }) {
  const [lineas, setLineas] = useState([]);
  useEffect(() => {
    const upd = () => {
      try { setLineas([...(window.__pkpCallLogs || [])]); } catch { /* noop */ }
    };
    window.__pkpCallLogsOnScreen = upd;
    upd();
    const iv = setInterval(upd, 800);
    return () => { window.__pkpCallLogsOnScreen = null; clearInterval(iv); };
  }, []);

  // Estado del entorno (por que podria no soportar llamadas).
  const entorno = (() => {
    if (typeof window === 'undefined') return {};
    const secure = window.isSecureContext;
    const hasMedia = !!navigator?.mediaDevices?.getUserMedia;
    const hasPC = typeof window.RTCPeerConnection !== 'undefined' || typeof window.webkitRTCPeerConnection !== 'undefined';
    return { secure, hasMedia, hasPC, proto: window.location.protocol, host: window.location.host };
  })();

  return (
    <div className={styles.diagPanel}>
      <div className={styles.diagHead}>
        <strong>Diagnostico llamadas</strong>
        <button type="button" onClick={onCerrar} aria-label="Cerrar">x</button>
      </div>
      <div className={styles.diagEnv}>
        <span>HTTPS: {String(entorno.secure)}</span>
        <span>mediaDevices: {String(entorno.hasMedia)}</span>
        <span>RTCPeer: {String(entorno.hasPC)}</span>
        <span>{entorno.proto}//{entorno.host}</span>
      </div>
      <div className={styles.diagLogs}>
        {lineas.length === 0 && <span className={styles.diagEmpty}>Sin eventos aun...</span>}
        {lineas.map((l, i) => <div key={i} className={styles.diagLine}>{l}</div>)}
      </div>
      <button type="button" className={styles.diagClear} onClick={() => { window.__pkpCallLogs = []; setLineas([]); }}>Limpiar</button>
    </div>
  );
}

function fmtDur(seg) {
  const s = Math.max(0, Math.floor(seg));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Llamadas 1 a 1 con WebRTC. El media va directo entre navegadores; aquí solo
 * se hace la señalización (offer/answer/ICE) por Redis -> SSE.
 */
export function CallProvider({ children }) {
  const { user, userKey } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [conectadoEn, setConectadoEn] = useState(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  // Si mi PC no tiene camara: se muestra mi foto de perfil en vez del video local.
  const [localVideoOn, setLocalVideoOn] = useState(false);
  // Participante fijado en pantalla completa (vista tipo Teams/Meet); null = rejilla.
  const [pinnedKey, setPinnedKey] = useState(null);
  // Ventana de llamada minimizada (para poder navegar por la app).
  const [minimizado, setMinimizado] = useState(false);
  const micOnRef = useRef(true);
  micOnRef.current = micOn;
  // Document Picture-in-Picture: ventana flotante siempre encima del navegador.
  const [pipWin, setPipWin] = useState(null);
  const pipWinRef = useRef(null);
  const cerrarPipRef = useRef(null);
  const reafirmarSendersRef = useRef(null);
  // Modal "solo amigos": { peerKey, nombre, avatar, estado } estado: pedir|enviada
  const [amistadModal, setAmistadModal] = useState(null);
  const [amistadEnviando, setAmistadEnviando] = useState(false);

  const callRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  // --- Sala de llamada grupal (mesh P2P) ---
  const [sala, setSala] = useState(null); // { comunidadId, callId, tipo, nombre, iniciador }
  const [remotos, setRemotos] = useState({}); // { [userKey]: { stream, info } }
  const salaRef = useRef(null);
  const remotosRef = useRef({}); // { [userKey]: { pc, info } }
  const pendingSalaIceRef = useRef({}); // { [userKey]: candidate[] }

  useEffect(() => { setMounted(true); }, []);

  // Servidores ICE (STUN/TURN) desde el backend.
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/calls/ice`)
      .then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j?.iceServers) && j.iceServers.length) iceServersRef.current = j.iceServers; })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Reloj del tiempo transcurrido.
  useEffect(() => {
    if (!conectadoEn) return undefined;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [conectadoEn]);

  // Al mover/reescalar la ventana, React remonta los elementos de la UI;
  // reafirmamos los senders para no perder el audio saliente.
  useEffect(() => {
    if (!pipWinRef.current && !minimizado) return undefined;
    const t = setTimeout(() => { reafirmarSendersRef.current?.(); }, 120);
    return () => clearTimeout(t);
  }, [pipWin, minimizado]);

  // Auto-oculta el aviso de error a los pocos segundos.
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(t);
  }, [error]);

  // Timbre de llamada entrante: suena en loop mientras esta "sonando" y para
  // al aceptar/rechazar/finalizar o cuando desaparece el aviso.
  useEffect(() => {
    const unoUnoEntrante = call && call.direction === 'in' && call.estado === 'sonando';
    const grupoEntrante = sala && sala.entrante;
    if (unoUnoEntrante || grupoEntrante) playRing();
    else stopRing();
    return () => stopRing();
  }, [call, call?.estado, sala, sala?.entrante]);

  // Detecta si el peer remoto (1:1) tiene camara activa (track real, no muted).
  useEffect(() => {
    if (!remoteStream) { setRemoteVideoOn(false); return undefined; }
    const tiene = () => remoteStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted);
    const upd = () => setRemoteVideoOn(tiene());
    upd();
    remoteStream.addEventListener?.('addtrack', upd);
    remoteStream.addEventListener?.('removetrack', upd);
    const iv = setInterval(upd, 1500);
    return () => {
      remoteStream.removeEventListener?.('addtrack', upd);
      remoteStream.removeEventListener?.('removetrack', upd);
      clearInterval(iv);
    };
  }, [remoteStream]);

  // Detecta si MI camara existe y esta activa; si no (PC sin webcam),
  // la UI muestra mi foto de perfil en el recuadro local.
  useEffect(() => {
    if (!localStream) { setLocalVideoOn(false); return undefined; }
    const tiene = () => localStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted);
    const upd = () => setLocalVideoOn(tiene());
    upd();
    localStream.addEventListener?.('addtrack', upd);
    localStream.addEventListener?.('removetrack', upd);
    const iv = setInterval(upd, 1500);
    return () => {
      localStream.removeEventListener?.('addtrack', upd);
      localStream.removeEventListener?.('removetrack', upd);
      clearInterval(iv);
    };
  }, [localStream]);

  // Adjunta los streams a los <video>.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, call?.estado]);
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, call?.estado]);

  async function post(kind, otroKey, body) {
    try {
      const r = await fetch(`${API_URL}/api/calls/${encodeURIComponent(otroKey)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && j?.error) return j;
      return j;
    } catch { return { error: 'Sin conexión' }; }
  }

  function setEstado(estado) {
    setCall((c) => {
      const next = c ? { ...c, estado } : c;
      callRef.current = next;
      return next;
    });
  }

  function crearPc() {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pc.onicecandidate = (e) => {
      const c = callRef.current;
      if (e.candidate && c) post('ice', c.peerKey, { userKey, callId: c.callId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      dlog('1:1 ontrack', e.track?.kind, 'streams', e.streams?.length);
      if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
      afinarAudio(pc);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        setConectadoEn((prev) => prev || Date.now());
        setEstado('activa');
        afinarAudio(pc);
      } else if (st === 'failed') {
        setError('Se perdió la conexión');
      } else if (st === 'disconnected') {
        // Intenta recuperar sin cortar la llamada.
        try { pc.restartIce?.(); } catch { /* noop */ }
      }
    };
    pcRef.current = pc;
    return pc;
  }

  function flushIce() {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const cola = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of cola) { try { pc.addIceCandidate(c); } catch { /* noop */ } }
  }

  async function obtenerMedia(tipo) {
    const quiereVideo = tipo === 'video';
    const constraints = {
      // Audio nitido: cancela eco, suprime ruido y normaliza el volumen.
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: quiereVideo ? {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      } : false,
    };
    try {
      const raw = await navigator.mediaDevices.getUserMedia(constraints);
      // Refuerza el procesamiento de voz en la track real (algunos navegadores
      // lo ignoran en getUserMedia pero si lo aplican con applyConstraints).
      const at = raw.getAudioTracks()[0];
      if (at?.applyConstraints) {
        try {
          await at.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
        } catch { /* noop */ }
      }
      dlog('audio settings', at?.getSettings?.());
      return aplicarGateRuido(raw);
    } catch (e) {
      dlog('getUserMedia ERROR', e?.name, e?.message);
      // Si pedia video y fallo (PC sin webcam, permiso...), intenta al menos
      // audio con la misma calidad: el micro debe seguir funcionando.
      if (quiereVideo) {
        try {
          const soloAudio = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio, video: false });
          dlog('fallback solo-audio OK', soloAudio.getTracks().map((t) => t.kind));
          setError(esCamara(e)
            ? 'No hay cámara; se inició solo con audio (tu micrófono funciona)'
            : 'No se pudo acceder a la cámara');
          return aplicarGateRuido(soloAudio);
        } catch (e2) {
          dlog('fallback solo-audio ERROR', e2?.name, e2?.message);
          setError(mensajeMedia(e2));
          return null;
        }
      }
      setError(mensajeMedia(e));
      return null;
    }
  }

  function limpiar() {
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try { if (t._pkpCleanup) t._pkpCleanup(); } catch { /* noop */ }
        try { t.stop(); } catch { /* noop */ }
      });
    }
    localStreamRef.current = null;
    pendingIceRef.current = [];
    callRef.current = null;
    setCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setConectadoEn(null);
    setMicOn(true);
    setCamOn(true);
    setMinimizado(false);
    cerrarPipRef.current?.();
  }

  const iniciar = useCallback(async (otroKey, tipo, info) => {
    dlog('1:1 iniciar', { otroKey, tipo, userKey, enLlamada: !!callRef.current });
    setError('');
    if (!userKey || !otroKey || callRef.current) { dlog('1:1 abortado', { userKey: !!userKey, otroKey: !!otroKey, ocupado: !!callRef.current }); return; }
    if (!navigator?.mediaDevices?.getUserMedia) {
      dlog('SIN mediaDevices', {
        secure: (typeof window !== 'undefined' && window.isSecureContext),
        proto: (typeof window !== 'undefined' && window.location.protocol),
        host: (typeof window !== 'undefined' && window.location.host),
      });
      setError('Tu navegador no soporta llamadas'); return;
    }
    const media = await obtenerMedia(tipo);
    if (!media) { dlog('1:1 iniciar sin media'); return; }
    dlog('media tracks', media.getTracks().map((t) => `${t.kind}:${t.readyState}`));
    const pc = crearPc();
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    const offer = await pc.createOffer();
    offer.sdp = mejorarSdp(offer.sdp);
    await pc.setLocalDescription(offer);
    dlog('offer sdp len', offer.sdp.length, 'audio?', offer.sdp.includes('m=audio'), 'video?', offer.sdp.includes('m=video'));

    const info2 = {
      callId: nuevoCallId(), tipo, peerKey: otroKey,
      peerNombre: info?.nombre || '', peerAvatar: info?.avatar || null,
      direction: 'out', estado: 'conectando',
    };
    callRef.current = info2;
    setCall(info2);
    setLocalStream(media);
    localStreamRef.current = media;
    dlog('1:1 offer ->', otroKey, info2.callId);
    const res = await post('offer', otroKey, { userKey, callId: info2.callId, tipo, sdp: offer.sdp });
    if (res?.error) {
      limpiar();
      // No son amigos: modal centrado con opcion de enviar solicitud.
      if (String(res.error).toLowerCase().includes('amigos')) {
        setAmistadModal({
          peerKey: otroKey, nombre: info?.nombre || '', avatar: info?.avatar || null, estado: 'pedir',
        });
      } else {
        setError(res.error);
      }
    }
  }, [userKey]);

  const aceptar = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    dlog('1:1 aceptar', c.callId, 'de', c.peerKey);
    const media = await obtenerMedia(c.tipo);
    if (!media) { await post('reject', c.peerKey, { userKey, callId: c.callId }); limpiar(); return; }
    const pc = crearPc();
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    localStreamRef.current = media;
    setLocalStream(media);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: c.offerSdp });
    } catch { setError('No se pudo iniciar la llamada'); limpiar(); return; }
    flushIce();
    const answer = await pc.createAnswer();
    answer.sdp = mejorarSdp(answer.sdp);
    await pc.setLocalDescription(answer);
    setEstado('conectando');
    await post('answer', c.peerKey, { userKey, callId: c.callId, sdp: answer.sdp });
  }, [userKey]);

  const rechazar = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    await post('reject', c.peerKey, { userKey, callId: c.callId });
    limpiar();
  }, [userKey]);

  const colgar = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
    await post('hangup', c.peerKey, { userKey, callId: c.callId });
    limpiar();
  }, [userKey]);

  function toggleMic() {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !micOn;
    s.getAudioTracks().forEach((t) => { t.enabled = on; });
    setMicOn(on);
  }
  function toggleCam() {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !camOn;
    s.getVideoTracks().forEach((t) => { t.enabled = on; });
    setCamOn(on);
    // Avisa a los peers de la sala el nuevo estado de la camara.
    const sala = salaRef.current;
    if (sala) {
      for (const peerKey of Object.keys(remotosRef.current)) {
        postSala(sala.comunidadId, 'signal', { userKey, callId: sala.callId, paraKey: peerKey, kind: 'cam', camOn: on });
      }
    }
    // 1 a 1: al apagar la camara quitamos la pista del sender (replaceTrack null)
    // para que el otro vea "corte" al instante y muestre NUESTRA foto de perfil.
    const pc11 = pcRef.current;
    if (pc11) {
      const vt = s.getVideoTracks()[0] || null;
      for (const sender of pc11.getSenders()) {
        if (sender.track && sender.track.kind === 'video') {
          (on ? sender.replaceTrack(vt) : sender.replaceTrack(null)).catch(() => {});
        }
      }
    }
  }

  // ============================================================
  // Llamadas grupales (sala mesh). El media va P2P entre cada par de
  // participantes; la señalización va por Redis -> SSE (/grupo/.../signal).
  // ============================================================
  async function postSala(comunidadId, kind, body) {
    try {
      const url = `${API_URL}/api/calls/grupo/${comunidadId}/${kind}`;
      dlog('POST', url, body);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      dlog('POST', kind, 'status', r.status, j);
      return j;
    } catch (e) {
      dlog('POST', kind, 'ERROR', e?.message);
      return { error: 'Sin conexión' };
    }
  }

  function setRemotoInfo(key, info) {
    setRemotos((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...info } }));
  }

  // Crea (o reutiliza) la RTCPeerConnection hacia otro participante.
  function crearPcGrupo(peerKey) {
    const s = salaRef.current;
    if (!s) { dlog('crearPcGrupo sin sala'); return null; }
    const existente = remotosRef.current[peerKey]?.pc;
    if (existente) return existente;
    dlog('crearPcGrupo', peerKey, 'local?', !!localStreamRef.current);

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        postSala(s.comunidadId, 'signal', {
          userKey, callId: s.callId, paraKey: peerKey, kind: 'ice', candidate: e.candidate,
        });
      }
    };
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) setRemotoInfo(peerKey, { stream: e.streams[0] });
      afinarAudio(pc);
    };
    pc.onconnectionstatechange = () => {
      dlog('pc', peerKey, 'connectionState', pc.connectionState);
      if (pc.connectionState === 'connected') afinarAudio(pc);
      else if (pc.connectionState === 'disconnected') { try { pc.restartIce?.(); } catch { /* noop */ } }
      else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removerPeerGrupo(peerKey);
      }
    };
    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

    remotosRef.current[peerKey] = { pc, info: remotosRef.current[peerKey]?.info || { userKey: peerKey } };
    return pc;
  }

  function removerPeerGrupo(peerKey) {
    const p = remotosRef.current[peerKey];
    if (p) {
      try { p.pc?.close(); } catch { /* noop */ }
      delete remotosRef.current[peerKey];
    }
    delete pendingSalaIceRef.current[peerKey];
    setRemotos((prev) => { const n = { ...prev }; delete n[peerKey]; return n; });
    // Si el fijado se va, volvemos a la rejilla.
    setPinnedKey((k) => (k === peerKey ? null : k));
  }

  async function flushSalaIce(peerKey, pc) {
    if (!pc || !pc.remoteDescription) return;
    const cola = pendingSalaIceRef.current[peerKey] || [];
    pendingSalaIceRef.current[peerKey] = [];
    for (const c of cola) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
  }

  // Como iniciador, crea la oferta hacia cada participante nuevo.
  async function ofertarA(peerKey) {
    const s = salaRef.current;
    if (!s) { dlog('ofertarA sin sala', peerKey); return; }
    const pc = crearPcGrupo(peerKey);
    if (!pc) return;
    try {
      dlog('ofertarA ->', peerKey);
      const offer = await pc.createOffer();
      offer.sdp = mejorarSdp(offer.sdp);
      await pc.setLocalDescription(offer);
      await postSala(s.comunidadId, 'signal', {
        userKey, callId: s.callId, paraKey: peerKey, kind: 'offer', sdp: offer.sdp,
      });
    } catch (e) { dlog('ofertarA ERROR', e?.message); }
  }

  async function iniciarGrupo(comunidadId, tipo, info) {
    dlog('iniciarGrupo', { comunidadId, tipo, userKey, enSala: !!salaRef.current, enLlamada: !!callRef.current });
    if (!userKey || !comunidadId || salaRef.current || callRef.current) { dlog('iniciarGrupo abortado', { userKey: !!userKey, comunidadId: !!comunidadId, enSala: !!salaRef.current, enLlamada: !!callRef.current }); return; }
    if (!navigator?.mediaDevices?.getUserMedia) {
      dlog('SIN mediaDevices (grupo)', { secure: (typeof window !== 'undefined' && window.isSecureContext), proto: (typeof window !== 'undefined' && window.location.protocol) });
      setError('Tu navegador no soporta llamadas'); return;
    }
    // Si ya hay una llamada en curso en el grupo (iniciada por OTRO),
    // no se puede crear otra: hay que unirse a la existente.
    try {
      const act = await apiComunidad.llamadaGrupoActiva(comunidadId);
      if (act?.sala && String(act.sala.iniciador_key) !== String(userKey)) {
        dlog('iniciarGrupo abortado: ya hay llamada en curso', act.sala.call_id);
        setError('Ya hay una llamada en curso en este grupo. Únete a ella.');
        return;
      }
    } catch { /* sin red: el backend igual lo valida */ }
    const media = await obtenerMedia(tipo);
    if (!media) { dlog('iniciarGrupo sin media'); return; }
    const callId = nuevoCallId();
    const res = await postSala(comunidadId, 'iniciar', { userKey, callId, tipo });
    if (res?.error) { media.getTracks().forEach((t) => t.stop()); setError(res.error); return; }
    dlog('iniciarGrupo OK callId', callId);
    localStreamRef.current = media;
    setLocalStream(media);
    const s = { comunidadId, callId, tipo, nombre: info?.nombre || '', iniciador: userKey };
    salaRef.current = s;
    setSala(s);
    setError('');
  }

  async function unirseGrupo(comunidadId, callId, tipo, info) {
    dlog('unirseGrupo', { comunidadId, callId, tipo, userKey, enSala: !!salaRef.current, enLlamada: !!callRef.current });
    if (!userKey || !comunidadId || !callId) { setError('Datos de llamada inválidos'); dlog('unirseGrupo abortado datos'); return; }
    if (salaRef.current || callRef.current) { setError('Ya estás en una llamada'); dlog('unirseGrupo abortado ya en llamada'); return; }
    if (!navigator?.mediaDevices?.getUserMedia) { setError('Tu navegador no soporta llamadas'); return; }
    setError('');
    // Acepta el aviso entrante (oculta el modal mientras conecta).
    setSala({ comunidadId, callId, tipo: tipo || 'audio', nombre: info?.nombre || '' });
    const media = await obtenerMedia(tipo || 'audio');
    if (!media) { dlog('unirseGrupo sin media'); setSala(null); return; }
    const res = await postSala(comunidadId, 'unirse', { userKey, callId });
    if (res?.error) { media.getTracks().forEach((t) => t.stop()); setSala(null); setError(res.error); return; }
    dlog('unirseGrupo OK participantes', res?.participantes);
    localStreamRef.current = media;
    setLocalStream(media);
    const s = { comunidadId, callId, tipo: tipo || 'audio', nombre: info?.nombre || '', iniciador: res?.iniciador || null };
    salaRef.current = s;
    setSala(s);
    // Ofrezco a los que ya estaban (el iniciador también ofertará a los nuevos).
    const otros = Array.isArray(res?.participantes) ? res.participantes : [];
    for (const p of otros) {
      if (String(p.user_key) === String(userKey)) continue;
      setRemotoInfo(p.user_key, { info: { userKey: p.user_key, nombre: p.usuario, avatar: p.avatar } });
      await ofertarA(p.user_key);
    }
  }

  // Limpieza local de la sala (sin avisar al backend).
  function limpiarSalaLocal() {
    for (const key of Object.keys(remotosRef.current)) removerPeerGrupo(key);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => {
      try { if (t._pkpCleanup) t._pkpCleanup(); } catch { /* noop */ }
      try { t.stop(); } catch { /* noop */ }
    });
    localStreamRef.current = null;
    salaRef.current = null;
    setSala(null);
    setLocalStream(null);
    setRemotos({});
    setPinnedKey(null);
    setMicOn(true);
    setCamOn(true);
    setMinimizado(false);
    cerrarPipRef.current?.();
  }

  const salirGrupoRef = useRef(null);
  const limpiarSalaLocalRef = useRef(null);
  limpiarSalaLocalRef.current = limpiarSalaLocal;

  async function salirGrupo() {
    const s = salaRef.current;
    if (!s) { setSala(null); return; }
    const { comunidadId, callId } = s;
    limpiarSalaLocal();
    await postSala(comunidadId, 'salir', { userKey, callId });
  }
  salirGrupoRef.current = salirGrupo;

  // Al cerrar/recargar la pestaña, avisa que salgo de la sala (best-effort).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const alSalir = () => {
      const s = salaRef.current;
      if (!s) return;
      const body = JSON.stringify({ userKey, callId: s.callId });
      // fetch con keepalive: mas fiable que sendBeacon para JSON.
      try {
        fetch(`${API_URL}/api/calls/grupo/${s.comunidadId}/salir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch { /* noop */ }
      try {
        navigator.sendBeacon(
          `${API_URL}/api/calls/grupo/${s.comunidadId}/salir`,
          new Blob([body], { type: 'application/json' })
        );
      } catch { /* noop */ }
    };
    window.addEventListener('pagehide', alSalir);
    window.addEventListener('beforeunload', alSalir);
    return () => {
      window.removeEventListener('pagehide', alSalir);
      window.removeEventListener('beforeunload', alSalir);
    };
  }, [userKey]);

  // Señalización entrante.
  useEffect(() => {
    if (typeof window === 'undefined' || !userKey) return undefined;
    const on = async (e) => {
      const d = e?.detail || {};
      const tipo = String(d.type || '');
      if (!tipo.startsWith('call_')) return;
      const p = d.payload || {};
      const esGrupo = tipo.startsWith('call_grupo_');
      if (esGrupo) dlog('evento', tipo, p, 'salaLocal?', !!salaRef.current);
      // call_state llega a AMBOS lados (de y para); los demas 1:1 solo al
      // destinatario. Los de grupo se filtran por callId mas abajo.
      const soyParte = String(p.de) === String(userKey) || String(p.para) === String(userKey);
      if (tipo === 'call_state') {
        if (!soyParte) return;
      } else {
        if (String(p.de) === String(userKey)) return;
        if (!esGrupo && String(p.para) !== String(userKey)) return;
      }
      const c = callRef.current;

      if (tipo === 'call_offer') {
        dlog('1:1 offer entrante de', p.de, p.callId, 'ocupado?', !!c);
        if (c) { await post('reject', p.de, { userKey, callId: p.callId }); return; }
        const info = {
          callId: p.callId, tipo: p.tipo === 'video' ? 'video' : 'audio',
          peerKey: p.de, peerNombre: p.de_nombre || '', peerAvatar: p.de_avatar || null,
          direction: 'in', estado: 'sonando', offerSdp: p.sdp,
        };
        callRef.current = info;
        setCall(info);
      } else if (tipo === 'call_answer') {
        dlog('1:1 answer de', p.de, p.callId);
        if (!c || String(p.callId) !== String(c.callId)) return;
        try { await pcRef.current?.setRemoteDescription({ type: 'answer', sdp: p.sdp }); } catch { /* noop */ }
        flushIce();
        setConectadoEn(Date.now());
        setEstado('activa');
      } else if (tipo === 'call_ice') {
        if (!c || String(p.callId) !== String(c.callId)) return;
        if (!p.candidate) return;
        if (pcRef.current && pcRef.current.remoteDescription) {
          try { await pcRef.current.addIceCandidate(p.candidate); } catch { /* noop */ }
        } else {
          pendingIceRef.current.push(p.candidate);
        }
      } else if (tipo === 'call_reject') {
        if (c && String(p.callId) === String(c.callId)) limpiar();
      } else if (tipo === 'call_hangup') {
        if (c && String(p.callId) === String(c.callId)) limpiar();

      } else if (tipo === 'call_state') {
        // Sincroniza TODAS las pestanas del mismo usuario:
        // - estado terminal (rechazada/finalizada): cierra modal o corta llamada.
        // - estado activa: cierra el modal entrante si OTRA pestana lo acepto
        //   (NO corta la llamada del que esta en curso; eso mataba la videollamada).
        // - estado sonando: si ya estoy en OTRA llamada, rechazo la nueva.
        dlog('call_state', p.estado, p.callId, 'quien', p.quien, 'miCall', c?.callId);
        const esTerminal = p.estado === 'rechazada' || p.estado === 'finalizada' || p.estado === 'cancelada';
        if (esTerminal) {
          if (c && String(p.callId) === String(c.callId)) limpiar();
          setSala((prev) => (prev && String(prev.callId) === String(p.callId) ? null : prev));
          return;
        }
        if (p.estado === 'activa') {
          // Modal entrante "sonando" en esta pestana: otra pestana lo acepto.
          if (c && c.direction === 'in' && c.estado === 'sonando' && String(p.callId) === String(c.callId)) limpiar();
          return;
        }
        if (p.estado === 'sonando') {
          // Ya estoy en otra llamada distinta: la rechazo para no duplicar.
          if (c && String(c.callId) !== String(p.callId)) {
            await post('reject', p.de, { userKey, callId: p.callId });
          }
        }

      // ---- Grupales ----
      } else if (tipo === 'call_grupo_start') {
        // Solo los miembros del grupo pueden recibir la llamada.
        if (Array.isArray(p.miembros) && !p.miembros.map(String).includes(String(userKey))) {
          dlog('start ignorado, no soy miembro del grupo', p.conv);
          return;
        }
        // Aviso de llamada grupal entrante (solo si no estoy ya en una).
        if (salaRef.current || callRef.current) { dlog('start ignorado, ya en llamada'); return; }
        dlog('start entrante callId', p.callId, 'conv', p.conv);
        setSala((prev) => prev || {
          comunidadId: p.conv, callId: p.callId, tipo: p.tipo === 'video' ? 'video' : 'audio',
          nombre: p.grupo_nombre || '', iniciador: p.de, entrante: true,
          iniciadorNombre: p.de_nombre || '', iniciadorAvatar: p.de_avatar || null,
        });
      } else if (tipo === 'call_grupo_join') {
        const s = salaRef.current;
        if (!s || String(p.callId) !== String(s.callId)) { dlog('join ignorado', { miCallId: s?.callId, evCallId: p.callId }); return; }
        if (String(p.de) === String(userKey)) return;
        // Solo registro al nuevo; el que se une es quien crea la oferta
        // (evita ofertas cruzadas / glare en la malla).
        dlog('join de', p.de);
        setRemotoInfo(p.de, { info: { userKey: p.de, nombre: p.de_nombre, avatar: p.de_avatar } });
      } else if (tipo === 'call_grupo_leave') {
        const s = salaRef.current;
        // Si estoy como aviso entrante (aun sin unirme), cierro el modal si
        // el que salio es el iniciador o ya no queda nadie en la sala.
        setSala((prev) => {
          if (prev && prev.entrante && String(prev.callId) === String(p.callId)) {
            if (String(prev.iniciador) === String(p.de)) return null;
          }
          return prev;
        });
        if (!s || String(p.callId) !== String(s.callId)) return;
        dlog('leave de', p.de);
        removerPeerGrupo(p.de);
      } else if (tipo === 'call_grupo_end') {
        // La sala se cerro del todo: si estoy unido, limpio localmente; si
        // solo tengo el aviso entrante, cierro el modal.
        if (salaRef.current && String(salaRef.current.callId) === String(p.callId)) {
          limpiarSalaLocalRef.current?.();
        } else {
          setSala((prev) => (prev && String(prev.callId) === String(p.callId) ? null : prev));
        }
      } else if (tipo === 'call_grupo_signal') {
        const s = salaRef.current;
        if (!s || String(p.callId) !== String(s.callId)) { dlog('signal ignorado callId', { miCallId: s?.callId, evCallId: p.callId }); return; }
        if (String(p.para) !== String(userKey)) return;
        if (String(p.de) === String(userKey)) return;
        const peerKey = p.de;
        dlog('signal', p.kind, 'de', peerKey);
        if (p.kind === 'offer') {
          const pc = crearPcGrupo(peerKey);
          if (!pc) return;
          try {
            await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
          } catch (e) { dlog('setRemote offer ERROR', e?.message); return; }
          await flushSalaIce(peerKey, pc);
          const answer = await pc.createAnswer();
          answer.sdp = mejorarSdp(answer.sdp);
          await pc.setLocalDescription(answer);
          await postSala(s.comunidadId, 'signal', {
            userKey, callId: s.callId, paraKey: peerKey, kind: 'answer', sdp: answer.sdp,
          });
        } else if (p.kind === 'answer') {
          const pc = remotosRef.current[peerKey]?.pc;
          if (!pc) { dlog('answer sin pc para', peerKey); return; }
          try { await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }); } catch (e) { dlog('setRemote answer ERROR', e?.message); }
          await flushSalaIce(peerKey, pc);
        } else if (p.kind === 'ice') {
          if (!p.candidate) return;
          const pc = remotosRef.current[peerKey]?.pc;
          if (pc && pc.remoteDescription) {
            try { await pc.addIceCandidate(p.candidate); } catch { /* noop */ }
          } else {
            (pendingSalaIceRef.current[peerKey] = pendingSalaIceRef.current[peerKey] || []).push(p.candidate);
          }
        } else if (p.kind === 'cam') {
          // El peer avisa si su camara esta on/off (para mostrar su avatar/fondo).
          setRemotoInfo(peerKey, { camOn: p.camOn !== false });
        }
      }
    };
    window.addEventListener('pikantepe:change', on);
    return () => window.removeEventListener('pikantepe:change', on);
  }, [userKey]);

  const enLlamada = !!call;
  const dur = conectadoEn ? (Date.now() - conectadoEn) / 1000 : 0;
  const grupoEnLlamada = !!sala;
  const enCualquierLlamada = enLlamada || grupoEnLlamada;

  const ui = (() => {
    if (!call) return null;
    const esIn = call.direction === 'in' && call.estado === 'sonando';
    const titulo = call.peerNombre || (call.tipo === 'video' ? 'Videollamada' : 'Llamada');

    if (esIn) {
      return (
        <div className={styles.overlay}>
          <div className={styles.incoming}>
            <span className={styles.bigAvatar}>
              {call.peerAvatar ? <img src={mediaUrl(call.peerAvatar)} alt="" /> : String(titulo).charAt(0).toUpperCase()}
            </span>
            <strong className={styles.inName}>{titulo}</strong>
            <span className={styles.inSub}>{call.tipo === 'video' ? 'Videollamada entrante' : 'Llamada de voz entrante'}</span>
            <div className={styles.inActions}>
              <button type="button" className={`${styles.rnd} ${styles.rndRed}`} onClick={rechazar} title="Rechazar">
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
              <button type="button" className={`${styles.rnd} ${styles.rndGreen}`} onClick={aceptar} title="Aceptar">
                {call.tipo === 'video'
                  ? <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                  : <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`${(minimizado || pipWin) ? styles.overlayMin : styles.overlay} ${pipWin ? styles.overlayPip : ''} ${call.tipo === 'video' ? styles.overlayVideo : ''}`}>
        {call.tipo === 'video' ? (
          <>
            <div className={styles.videoFallback} style={{ display: remoteVideoOn ? 'none' : 'flex' }}>
              <WaveAvatar stream={remoteStream} avatar={call.peerAvatar} nombre={titulo} />
              <strong className={styles.inName}>{titulo}</strong>
              <span className={styles.inSub}>{call.estado === 'activa' ? 'Cámara apagada' : 'Conectando…'}</span>
            </div>
            {remoteVideoOn && <RemoteVideo stream={remoteStream} className={styles.remoteVideo} />}
            {/* La voz SIEMPRE por <audio> (el <video> va muted): si el otro
                no tiene camara, igual se escucha su micro. */}
            {remoteStream && <RemoteAudio stream={remoteStream} />}
          </>
        ) : (
          <div className={styles.audioCall}>
            {remoteStream && <RemoteAudio stream={remoteStream} />}
            <WaveAvatar stream={remoteStream} avatar={call.peerAvatar} nombre={titulo} />
            <strong className={styles.inName}>{titulo}</strong>
          </div>
        )}

        <WindowBar
          titulo={titulo}
          sub={call.estado === 'activa' ? fmtDur(dur) : 'Conectando…'}
          minimizado={minimizado}
          pipWin={pipWin}
          onMin={toggleMin}
          onClose={colgar}
        />

        {call.tipo === 'video' && (
          <LocalBox stream={localStream} videoOn={localVideoOn} user={user} userKey={userKey} />
        )}

        <div className={styles.controls}>
          <button type="button" className={`${styles.rnd} ${micOn ? styles.rndDim : styles.rndRed}`} onClick={toggleMic} title={micOn ? 'Silenciar' : 'Activar micrófono'}>
            <ion-icon name={micOn ? 'mic-outline' : 'mic-off-outline'} suppressHydrationWarning></ion-icon>
          </button>
          {call.tipo === 'video' && (
            <button type="button" className={`${styles.rnd} ${camOn ? styles.rndDim : styles.rndRed}`} onClick={toggleCam} title={camOn ? 'Apagar cámara' : 'Encender cámara'}>
              <ion-icon name={camOn ? 'videocam-outline' : 'videocam-off-outline'} suppressHydrationWarning></ion-icon>
            </button>
          )}
          <button type="button" className={`${styles.rnd} ${styles.rndRed}`} onClick={colgar} title="Colgar">
            <ion-icon name="call-outline" className={styles.hangIcon} suppressHydrationWarning></ion-icon>
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    );
  })();

  const uiSala = (() => {
    if (!sala) return null;
    const titulo = sala.nombre || 'Llamada de grupo';
    // Aviso entrante (aun sin unirme): campana + aceptar/unirse.
    if (sala.entrante) {
      return (
        <div className={styles.overlay}>
          <div className={styles.incoming}>
            <span className={styles.bigAvatar}>
              {sala.iniciadorAvatar ? <img src={mediaUrl(sala.iniciadorAvatar)} alt="" /> : String(sala.iniciadorNombre || titulo).charAt(0).toUpperCase()}
            </span>
            <strong className={styles.inName}>{titulo}</strong>
            <span className={styles.inSub}>
              {sala.iniciadorNombre ? `${sala.iniciadorNombre} · ` : ''}{sala.tipo === 'video' ? 'Videollamada de grupo' : 'Llamada de grupo'}
            </span>
            <div className={styles.inActions}>
              <button type="button" className={`${styles.rnd} ${styles.rndRed}`} onClick={() => setSala(null)} title="Rechazar">
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
              <button type="button" className={`${styles.rnd} ${styles.rndGreen}`} onClick={() => unirseGrupo(sala.comunidadId, sala.callId, sala.tipo, { nombre: titulo })} title="Unirse">
                {sala.tipo === 'video'
                  ? <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                  : <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const grid = Object.values(remotos);
    const esVideo = sala.tipo === 'video';
    return (
      <div className={`${(minimizado || pipWin) ? styles.overlayMin : styles.overlay} ${pipWin ? styles.overlayPip : ''} ${esVideo ? styles.overlayVideo : ''}`}>
        {/* Audio de cada peer, siempre presente (voz grupal y video). */}
        <div className={styles.audiosOcultos} aria-hidden="true">
          {grid.map((r) => (r.stream ? <RemoteAudio key={r.info?.userKey} stream={r.stream} /> : null))}
        </div>
        {esVideo ? (() => {
          // Rejilla tipo Meet: yo mismo + los demas, con chip de nombre y pin.
          const selfEntry = {
            info: { userKey: userKey || 'me', nombre: user?.nombre || user?.usuario || 'Tú', avatar: user?.avatar || null },
            stream: localStream,
          };
          const todos = [selfEntry, ...grid];
          const fijado = pinnedKey ? todos.find((t) => t.info.userKey === pinnedKey) : null;
          const pinDe = (k) => () => togglePin(k);
          if (fijado) {
            // Vista orador (Teams): el fijado en grande + tira con el resto.
            const resto = todos.filter((t) => t.info.userKey !== pinnedKey);
            return (
              <div className={styles.speakerView}>
                <div className={styles.speakerMain}>
                  <VideoTile stream={fijado.stream} info={fijado.info} pinned onPin={pinDe(pinnedKey)} />
                </div>
                {resto.length > 0 && (
                  <div className={styles.speakerStrip}>
                    {resto.map((t) => (
                      <VideoTile key={t.info.userKey} stream={t.stream} info={t.info} onPin={pinDe(t.info.userKey)} />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className={styles.gridVideo}>
              {todos.map((t) => (
                <VideoTile key={t.info.userKey} stream={t.stream} info={t.info} onPin={pinDe(t.info.userKey)} />
              ))}
            </div>
          );
        })() : (
          <div className={styles.audioCall}>
            <div className={styles.gridAudio}>
              {grid.map((r) => (
                <WaveAvatar key={r.info?.userKey} stream={r.stream} avatar={r.info?.avatar} nombre={r.info?.nombre} />
              ))}
            </div>
            <strong className={styles.inName}>{titulo}</strong>
            <span className={styles.inSub}>{grid.length + 1} en la llamada</span>
          </div>
        )}

        <WindowBar
          titulo={titulo}
          sub={`${grid.length + 1} en la llamada`}
          minimizado={minimizado}
          pipWin={pipWin}
          onMin={toggleMin}
          onClose={salirGrupo}
        />

        <div className={styles.controls}>
          <button type="button" className={`${styles.rnd} ${micOn ? styles.rndDim : styles.rndRed}`} onClick={toggleMic} title={micOn ? 'Silenciar' : 'Activar micrófono'}>
            <ion-icon name={micOn ? 'mic-outline' : 'mic-off-outline'} suppressHydrationWarning></ion-icon>
          </button>
          {esVideo && (
            <button type="button" className={`${styles.rnd} ${camOn ? styles.rndDim : styles.rndRed}`} onClick={toggleCam} title={camOn ? 'Apagar cámara' : 'Encender cámara'}>
              <ion-icon name={camOn ? 'videocam-outline' : 'videocam-off-outline'} suppressHydrationWarning></ion-icon>
            </button>
          )}
          <button type="button" className={`${styles.rnd} ${styles.rndRed}`} onClick={salirGrupo} title="Salir">
            <ion-icon name="call-outline" className={styles.hangIcon} suppressHydrationWarning></ion-icon>
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    );
  })();

  // ============================================================
  // Document Picture-in-Picture: la llamada vive en su propia ventana
  // flotante (siempre encima) y puedes navegar por la app con normalidad.
  // ============================================================
  const abrirPip = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const activa = !!(callRef.current || salaRef.current);
    if (!activa) return;
    if (!('documentPictureInPicture' in window)) {
      // Sin soporte: cae al modo ventana flotante dentro de la pagina.
      setMinimizado(true);
      return;
    }
    if (pipWinRef.current) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 260 });
      // Copia las hojas de estilo (incluye el CSS module con hashes).
      for (const hoja of Array.from(document.styleSheets)) {
        try {
          const reglas = Array.from(hoja.cssRules || []).map((r) => r.cssText).join('\n');
          const style = pip.document.createElement('style');
          style.textContent = reglas;
          pip.document.head.appendChild(style);
        } catch {
          // Hoja externa (CORS): la enlazamos por URL.
          if (hoja.href) {
            const link = pip.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = hoja.href;
            pip.document.head.appendChild(link);
          }
        }
      }
      // Copia los scripts de la pagina (incluye ionicons) para que los
      // <ion-icon> se rendericen en la ventana PiP.
      for (const script of Array.from(document.scripts)) {
        if (!script.src) continue;
        if (!/ionicons|unpkg|esm\.sh/i.test(script.src)) continue;
        const s = pip.document.createElement('script');
        s.type = script.type || 'module';
        s.src = script.src;
        pip.document.head.appendChild(s);
      }
      pip.document.documentElement.style.background = '#08080a';
      pip.document.body.style.margin = '0';
      pip.document.body.className = document.body.className;
      pip.addEventListener('pagehide', () => {
        pipWinRef.current = null;
        setPipWin(null);
      });
      pipWinRef.current = pip;
      setPipWin(pip);
      setMinimizado(false);
    } catch { /* cancelado por el usuario */ }
  }, []);

  const cerrarPip = useCallback(() => {
    try { pipWinRef.current?.close(); } catch { /* noop */ }
    pipWinRef.current = null;
    setPipWin(null);
  }, []);
  cerrarPipRef.current = cerrarPip;

  // Asegura que el audio del microfono sigue enviandose tras mover la ventana.
  // (Al remontar la UI en PiP algunos navegadores pausan pistas; aqui se
  // reactivan y, si el sender perdio el track, se vuelve a enganchar.)
  const reafirmarSenders = useCallback(() => {
    const local = localStreamRef.current;
    if (!local) return;
    // Reactiva las pistas por si quedaron deshabilitadas.
    try { local.getAudioTracks().forEach((t) => { if (!micOnRef.current) t.enabled = false; }); } catch { /* noop */ }
    const pcs = [];
    if (pcRef.current) pcs.push(pcRef.current);
    for (const p of Object.values(remotosRef.current)) if (p?.pc) pcs.push(p.pc);
    for (const pc of pcs) {
      try {
        for (const s of pc.getSenders()) {
          if (!s.track || s.track.kind !== 'audio') continue;
          if (s.track.readyState === 'ended' || s.track !== local.getAudioTracks()[0]) {
            // El sender perdio el track: lo vuelve a enganchar con el actual.
            const at = local.getAudioTracks()[0];
            if (at) s.replaceTrack(at).catch(() => {});
          }
        }
        afinarAudio(pc);
      } catch { /* noop */ }
    }
    dlog('reafirmarSenders', { pcs: pcs.length });
  }, []);
  reafirmarSendersRef.current = reafirmarSenders;

  function togglePin(key) {
    setPinnedKey((prev) => (prev && prev !== key ? key : null));
    dlog('togglePin', key);
  }

  function toggleMin() {
    // Si ya esta achicado (PiP o ventana flotante), restaura a la app.
    if (pipWinRef.current) { cerrarPip(); return; }
    if (minimizado) { setMinimizado(false); return; }
    // Si no, intenta ventana aparte; sin soporte, usa el modo flotante.
    if ('documentPictureInPicture' in (typeof window !== 'undefined' ? window : {})) abrirPip();
    else setMinimizado(true);
  }

  // Envia la solicitud de amistad desde el modal "solo amigos".
  async function enviarSolicitudAmistad() {
    if (!amistadModal?.peerKey || amistadEnviando) return;
    setAmistadEnviando(true);
    const r = await apiComunidad.amistadAccion(amistadModal.peerKey, userKey, 'solicitar');
    setAmistadEnviando(false);
    if (r?.error) { setError(r.error); return; }
    setAmistadModal((m) => (m ? { ...m, estado: 'enviada' } : m));
  }

  const modalAmistad = amistadModal ? (
    <div className={styles.amistadOverlay} onClick={() => setAmistadModal(null)}>
      <div className={styles.amistadCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className={styles.amistadAvatar}>
          {amistadModal.avatar
            ? <img src={mediaUrl(amistadModal.avatar)} alt="" />
            : String(amistadModal.nombre || '?').charAt(0).toUpperCase()}
        </span>
        <strong className={styles.amistadTitle}>
          {amistadModal.estado === 'enviada' ? 'Solicitud enviada' : (amistadModal.nombre || 'Este usuario')}
        </strong>
        <span className={styles.amistadText}>
          {amistadModal.estado === 'enviada'
            ? 'Tu solicitud de amistad fue enviada. Podras llamarle cuando la acepte.'
            : 'Solo puedes llamar a tus amigos. Envia una solicitud de amistad para poder llamarle.'}
        </span>
        <div className={styles.amistadActions}>
          {amistadModal.estado === 'enviada' ? (
            <button type="button" className={styles.amistadOk} onClick={() => setAmistadModal(null)}>Entendido</button>
          ) : (
            <>
              <button type="button" className={styles.amistadCancel} onClick={() => setAmistadModal(null)}>Cancelar</button>
              <button type="button" className={styles.amistadOk} onClick={enviarSolicitudAmistad} disabled={amistadEnviando}>
                {amistadEnviando ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // Toast de error cuando no hay UI de llamada (p. ej. fallo la camara al iniciar).
  const toastError = error ? (
    <div className={styles.toastError} role="alert">
      <ion-icon name="warning-outline" suppressHydrationWarning></ion-icon>
      <span>{error}</span>
      <button type="button" onClick={() => setError('')} aria-label="Cerrar">
        <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
      </button>
    </div>
  ) : null;

  return (
    <CallContext.Provider value={{
      iniciar, colgar, enLlamada, call,
      iniciarGrupo, unirseGrupo, salirGrupo, sala, grupoEnLlamada, enCualquierLlamada,
      avisar: setError,
    }}>
      {children}
      {/* Con ventana PiP: la llamada va ahi y deja la app navegable. */}
      {mounted && ui && !pipWin && createPortal(ui, document.body)}
      {mounted && uiSala && !pipWin && createPortal(uiSala, document.body)}
      {mounted && pipWin && ui && createPortal(ui, pipWin.document.body)}
      {mounted && pipWin && uiSala && createPortal(uiSala, pipWin.document.body)}
      {mounted && toastError && createPortal(toastError, document.body)}
      {mounted && modalAmistad && createPortal(modalAmistad, document.body)}
      {mounted && DEBUG_CALLS && createPortal(<PanelDiagnostico onCerrar={() => { try { window.localStorage.removeItem('pkpDebugCalls'); } catch { /* noop */ } window.location.reload(); }} />, document.body)}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}

export default CallProvider;
