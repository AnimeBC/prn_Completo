'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './llamadas.module.css';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';

const CallContext = createContext({ iniciar: () => {}, colgar: () => {}, enLlamada: false });

function nuevoCallId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  const callRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

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

  // Adjunta los streams a los <video>.
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, call?.estado]);
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, call?.estado]);

  async function post(kind, otroKey, body) {
    try {
      await fetch(`${API_URL}/api/calls/${encodeURIComponent(otroKey)}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* noop */ }
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
    pc.ontrack = (e) => { if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        setConectadoEn((prev) => prev || Date.now());
        setEstado('activa');
      } else if (st === 'failed') {
        setError('Se perdió la conexión');
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
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: tipo === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch {
      setError('No se pudo acceder a la cámara/micrófono');
      return null;
    }
  }

  function limpiar() {
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
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
  }

  const iniciar = useCallback(async (otroKey, tipo, info) => {
    if (!userKey || !otroKey || callRef.current) return;
    if (!navigator?.mediaDevices?.getUserMedia) { setError('Tu navegador no soporta llamadas'); return; }
    const media = await obtenerMedia(tipo);
    if (!media) return;
    const pc = crearPc();
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    const offer = await pc.createOffer();
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
    setError('');
    await post('offer', otroKey, { userKey, callId: info2.callId, tipo, sdp: offer.sdp });
  }, [userKey]);

  const aceptar = useCallback(async () => {
    const c = callRef.current;
    if (!c) return;
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
  }

  // Señalización entrante.
  useEffect(() => {
    if (typeof window === 'undefined' || !userKey) return undefined;
    const on = async (e) => {
      const d = e?.detail || {};
      const tipo = String(d.type || '');
      if (!tipo.startsWith('call_')) return;
      const p = d.payload || {};
      if (String(p.para) !== String(userKey)) return;
      if (String(p.de) === String(userKey)) return;
      const c = callRef.current;

      if (tipo === 'call_offer') {
        if (c) { await post('reject', p.de, { userKey, callId: p.callId }); return; }
        const info = {
          callId: p.callId, tipo: p.tipo === 'video' ? 'video' : 'audio',
          peerKey: p.de, peerNombre: p.de_nombre || '', peerAvatar: p.de_avatar || null,
          direction: 'in', estado: 'sonando', offerSdp: p.sdp,
        };
        callRef.current = info;
        setCall(info);
      } else if (tipo === 'call_answer') {
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
      }
    };
    window.addEventListener('pikantepe:change', on);
    return () => window.removeEventListener('pikantepe:change', on);
  }, [userKey]);

  const enLlamada = !!call;
  const dur = conectadoEn ? (Date.now() - conectadoEn) / 1000 : 0;

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
      <div className={`${styles.overlay} ${call.tipo === 'video' ? styles.overlayVideo : ''}`}>
        {call.tipo === 'video' ? (
          <video ref={remoteVideoRef} className={styles.remoteVideo} autoPlay playsInline />
        ) : (
          <div className={styles.audioCall}>
            <span className={styles.bigAvatar}>
              {call.peerAvatar ? <img src={mediaUrl(call.peerAvatar)} alt="" /> : String(titulo).charAt(0).toUpperCase()}
            </span>
            <strong className={styles.inName}>{titulo}</strong>
          </div>
        )}

        <div className={styles.topBar}>
          <span className={styles.callName}>{titulo}</span>
          <span className={styles.callTime}>{call.estado === 'activa' ? fmtDur(dur) : 'Conectando…'}</span>
        </div>

        {call.tipo === 'video' && (
          <video ref={localVideoRef} className={styles.localVideo} autoPlay playsInline muted />
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

  return (
    <CallContext.Provider value={{ iniciar, colgar, enLlamada, call }}>
      {children}
      {mounted && ui && createPortal(ui, document.body)}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}

export default CallProvider;
