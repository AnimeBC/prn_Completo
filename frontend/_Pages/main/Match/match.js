'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './match.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useCall } from '@/_Extras/Llamadas/CallProvider.js';
import { API_URL } from '@/_Extras/Api/api.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdSmartlink from '@/_Pages/main/Home/componentes/anuncio/AdSmartlink.js';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';

// Portal a document.body: el overlay de los modales (z 9800) vive FUERA de
// .body (z-index:1) del layout, asi tapa con blur el header fijo y la
// BottomNav en vez de quedar atrapado dentro de ese contexto de apilado.
function alBody(nodo) {
  if (typeof document === 'undefined') return null;
  return createPortal(nodo, document.body);
}

function fmtReloj(seg) {
  const h = String(Math.floor(seg / 3600)).padStart(2, '0');
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, '0');
  const s = String(seg % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

async function postMatch(path, body) {
  const res = await fetch(`${API_URL}/api/match/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok && j && !j.error) j.error = 'error';
  j.__status = res.status;
  return j;
}

/**
 * Match con alguien: videollamada aleatoria estilo Omegle.
 * Requiere perfil (edad/género) guardado antes de entrar. Denuncias a admin.
 * Cola y signaling por Redis -> SSE (match_*); media P2P por WebRTC.
 */
export default function MatchContent() {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey } = useAuth();
  const { enCualquierLlamada } = useCall();

  const [fase, setFase] = useState('idle');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerNombre, setPeerNombre] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [stats, setStats] = useState({ enLinea: 0, enCola: 0, matchesHoy: 0 });
  const [seg, setSeg] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState(null);
  const [filtrosAbierto, setFiltrosAbierto] = useState(false);
  const [sinCompat, setSinCompat] = useState(false);

  const [chips, setChips] = useState(() => new Set());
  const [genero, setGenero] = useState('any');
  const [edadMax, setEdadMax] = useState(99);
  const [verificados, setVerificados] = useState(false);

  const [perfil, setPerfil] = useState(null);
  const [perfilCargado, setPerfilCargado] = useState(false);
  const [regAbierto, setRegAbierto] = useState(false);
  const [reglasAbierto, setReglasAbierto] = useState(false);
  const [regEdad, setRegEdad] = useState('');
  const [regGenero, setRegGenero] = useState('no');
  const [regIntereses, setRegIntereses] = useState(() => new Set());
  const [regAcepto, setRegAcepto] = useState(false);
  const [regError, setRegError] = useState(null);
  const [regFalta, setRegFalta] = useState(null); // { edad: bool, reglas: bool }
  const [regGuardando, setRegGuardando] = useState(false);
  const [pendienteArranque, setPendienteArranque] = useState(false);

  const [repAbierto, setRepAbierto] = useState(false);
  const [repMotivo, setRepMotivo] = useState(0);
  const [repDetalle, setRepDetalle] = useState('');
  const [repEnviando, setRepEnviando] = useState(false);
  const [repError, setRepError] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');

  const pcRef = useRef(null);
  const localRef = useRef(null);
  const pendingRef = useRef([]);
  const matchRef = useRef(null);
  const iceRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const faseRef = useRef('idle');
  const chatBoxRef = useRef(null);
  const statsTimerRef = useRef(null);
  const perfilRef = useRef(null);

  faseRef.current = fase;
  localRef.current = localStream;
  perfilRef.current = perfil;

  // Borra la marca roja de un campo cuando el usuario lo corrige; el aviso
  // completo desaparece solo cuando NO falta nada.
  const limpiarFalta = (campo) => {
    const n = { edad: false, reglas: false, ...(regFalta || {}), [campo]: false };
    setRegFalta(n);
    if (!n.edad && !n.reglas) setRegError(null);
  };

  const motivos = t('match.motivos');
  const motivosLista = Array.isArray(motivos)
    ? motivos
    : (es
      ? ['Contenido sexual no consentido', 'Menores de edad', 'Acoso o amenazas', 'Spam o estafa', 'Otra razón']
      : ['Non-consensual sexual content', 'Minors', 'Harassment or threats', 'Spam or scam', 'Other reason']);

  const chipsDisponibles = t('match.chips');
  const chipsLista = Array.isArray(chipsDisponibles)
    ? chipsDisponibles
    : (es
      ? ['+18', 'Lesbiana', 'Gay', 'Sexo', 'Bisexual', 'BDSM', 'Fetiches', 'Cybersexo', 'Roleplay', 'Fotos/Vídeos', 'Juguetes']
      : ['+18', 'Lesbian', 'Gay', 'Sex', 'Bisexual', 'BDSM', 'Fetishes', 'Cybersex', 'Roleplay', 'Photos/Videos', 'Toys']);

  const filtrosBusca = {
    genero,
    edadMin: 18,
    edadMax,
    intereses: [...chips],
  };
  const nFiltros = chips.size + (genero !== 'any' ? 1 : 0) + (edadMax < 99 ? 1 : 0) + (verificados ? 1 : 0);

  const pushMsg = useCallback((m) => {
    setMensajes((prev) => [...prev.slice(-149), { at: Date.now(), ...m }]);
  }, []);

  const cargarStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/match/stats`, { cache: 'no-store' });
      const j = await res.json();
      if (j && typeof j.enLinea === 'number') {
        setStats({ enLinea: j.enLinea || 0, enCola: j.enCola || 0, matchesHoy: j.matchesHoy || 0 });
      }
    } catch { /* sin red */ }
  }, []);

  useEffect(() => { cargarStats(); }, [cargarStats]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/calls/ice`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j?.iceServers) && j.iceServers.length) iceRef.current = j.iceServers; })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!userKey) return undefined;
    let alive = true;
    fetch(`${API_URL}/api/match/perfil?userKey=${encodeURIComponent(userKey)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setPerfil(j?.perfil || null);
        setPerfilCargado(true);
      })
      .catch(() => { if (alive) setPerfilCargado(true); });
    return () => { alive = false; };
  }, [userKey]);

  const closePc = useCallback(() => {
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
    pendingRef.current = [];
  }, []);

  const pararLocal = useCallback(() => {
    localRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } });
    localRef.current = null;
    setLocalStream(null);
  }, []);

  const crearPc = useCallback(() => {
    closePc();
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    pc.onicecandidate = (e) => {
      const m = matchRef.current;
      if (e.candidate && m && userKey) {
        postMatch('signal', {
          userKey, matchId: m.matchId, paraKey: m.peerKey, kind: 'ice', candidate: e.candidate,
        }).catch(() => {});
      }
    };
    pc.ontrack = (e) => setRemoteStream(e.streams[0] || null);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        try { pc.restartIce?.(); } catch { /* noop */ }
      }
    };
    const local = localRef.current;
    if (local) local.getTracks().forEach((tr) => { try { pc.addTrack(tr, local); } catch { /* noop */ } });
    pcRef.current = pc;
    pendingRef.current = [];
    return pc;
  }, [closePc, userKey]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const cola = pendingRef.current.splice(0);
    for (const c of cola) {
      try { await pc.addIceCandidate(c); } catch { /* noop */ }
    }
  }, []);

  const ofertar = useCallback(async () => {
    const m = matchRef.current;
    if (!m) return;
    const pc = crearPc();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postMatch('signal', {
      userKey, matchId: m.matchId, paraKey: m.peerKey, kind: 'offer', sdp: offer.sdp,
    });
  }, [crearPc, userKey]);

  const arrancar = useCallback(async () => {
    if (!userKey) return;
    if (enCualquierLlamada) { setError(t('match.enLlamada')); return; }
    setError(null);
    if (!localRef.current) {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localRef.current = media;
        setLocalStream(media);
      } catch {
        try {
          const soloAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
          localRef.current = soloAudio;
          setLocalStream(soloAudio);
          setCamOn(false);
        } catch {
          setError(t('match.errorCam'));
          setFase('idle');
          return;
        }
      }
    }
    setMicOn(true);
    setSeg(0);
    setSinCompat(false);
    setFase('buscando');
    setPeerNombre('');
    try {
      const j = await postMatch('entrar', { userKey, filtros: filtrosBusca });
      if (j?.error === 'perfil_incompleto') {
        setPerfil(null);
        setRegAbierto(true);
        setPendienteArranque(true);
        setFase('idle');
        return;
      }
      setSinCompat(!!j?.sinCompat);
    } catch {
      setFase('idle');
      setError(es ? 'No se pudo conectar con el servidor.' : 'Could not reach the server.');
    }
  }, [userKey, enCualquierLlamada, t, es, filtrosBusca]);

  const comenzar = useCallback(() => {
    if (!userKey || !perfilCargado) return;
    if (!perfil) {
      setRegAbierto(true);
      setPendienteArranque(true);
      return;
    }
    arrancar();
  }, [userKey, perfilCargado, perfil, arrancar]);

  const guardarRegistro = useCallback(async () => {
    const edad = Number.parseInt(regEdad, 10);
    const edadOk = !Number.isNaN(edad) && edad >= 18 && edad <= 99;
    const falta = { edad: !edadOk, reglas: !regAcepto };
    if (falta.edad || falta.reglas) {
      setRegFalta(falta);
      const partes = [];
      if (falta.edad) partes.push(t('match.regFaltaEdad'));
      if (falta.reglas) partes.push(t('match.regFaltaAcepto'));
      setRegError(partes.join(' '));
      return;
    }
    setRegError(null);
    setRegFalta(null);
    setRegGuardando(true);
    try {
      const j = await postMatch('perfil', {
        userKey, edad, genero: regGenero, intereses: [...regIntereses],
      });
      if (j?.error) {
        setRegError(t('match.regError'));
        return;
      }
      setPerfil({ edad, genero: regGenero, intereses: [...regIntereses] });
      setRegAbierto(false);
      if (pendienteArranque) {
        setPendienteArranque(false);
        setTimeout(() => { arrancar(); }, 50);
      }
    } catch {
      setRegError(t('match.regError'));
    } finally {
      setRegGuardando(false);
    }
  }, [userKey, regEdad, regGenero, regIntereses, regAcepto, t, pendienteArranque, arrancar]);

  const detener = useCallback(async () => {
    const m = matchRef.current;
    matchRef.current = null;
    closePc();
    setRemoteStream(null);
    pararLocal();
    setFase('idle');
    setPeerNombre('');
    setMicOn(true);
    setCamOn(true);
    setSinCompat(false);
    if (userKey) postMatch('salir', { userKey, matchId: m?.matchId }).catch(() => {});
  }, [closePc, pararLocal, userKey]);

  const siguiente = useCallback(async () => {
    if (faseRef.current !== 'conectado' || !userKey) return;
    const m = matchRef.current;
    matchRef.current = null;
    closePc();
    setRemoteStream(null);
    setPeerNombre('');
    setSeg(0);
    setSinCompat(false);
    setFase('buscando');
    pushMsg({ de: 'sistema', texto: t('match.buscarOtra') });
    try {
      const j = await postMatch('siguiente', { userKey, matchId: m?.matchId, filtros: filtrosBusca });
      if (j?.error === 'perfil_incompleto') {
        setFase('idle');
        setRegAbierto(true);
        return;
      }
      setSinCompat(!!j?.sinCompat);
    } catch {
      setFase('fin');
    }
  }, [userKey, closePc, pushMsg, t, filtrosBusca]);

  const enviarReporte = useCallback(async () => {
    const m = matchRef.current;
    if (!m || !userKey || repEnviando) return;
    setRepError(null);
    setRepEnviando(true);
    try {
      const j = await postMatch('reporte', {
        userKey,
        matchId: m.matchId,
        denunciadoKey: m.peerKey,
        motivo: motivosLista[repMotivo] || 'Otra razon',
        detalle: repDetalle,
      });
      if (j?.error) {
        setRepError(t('match.reporteError'));
        return;
      }
      setRepAbierto(false);
      setRepDetalle('');
      pushMsg({ de: 'sistema', texto: t('match.reporteEnviado') });
    } catch {
      setRepError(t('match.reporteError'));
    } finally {
      setRepEnviando(false);
    }
  }, [userKey, repMotivo, repDetalle, repEnviando, motivosLista, pushMsg, t]);

  useEffect(() => {
    if (fase !== 'buscando') return undefined;
    const iv = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [fase]);

  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [mensajes]);

  useEffect(() => {
    if (!userKey) return undefined;
    const on = (e) => {
      const d = e?.detail || {};
      const tipo = String(d.type || '');
      if (!tipo.startsWith('match_')) return;
      const p = d.payload || {};

      if (tipo === 'match_found') {
        if (String(p.para) !== userKey) return;
        if (matchRef.current?.matchId === p.matchId) return;
        matchRef.current = {
          matchId: p.matchId,
          peerKey: p.peerKey,
          peerNombre: p.peerNombre || '',
        };
        setPeerNombre(p.peerNombre || '');
        setFase('conectado');
        setSinCompat(false);
        setError(null);
        pushMsg({
          de: 'sistema',
          texto: t('match.conectadoMsg').replace('{nombre}', p.peerNombre || (es ? 'alguien' : 'someone')),
        });
        if (p.ofertante) ofertar().catch(() => {});
        return;
      }

      if (tipo === 'match_end') {
        if (String(p.para) !== userKey) return;
        if (matchRef.current && p.matchId && p.matchId !== matchRef.current.matchId) return;
        matchRef.current = null;
        closePc();
        setRemoteStream(null);
        setPeerNombre('');
        if (faseRef.current === 'conectado') {
          setFase('fin');
          pushMsg({ de: 'sistema', texto: t('match.seFue') });
        }
        return;
      }

      if (tipo === 'match_signal') {
        if (String(p.para) !== userKey) return;
        if (!matchRef.current || p.matchId !== matchRef.current.matchId) return;
        (async () => {
          if (p.kind === 'offer' && p.sdp) {
            const pc = pcRef.current || crearPc();
            await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
            await flushIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await postMatch('signal', {
              userKey, matchId: p.matchId, paraKey: p.de, kind: 'answer', sdp: answer.sdp,
            });
          } else if (p.kind === 'answer' && p.sdp) {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription({ type: 'answer', sdp: p.sdp });
            await flushIce();
          } else if (p.kind === 'ice' && p.candidate) {
            if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(p.candidate);
            else pendingRef.current.push(p.candidate);
          }
        })().catch(() => {});
        return;
      }

      if (tipo === 'match_chat') {
        if (String(p.para) !== userKey) return;
        if (!matchRef.current || p.matchId !== matchRef.current.matchId) return;
        pushMsg({ de: 'par', nombre: p.nombre || '', texto: p.texto || '' });
      }
    };
    window.addEventListener('pikantepe:change', on);
    return () => window.removeEventListener('pikantepe:change', on);
  }, [userKey, pushMsg, t, es, ofertar, crearPc, flushIce, closePc]);

  useEffect(() => {
    const on = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (!tipo.startsWith('match_') && tipo !== 'comunidad_presencia') return;
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
      statsTimerRef.current = setTimeout(cargarStats, 900);
    };
    window.addEventListener('pikantepe:change', on);
    return () => {
      window.removeEventListener('pikantepe:change', on);
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    };
  }, [cargarStats]);

  useEffect(() => {
    const salirAlSalir = () => {
      const m = matchRef.current;
      if (!userKey) return;
      try {
        const body = JSON.stringify({ userKey, matchId: m?.matchId });
        fetch(`${API_URL}/api/match/salir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true,
        }).catch(() => {});
      } catch { /* noop */ }
    };
    window.addEventListener('pagehide', salirAlSalir);
    return () => {
      window.removeEventListener('pagehide', salirAlSalir);
      salirAlSalir();
      closePc();
      pararLocal();
    };
  }, [userKey, closePc, pararLocal]);

  const toggleMic = () => {
    const tr = localRef.current?.getAudioTracks()[0];
    if (!tr) return;
    tr.enabled = !tr.enabled;
    setMicOn(tr.enabled);
  };

  const toggleCam = () => {
    const tr = localRef.current?.getVideoTracks()[0];
    if (!tr) return;
    tr.enabled = !tr.enabled;
    setCamOn(tr.enabled);
  };

  const enviarChat = async (e) => {
    e.preventDefault();
    const m = matchRef.current;
    const tira = texto.trim();
    if (!tira || !m || !userKey) return;
    setTexto('');
    setEnviando(true);
    pushMsg({ de: 'yo', texto: tira });
    try {
      await postMatch('chat', { userKey, matchId: m.matchId, texto: tira });
    } catch { /* el SSE del par fallaria igual */ }
    setEnviando(false);
  };

  const alternarSet = (setter) => (c) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const estadoLabel = fase === 'buscando'
    ? t('match.buscando')
    : fase === 'conectado'
      ? t('match.conectado')
      : fase === 'fin'
        ? t('match.finTitulo')
        : t('match.enEspera');

  const cajaSub = fase === 'buscando'
    ? (sinCompat ? t('match.sinCompat') : t('match.buscandoSub'))
    : fase === 'conectado'
      ? t('match.sala')
      : fase === 'fin'
        ? t('match.finTexto')
        : t('match.inicioTexto');

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.centro}>
          <div className={styles.centroHead}>
            <span className={`${styles.estadoPunto} ${fase === 'buscando' ? styles.puntoPulso : ''} ${fase === 'conectado' ? styles.puntoOn : ''}`}></span>
            <span className={styles.estadoTexto}>{estadoLabel}</span>
            <button
              type="button"
              className={styles.filtrosBtn}
              onClick={() => setFiltrosAbierto(true)}
            >
              <ion-icon name="options-outline" suppressHydrationWarning></ion-icon>
              {t('match.filtrosTitulo')}
              {nFiltros > 0 && <span className={styles.filtrosCount}>{nFiltros}</span>}
            </button>
          </div>

          <div className={styles.videoGrid}>
            <div className={styles.tile}>
              <video
                className={styles.video}
                ref={(el) => {
                  if (el && remoteStream && el.srcObject !== remoteStream) el.srcObject = remoteStream;
                }}
                autoPlay
                playsInline
                muted
              />
              <audio
                ref={(el) => {
                  if (!el) return;
                  if (remoteStream && el.srcObject !== remoteStream) {
                    el.srcObject = remoteStream;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
              />
              {!remoteStream && (
                <div className={styles.tileVacio}>
                  {fase === 'buscando' ? t('match.buscando') : fase === 'fin' ? t('match.seFue') : t('match.sinPar')}
                </div>
              )}
              <span className={styles.tileChip}>
                <span className={`${styles.punto} ${remoteStream ? styles.puntoOn : ''}`}></span>
                {peerNombre || (fase === 'buscando' ? t('match.buscando') : t('match.par'))}
              </span>

              {/* Barra mini de estado encima del video (movil): sin caja ni stats. */}
              <div className={styles.miniStats}>
                {fase !== 'idle' && (
                  <span className={styles.miniPill} title={t('match.tiempoBusq')}>
                    <span className={`${styles.punto} ${fase === 'buscando' ? styles.puntoPulso : styles.puntoOn}`}></span>
                    {fmtReloj(seg)}
                  </span>
                )}
                <span className={styles.miniPill} title={t('match.enLinea')}>
                  <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                  {stats.enLinea}
                </span>
                <span className={styles.miniPill} title={t('match.matchesHoy')}>
                  <ion-icon name="flame-outline" suppressHydrationWarning></ion-icon>
                  {stats.matchesHoy}
                </span>
              </div>

              {/* Aviso de sin compatibilidad solo cuando aporta algo (movil). */}
              {fase === 'buscando' && sinCompat && (
                <div className={styles.miniHint}>{t('match.sinCompat')}</div>
              )}

              {/* Mi camara en esquina, tipo Google Meet / Teams. */}
              <div className={styles.pip}>
                <video
                  className={styles.video}
                  ref={(el) => {
                    if (el && localStream && el.srcObject !== localStream) el.srcObject = localStream;
                  }}
                  autoPlay
                  playsInline
                  muted
                />
                {!localStream && <div className={styles.tileVacio}>{t('match.esperaCam')}</div>}
                {localStream && !camOn && <div className={styles.tileOff}>{t('match.camOff')}</div>}
                <span className={`${styles.tileChip} ${styles.pipChip}`}>
                  <span className={`${styles.punto} ${localStream ? styles.puntoOn : ''}`}></span>
                  {t('match.tu')}
                </span>
              </div>

              {(fase === 'conectado' || fase === 'buscando') && (
                <button
                  type="button"
                  className={styles.shuffleFab}
                  onClick={fase === 'conectado' ? siguiente : detener}
                  title={fase === 'conectado' ? t('match.siguiente') : t('match.detener')}
                  aria-label={fase === 'conectado' ? t('match.siguiente') : t('match.detener')}
                >
                  <ion-icon name={fase === 'conectado' ? 'play-skip-forward-sharp' : 'stop-outline'} suppressHydrationWarning></ion-icon>
                </button>
              )}
            </div>
          </div>

          <div className={styles.cajaEstado}>
            <div className={styles.cajaTop}>
              <span className={`${styles.spinner} ${fase === 'buscando' ? '' : styles.spinnerOff}`}></span>
              <div>
                <div className={styles.cajaTitulo}>{estadoLabel}</div>
                <div className={styles.cajaSub}>{cajaSub}</div>
              </div>
            </div>
            <div className={styles.stats}>
              <div>
                <div className={styles.statLabel}>{t('match.tiempoBusq')}</div>
                <div className={styles.statValor}>{fmtReloj(seg)}</div>
              </div>
              <div>
                <div className={styles.statLabel}>{t('match.enLinea')}</div>
                <div className={styles.statValor}>{stats.enLinea.toLocaleString(es ? 'es-PE' : 'en-US')}</div>
              </div>
              <div>
                <div className={styles.statLabel}>{t('match.matchesHoy')}</div>
                <div className={styles.statValor}>{stats.matchesHoy.toLocaleString(es ? 'es-PE' : 'en-US')}</div>
              </div>
            </div>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.acciones}>
            {fase === 'idle' && (
              <button type="button" className={styles.btnPrincipal} onClick={comenzar} disabled={!userKey || !perfilCargado}>
                <ion-icon name="dice-outline" suppressHydrationWarning></ion-icon>
                <span>
                  <span className={styles.btnPrincipalTop}>{t('match.iniciar')}</span>
                  <span className={styles.btnPrincipalSub}>{perfil ? t('match.iniciarSub') : t('match.regTitulo')}</span>
                </span>
              </button>
            )}
            {fase === 'buscando' && (
              <button type="button" className={styles.btnDetener} onClick={detener}>
                <ion-icon name="stop-outline" suppressHydrationWarning></ion-icon>
                {t('match.detener')}
              </button>
            )}
            {(fase === 'conectado' || fase === 'fin') && (
              <>
                <div className={styles.ctrls}>
                  <button type="button" className={`${styles.ctrl} ${micOn ? '' : styles.ctrlOff}`} onClick={toggleMic} title={micOn ? t('match.mic') : t('match.micOff')} aria-label={micOn ? t('match.mic') : t('match.micOff')}>
                    <ion-icon name={micOn ? 'mic-outline' : 'mic-off-outline'} suppressHydrationWarning></ion-icon>
                  </button>
                  <button type="button" className={`${styles.ctrl} ${camOn ? '' : styles.ctrlOff}`} onClick={toggleCam} title={camOn ? t('match.cam') : t('match.camOff')} aria-label={camOn ? t('match.cam') : t('match.camOff')}>
                    <ion-icon name={camOn ? 'videocam-outline' : 'videocam-off-outline'} suppressHydrationWarning></ion-icon>
                  </button>
                  <button type="button" className={`${styles.ctrl} ${styles.ctrlRojo}`} onClick={detener} title={t('match.detener')} aria-label={t('match.detener')}>
                    <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
                <button type="button" className={styles.btnPrincipal} onClick={fase === 'fin' ? comenzar : siguiente}>
                  <ion-icon name="play-skip-forward-sharp" suppressHydrationWarning></ion-icon>
                  <span>
                    <span className={styles.btnPrincipalTop}>{fase === 'fin' ? t('match.continuar') : t('match.siguiente')}</span>
                    <span className={styles.btnPrincipalSub}>{fase === 'fin' ? t('match.continuarSub') : t('match.siguienteSub')}</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </section>

        <aside className={`${styles.side} ${styles.chat}`}>
          <div className={styles.chatHead}>
            <span className={styles.chatTitulo}>
              <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
              {t('match.chatTitulo')}
            </span>
            <button
              type="button"
              className={styles.flagBtn}
              onClick={() => {
                if (fase !== 'conectado') { setRepError(t('match.reporteRequiere')); return; }
                setRepError(null);
                setRepAbierto(true);
              }}
              title={t('match.reportar')}
              aria-label={t('match.reportar')}
            >
              <ion-icon name="flag-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <div className={styles.chatLog} ref={chatBoxRef}>
            {mensajes.length === 0 && (
              <p className={styles.chatVacio}>{t('match.chatVacio')}</p>
            )}
            {mensajes.map((m, i) => (
              <div key={`${m.at}-${i}`} className={`${styles.msg} ${m.de === 'yo' ? styles.msgYo : ''} ${m.de === 'sistema' ? styles.msgSistema : ''}`}>
                {m.de !== 'sistema' && (
                  <div className={styles.msgMeta}>
                    <span>{m.de === 'yo' ? t('match.tu') : (m.nombre || t('match.par'))}</span>
                  </div>
                )}
                <div className={styles.msgTexto}>{m.texto}</div>
              </div>
            ))}
          </div>

          <form className={styles.chatForm} onSubmit={enviarChat}>
            <input
              className={styles.chatInput}
              type="text"
              placeholder={t('match.escribir')}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={500}
              disabled={fase !== 'conectado'}
            />
            <button
              type="submit"
              className={styles.chatSend}
              disabled={fase !== 'conectado' || enviando || !texto.trim()}
              aria-label={t('match.enviar')}
            >
              <ion-icon name="send" suppressHydrationWarning></ion-icon>
            </button>
          </form>
        </aside>
      </div>

      {/* Franja de anuncios FUERA del layout (divs propios, sin pegarse
          a los bloques de contenido; con scroll si hace falta). */}
      <div className={styles.adsFila}>
        <div className={styles.adSlot728}>
          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
        </div>
        <div className={`${styles.adSoloEscritorio} ${styles.adSlot300}`}>
          <AdBanner
            adKey="3a837969e396afcbcfc39bb7494cfe37"
            width={300}
            height={250}
            src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
            marco
          />
        </div>
        <div className={`${styles.adSoloEscritorio} ${styles.adSlotSmart}`}>
          <AdSmartlink
            href={SMARTLINK_URL}
            title={es ? 'Contenido recomendado' : 'Recommended content'}
            text={es ? 'Descubre más aquí' : 'Discover more here'}
          />
        </div>
      </div>

      {regAbierto && alBody(
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('match.regTitulo')}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <span className={styles.modalIcono}>
                <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
              </span>
              <div>
                <h2 className={styles.modalTitulo}>{t('match.regTitulo')}</h2>
              </div>
            </div>

            <label className={`${styles.campo} ${regFalta?.edad ? styles.campoMal : ''}`}>
              <span className={styles.campoLabel}>{t('match.regEdad')}</span>
              <input
                className={styles.campoInput}
                type="number"
                min="18"
                max="99"
                inputMode="numeric"
                maxLength={2}
                placeholder="18"
                value={regEdad}
                onChange={(e) => {
                  // Maximo dos digitos: no se puede escribir 150.
                  setRegEdad(e.target.value.replace(/[^0-9]/g, '').slice(0, 2));
                  limpiarFalta('edad');
                }}
              />
            </label>
            {regFalta?.edad && <p className={styles.campoLinea}>{t('match.regFaltaEdad')}</p>}

            <div className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.regGenero')}</span>
              <div className={styles.genOpciones}>
                {[['mujer', t('match.mujer'), 'female-outline'], ['hombre', t('match.hombre'), 'male-outline'], ['otro', t('match.genOtro'), 'transgender-outline'], ['no', t('match.genNo'), 'ellipsis-horizontal']].map(([val, lab, icon]) => (
                  <button
                    key={val}
                    type="button"
                    className={`${styles.genOp} ${regGenero === val ? styles.genOpOn : ''}`}
                    onClick={() => setRegGenero(val)}
                  >
                    <ion-icon name={icon} suppressHydrationWarning></ion-icon>
                    {lab}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.regIntereses')}</span>
              <div className={styles.chips}>
                {chipsLista.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.chip} ${regIntereses.has(c) ? styles.chipOn : ''}`}
                    onClick={() => alternarSet(setRegIntereses)(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <label className={`${styles.checkFila} ${regAcepto ? styles.checkOn : ''} ${regFalta?.reglas ? styles.checkMal : ''}`}>
              <input
                type="checkbox"
                checked={regAcepto}
                onChange={(e) => { setRegAcepto(e.target.checked); limpiarFalta('reglas'); }}
              />
              <span className={styles.checkBox} aria-hidden="true">
                <ion-icon name="checkmark" suppressHydrationWarning></ion-icon>
              </span>
              <span className={styles.checkTexto}>
                {t('match.regAceptarPre')}
                <button
                  type="button"
                  className={styles.linkReglas}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReglasAbierto(true); }}
                >
                  {t('match.regAceptarLink')}
                </button>
                {t('match.regAceptarPost')}
              </span>
            </label>
            {regFalta?.reglas && <p className={styles.campoLinea}>{t('match.regFaltaAcepto')}</p>}

            {regError && <div className={`${styles.errorBox} ${styles.errorSoloDesk}`}>{regError}</div>}

            {/* En movil el aviso es un modal centrado (el inline no se ve). */}
            {regError && alBody(
              <div className={styles.errorModal} role="alertdialog" aria-modal="true" aria-label={t('match.regAlertaTitulo')}>
                <div className={styles.errorModalCaja}>
                  <span className={styles.errorModalIcono}>
                    <ion-icon name="warning-outline" suppressHydrationWarning></ion-icon>
                  </span>
                  <h3 className={styles.errorModalTitulo}>{t('match.regAlertaTitulo')}</h3>
                  <p className={styles.errorModalTexto}>{regError}</p>
                  <button type="button" className={styles.btnPrincipal} onClick={() => setRegError(null)}>
                    <span><span className={styles.btnPrincipalTop}>{t('match.regAlertaBtn')}</span></span>
                  </button>
                </div>
              </div>
            )}

            <div className={styles.modalAcciones}>
              <button type="button" className={styles.btnSecundario} onClick={() => { setRegAbierto(false); setPendienteArranque(false); }}>
                {t('filtros.cerrar')}
              </button>
              <button type="button" className={styles.btnPrincipal} onClick={guardarRegistro} disabled={regGuardando}>
                <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
                <span><span className={styles.btnPrincipalTop}>{t('match.regBtn')}</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {reglasAbierto && alBody(
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('match.reglasTitulo')}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <span className={styles.modalIcono}>
                <ion-icon name="shield-checkmark-outline" suppressHydrationWarning></ion-icon>
              </span>
              <div>
                <h2 className={styles.modalTitulo}>{t('match.reglasTitulo')}</h2>
              </div>
            </div>

            <div className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.regAvisoTitulo')}</span>
              <p className={styles.avisoTexto}>{t('match.regAviso')}</p>
            </div>

            <div className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.reglasBusq')}</span>
              <p className={styles.avisoTexto}>{t('match.regInteresesHint')}</p>
            </div>

            <div className={styles.modalAcciones}>
              <button type="button" className={styles.btnPrincipal} onClick={() => setReglasAbierto(false)}>
                <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
                <span><span className={styles.btnPrincipalTop}>{t('match.reglasBtn')}</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {repAbierto && alBody(
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('match.reportarTitulo')}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcono} ${styles.modalIconoRojo}`}>
                <ion-icon name="flag-outline" suppressHydrationWarning></ion-icon>
              </span>
              <div>
                <h2 className={styles.modalTitulo}>{t('match.reportarTitulo')}</h2>
                <p className={styles.modalTexto}>{t('match.reportarTexto')}</p>
              </div>
            </div>

            <label className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.motivo')}</span>
              <select
                className={styles.campoInput}
                value={repMotivo}
                onChange={(e) => setRepMotivo(Number(e.target.value))}
              >
                {motivosLista.map((mo, i) => (
                  <option key={mo} value={i}>{mo}</option>
                ))}
              </select>
            </label>

            <label className={styles.campo}>
              <span className={styles.campoLabel}>{t('match.detalle')}</span>
              <textarea
                className={`${styles.campoInput} ${styles.campoTextarea}`}
                rows={3}
                maxLength={1000}
                value={repDetalle}
                onChange={(e) => setRepDetalle(e.target.value)}
              />
            </label>

            {repError && <div className={styles.errorBox}>{repError}</div>}

            <div className={styles.modalAcciones}>
              <button type="button" className={styles.btnSecundario} onClick={() => setRepAbierto(false)}>
                {t('filtros.cerrar')}
              </button>
              <button type="button" className={styles.btnPrincipal} onClick={enviarReporte} disabled={repEnviando}>
                <ion-icon name="flag" suppressHydrationWarning></ion-icon>
                <span><span className={styles.btnPrincipalTop}>{t('match.enviarReporte')}</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {filtrosAbierto && alBody(
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('match.filtrosTitulo')}>
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <span className={styles.modalIcono}>
                <ion-icon name="options-outline" suppressHydrationWarning></ion-icon>
              </span>
              <div>
                <h2 className={styles.modalTitulo}>{t('match.filtrosTitulo')}</h2>
                <p className={styles.modalTexto}>{t('match.buscandoSub')}</p>
              </div>
            </div>

            <div className={styles.grupo}>
              <span className={styles.grupoLabel}>{t('match.intereses')}</span>
              <div className={styles.chips}>
                {chipsLista.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.chip} ${chips.has(c) ? styles.chipOn : ''}`}
                    onClick={() => alternarSet(setChips)(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.grupo}>
              <span className={styles.grupoLabel}>{t('match.genero')}</span>
              {[['mujer', t('match.mujer'), 'female-outline'], ['hombre', t('match.hombre'), 'male-outline'], ['any', t('match.cualquierGenero'), 'people-outline']].map(([val, lab, icon]) => (
                <button
                  key={val}
                  type="button"
                  className={`${styles.radioFila} ${genero === val ? styles.radioOn : ''}`}
                  onClick={() => setGenero(val)}
                >
                  <span className={`${styles.radio} ${genero === val ? styles.radioMark : ''}`}></span>
                  <ion-icon name={icon} className={styles.radioIcon} suppressHydrationWarning></ion-icon>
                  <span>{lab}</span>
                </button>
              ))}
            </div>

            <div className={styles.grupo}>
              <span className={styles.grupoLabel}>{t('match.edad')}</span>
              <input
                type="range"
                min="18"
                max="99"
                value={edadMax}
                className={styles.rango}
                onChange={(e) => setEdadMax(Number(e.target.value))}
                aria-label={t('match.edad')}
              />
              <div className={styles.rangoExtremos}>
                <span>18</span>
                <span>{edadMax >= 99 ? '99+' : edadMax}</span>
              </div>
            </div>

            <button
              type="button"
              className={styles.toggleFila}
              onClick={() => setVerificados((v) => !v)}
              aria-pressed={verificados}
            >
              <span>{t('match.verificados')}</span>
              <span className={`${styles.toggle} ${verificados ? styles.toggleOn : ''}`}>
                <span className={styles.toggleKnob}></span>
              </span>
            </button>

            {perfil && (
              <div className={styles.miPerfil}>
                <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
                <span>
                  {perfil.edad}{es ? ' anos' : ' y.o.'} · {perfil.genero === 'mujer' ? t('match.mujer') : perfil.genero === 'hombre' ? t('match.hombre') : perfil.genero === 'otro' ? t('match.genOtro') : t('match.genNo')}
                </span>
                <button type="button" className={styles.editarPerfil} onClick={() => { setFiltrosAbierto(false); setRegAbierto(true); }}>
                  {es ? 'Editar' : 'Edit'}
                </button>
              </div>
            )}

            <div className={styles.modalAcciones}>
              <button type="button" className={styles.btnPrincipal} onClick={() => setFiltrosAbierto(false)}>
                <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
                <span><span className={styles.btnPrincipalTop}>{es ? 'Aplicar' : 'Apply'}</span></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
