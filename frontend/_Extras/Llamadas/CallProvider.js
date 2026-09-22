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
const DEBUG_CALLS = typeof window !== 'undefined' && (() => {
  try { return window.localStorage.getItem('pkpDebugCalls') === '1'; } catch { return false; }
})();
function dlog(...args) {
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

  // fmtp: agrega/actualiza parametros de Opus.
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
  if (fmtpRe.test(sdp)) {
    sdp = sdp.replace(fmtpRe, (full, params) => {
      const set = new Set(String(params).split(';').map((x) => x.trim()).filter(Boolean));
      // Quita valores viejos que podrian molestar.
      for (const k of ['stereo', 'sprop-stereo', 'useinbandfec', 'usedtx', 'maxaveragebitrate', 'minptime', 'maxplaybackrate']) {
        for (const item of [...set]) if (item.startsWith(`${k}=`)) set.delete(item);
      }
      set.add('minptime=10');
      set.add('useinbandfec=1');
      // usedtx=0: DTX corta el inicio de las palabras (se "entrecortan").
      // El silencio suave se logra con la puerta de ruido (opt-in), no con DTX.
      set.add('usedtx=0');
      set.add('maxaveragebitrate=48000');
      set.add('maxplaybackrate=48000');
      return `a=fmtp:${pt} ${[...set].join(';')}`;
    });
  } else {
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

// Tile de video grupal: muestra el video del peer o, si no tiene camara/video,
// su avatar sobre un fondo. Detecta cambios de tracks para reaccionar al instante.
function VideoTile({ stream, info }) {
  const videoRef = useRef(null);
  const [hayVideo, setHayVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!stream) { setHayVideo(false); return undefined; }
    if (el && el.srcObject !== stream) el.srcObject = stream;
    const tiene = () => stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
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
    <div className={styles.tile}>
      <video
        ref={videoRef}
        className={styles.tileVideo}
        style={{ visibility: mostrarVideo ? 'visible' : 'hidden' }}
        autoPlay
        playsInline
      />
      {!mostrarVideo && (
        <div className={styles.tileFallback}>
          <span className={styles.tileAvatar}>
            {info?.avatar ? <img src={mediaUrl(info.avatar)} alt="" /> : inicial}
          </span>
          <span className={styles.tileNombre}>{info?.nombre || ''}</span>
        </div>
      )}
    </div>
  );
}

// Reproduce el audio de un peer (necesario para llamadas de voz grupales).
function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    if (el.srcObject !== stream) el.srcObject = stream;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* requiere gesto; se reintenta al pulsar */ });
    return undefined;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

// Video remoto (1:1 y grupal). Asigna srcObject al montar y reintenta play().
function RemoteVideo({ stream, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return undefined;
    if (el.srcObject !== stream) el.srcObject = stream;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* bloqueado; se reintenta al gesto */ });
    return undefined;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline />;
}

// Barra de titulo estilo ventana de app: minimizar / agrandar / cerrar.
function WindowBar({ titulo, sub, minimizado, grande, pipWin, onMin, onMax, onClose }) {
  return (
    <div className={styles.winBar}>
      <span className={styles.winDot} />
      <div className={styles.winInfo}>
        <strong className={styles.winTitle}>{titulo}</strong>
        {sub && <span className={styles.winSub}>{sub}</span>}
      </div>
      <div className={styles.winBtns}>
        <button type="button" className={styles.winBtn} onClick={onMin} title={minimizado ? 'Restaurar' : 'Minimizar'}>
          <ion-icon name={minimizado ? 'chevron-up-outline' : 'chevron-down-outline'} suppressHydrationWarning></ion-icon>
        </button>
        <button type="button" className={styles.winBtn} onClick={onMax} title={grande ? 'Restaurar' : 'Agrandar'}>
          <ion-icon name={grande ? 'contract-outline' : 'expand-outline'} suppressHydrationWarning></ion-icon>
        </button>
        <button type="button" className={`${styles.winBtn} ${styles.winClose}`} onClick={onClose} title="Cerrar (colgar)">
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>
      </div>
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
  const { userKey } = useAuth();
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
  // Ventana de llamada minimizada (para poder navegar por la app).
  const [minimizado, setMinimizado] = useState(false);
  // Ventana agrandada (casi pantalla completa dentro de la app).
  const [grande, setGrande] = useState(false);
  // Document Picture-in-Picture: ventana flotante siempre encima del navegador.
  const [pipWin, setPipWin] = useState(null);
  const pipWinRef = useRef(null);
  const cerrarPipRef = useRef(null);
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

  // Detecta si el peer remoto (1:1) tiene camara activa.
  useEffect(() => {
    if (!remoteStream) { setRemoteVideoOn(false); return undefined; }
    const tiene = () => remoteStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
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
      video: quiereVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
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
      // Si pedia video y fallo, intenta al menos audio (deja seguir la llamada).
      if (quiereVideo) {
        try {
          const soloAudio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setError(esCamara(e)
            ? 'No se pudo usar la cámara; se continuó solo con audio'
            : 'No se pudo acceder a la cámara');
          return aplicarGateRuido(soloAudio);
        } catch { /* cae al mensaje general */ }
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
    setGrande(false);
    cerrarPipRef.current?.();
  }

  const iniciar = useCallback(async (otroKey, tipo, info) => {
    dlog('1:1 iniciar', { otroKey, tipo, userKey });
    setError('');
    if (!userKey || !otroKey || callRef.current) { dlog('1:1 iniciar abortado'); return; }
    if (!navigator?.mediaDevices?.getUserMedia) { setError('Tu navegador no soporta llamadas'); return; }
    const media = await obtenerMedia(tipo);
    if (!media) { dlog('1:1 iniciar sin media'); return; }
    const pc = crearPc();
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    const offer = await pc.createOffer();
    offer.sdp = mejorarSdp(offer.sdp);
    await pc.setLocalDescription(offer);

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
    if (!userKey || !comunidadId || salaRef.current || callRef.current) { dlog('iniciarGrupo abortado (guarda)'); return; }
    if (!navigator?.mediaDevices?.getUserMedia) { setError('Tu navegador no soporta llamadas'); return; }
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
    setMicOn(true);
    setCamOn(true);
    setMinimizado(false);
    setGrande(false);
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
      if (String(p.de) === String(userKey)) return;
      const c = callRef.current;
      // Los eventos 1 a 1 van dirigidos (para); los de grupo se filtran por callId.
      if (!esGrupo && String(p.para) !== String(userKey)) return;

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
      <div className={`${minimizado ? styles.overlayMin : (grande ? styles.overlayMax : styles.overlay)} ${call.tipo === 'video' ? styles.overlayVideo : ''}`}>
        {call.tipo === 'video' ? (
          <>
            <div className={styles.videoFallback} style={{ display: remoteVideoOn ? 'none' : 'flex' }}>
              <span className={styles.bigAvatar}>
                {call.peerAvatar ? <img src={mediaUrl(call.peerAvatar)} alt="" /> : String(titulo).charAt(0).toUpperCase()}
              </span>
              <strong className={styles.inName}>{titulo}</strong>
              <span className={styles.inSub}>{call.estado === 'activa' ? 'Cámara apagada' : 'Conectando…'}</span>
            </div>
            {remoteVideoOn && <RemoteVideo stream={remoteStream} className={styles.remoteVideo} />}
          </>
        ) : (
          <div className={styles.audioCall}>
            {remoteStream && <RemoteAudio stream={remoteStream} />}
            <span className={styles.bigAvatar}>
              {call.peerAvatar ? <img src={mediaUrl(call.peerAvatar)} alt="" /> : String(titulo).charAt(0).toUpperCase()}
            </span>
            <strong className={styles.inName}>{titulo}</strong>
          </div>
        )}

        <WindowBar
          titulo={titulo}
          sub={call.estado === 'activa' ? fmtDur(dur) : 'Conectando…'}
          minimizado={minimizado}
          grande={grande}
          pipWin={pipWin}
          onMin={toggleMin}
          onMax={() => { if (minimizado) { setMinimizado(false); return; } setGrande((v) => !v); }}
          onClose={colgar}
        />

        {call.tipo === 'video' && (
          <video
            ref={(el) => {
              localVideoRef.current = el;
              if (el && localStream) el.srcObject = localStream;
            }}
            className={styles.localVideo}
            autoPlay
            playsInline
            muted
          />
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
      <div className={`${minimizado ? styles.overlayMin : (grande ? styles.overlayMax : styles.overlay)} ${esVideo ? styles.overlayVideo : ''}`}>
        {/* Audio de cada peer, siempre presente (voz grupal y video). */}
        <div className={styles.audiosOcultos} aria-hidden="true">
          {grid.map((r) => (r.stream ? <RemoteAudio key={r.info?.userKey} stream={r.stream} /> : null))}
        </div>
        {esVideo ? (
          <div className={styles.gridVideo}>
            {grid.map((r) => (
              <VideoTile key={r.info?.userKey} stream={r.stream} info={r.info} />
            ))}
            {!grid.length && <div className={styles.audioCall}><strong className={styles.inName}>{titulo}</strong></div>}
          </div>
        ) : (
          <div className={styles.audioCall}>
            <div className={styles.gridAudio}>
              {grid.map((r) => (
                <span key={r.info?.userKey} className={styles.bigAvatar}>
                  {r.info?.avatar ? <img src={mediaUrl(r.info.avatar)} alt="" /> : String(r.info?.nombre || '?').charAt(0).toUpperCase()}
                </span>
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
          grande={grande}
          pipWin={pipWin}
          onMin={toggleMin}
          onMax={() => { if (minimizado) { setMinimizado(false); return; } setGrande((v) => !v); }}
          onClose={salirGrupo}
        />

        {esVideo && <video ref={localVideoRef} className={styles.localVideo} autoPlay playsInline muted />}

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

  function toggleMin() {
    if (pipWinRef.current) { cerrarPip(); return; }
    // Intenta ventana aparte; si no hay soporte, usa el modo flotante.
    abrirPip();
    setMinimizado((v) => (('documentPictureInPicture' in (typeof window !== 'undefined' ? window : {})) ? false : !v));
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
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}

export default CallProvider;
