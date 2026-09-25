'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './chatFlotante.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { comunidadMedia, apiComunidad } from '@/_Extras/Comunidad/api.js';
import { abrirCanal } from '@/_Extras/Canales/canal.js';
import { presenciaEstado } from '@/_Extras/Fecha/fecha.js';
import { fmtNum } from '@/_Extras/Datos/num.js';
import { useCall } from '@/_Extras/Llamadas/CallProvider.js';
import Premium from '@/_Pages/main/Chat/componentes/premium';
import Restringido from '@/_Pages/main/Chat/componentes/restringido';
import Reproductor from '@/_Pages/main/Videos/componentes/reproductor';
import AudioMsg from '@/_Pages/main/Chat/componentes/audioMsg';

const EMOJIS = ['👍', '🔥', '😂', '😮', '😢', '❤️'];

// Extension por mimetype: los archivos arrastrados a veces vienen sin nombre
// y el backend necesita la extension para guardarlos correctamente.
const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif',
  'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'video/x-matroska': '.mkv', 'video/mp2t': '.ts', 'video/x-msvideo': '.avi',
  'audio/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
};

/** media del mensaje: string (1 archivo) o JSON array (album varios). */
function parseMedia(raw) {
  if (!raw) return [];
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [raw];
    } catch { return [raw]; }
  }
  return [raw];
}

/** Carpeta/extension del archivo -> tipo de medio (foto | video | audio). */
function kindDeArchivo(p) {
  if (/\/audio\//.test(p) || /\.(mp3|wav|ogg|m4a|aac)$/i.test(p)) return 'audio';
  if (/\.(mp4|mov|webm|mkv|avi|ts)$/i.test(p) || /\/video\//.test(p)) return 'video';
  return 'foto';
}

/** Asegura que el archivo tenga nombre y extension antes de enviarlo. */
function normalizarArchivo(f) {
  if (!f) return null;
  const mime = String(f.type || '').toLowerCase();
  const name = String(f.name || '').trim();
  const tieneExt = /\.[a-z0-9]{2,6}$/i.test(name);
  const esAceptado = mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')
    || /\.(png|jpe?g|gif|webp|avif|heic|mp4|mov|webm|mkv|avi|mp3|wav|ogg|m4a|aac)$/i.test(name);
  if (!esAceptado) return null;
  if (name && tieneExt) return f;
  const ext = MIME_EXT[mime] || '';
  if (!ext && !name) return null;
  const base = name.replace(/\.[a-z0-9]*$/i, '') || `archivo-${Date.now()}`;
  return new File([f], `${base}${ext}`, { type: f.type || '' });
}

// Los mensajes solo se pueden editar/eliminar dentro de estas horas.
const EDITAR_HORAS = 24;
const esEditableHora = (createdAt) => !createdAt || (Date.now() - new Date(createdAt).getTime()) < EDITAR_HORAS * 3600 * 1000;
const EMOJI_CATEGORIES = [
  { name: 'Caritas', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'] },
  { name: 'Gestos', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '💪', '👀', '👁️', '👅', '👄', '💋', '🧠', '🫦', '🫶', '🤌', '🤏'] },
  { name: 'Corazones', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '🫀'] },
  { name: 'Picante', emojis: ['🔥', '💦', '🍑', '🍆', '🍌', '🍒', '😈', '👿', '💀', '🌶️', '🍯', '🥵', '😏', '😜', '🤤', '👅', '💣', '⛓️', '🔗', '💯'] },
  { name: 'Animales', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙', '🦑', '🦐', '🦀', '🐬', '🐳', '🐟', '🐠', '🦈', '🐊', '🐆', '🐅', '🐘', '🦍', '🐎', '🦌', '🐕', '🐩'] },
  { name: 'Comida', emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🥒', '🌶️', '🌽', '🥕', '🧄', '🧅', '🍞', '🥐', '🥖', '🧀', '🥚', '🍳', '🥓', '🍔', '🍟', '🍕', '🌭', '🌮', '🌯', '🍜', '🍝', '🍣', '🍤', '🍦', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '🍭'] },
  { name: 'Objetos', emojis: ['🎉', '🎊', '🎁', '🎈', '🎀', '💎', '👑', '💍', '🕯️', '🔮', '🪄', '💄', '💅', '👜', '👠', '👙', '🩲', '🩱', '🎧', '🎵', '🎶', '📱', '💻', '📸', '🎬', '🍿', '🎮', '🕹️', '💸', '💰', '🪙', '🚬', '🍷', '🍸', '🍺', '🥂', '🍾', '💊'] },
];
const STICKER_LIST = [
  '👍', '❤️', '😂', '🔥', '🥰', '😮', '😢', '😡', '🎉', '💯', '🙌', '👀',
  '😎', '🤤', '🍑', '🍆', '😍', '😘', '😜', '🤪', '😏', '🙈', '🙉', '🙊',
  '👏', '🤝', '🙏', '💪', '🫶', '✨', '⭐', '🌟', '💥', '💫', '🌈', '☀️',
  '🌙', '⚡', '❄️', '🍾', '🥂', '🍷', '🎁', '🎈', '🎊', '👑', '💎', '💰',
];
const GIF_LIST = [
  '🎬', '🎥', '📽️', '🍿', '🎞️', '🎭', '🎪', '🎨', '🕺', '💃', '🩰', '🎤',
  '🎧', '🎵', '🎶', '🥳', '🎉', '🎊', '💥', '🔥', '✨', '⚡', '💫', '🌪️',
  '🌊', '💦', '🚀', '🛸', '👽', '🤖', '👾', '🎮',
];
const COLORES = ['#0b0b0e', '#18191A', '#0d1b2a', '#1a2e05', '#2b0a12', '#241645', '#003049', '#2d1b05', '#3b0764', '#111827', '#450a0a', '#052e16'];
const TEMA_EMOJIS = [
  '❤️', '🔥', '😎', '🌙', '💜', '🌸', '⭐', '🍑', '🍆', '😏', '🥰', '✨',
  '😂', '😈', '🌹', '🦋', '🎧', '🎮', '🍷', '🚀', '⚡', '💎', '🌈', '🐺',
  '🌊', '🍀', '👑', '💋', '🖤', '🧿', '🎯', '☕',
];
const PICKER_TABS = [
  { id: 'emoji', label: 'Emoji', icon: 'happy-outline' },
  { id: 'sticker', label: 'Stickers', icon: 'sparkles-outline' },
  { id: 'gif', label: 'GIF', icon: 'images-outline' },
];

function vistoTexto(dateStr, es) {
  if (!dateStr) return es ? 'Visto' : 'Seen';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return es ? 'Visto' : 'Seen';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return es ? 'Visto ahora' : 'Seen now';
  if (min < 60) return es ? `Visto hace ${min} min` : `Seen ${min} min ago`;
  const hh = d.toLocaleTimeString(es ? 'es-PE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) {
    return es ? `Visto a las ${hh}` : `Seen at ${hh}`;
  }
  return es
    ? `Visto ${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`
    : `Seen ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

function hora(dateStr, es) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const hoy = new Date();
  const hh = d.toLocaleTimeString(es ? 'es-PE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return hh;
  return `${d.toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'short' })} ${hh}`;
}

/**
 * Ventana flotante de chat. Sirve para grupos (tipo="grupo") y para
 * mensajes directos con un amigo (tipo="dm").
 */
export default function ChatFlotante({ tipo = 'grupo', chat, userKey, onClose, onMinimize = null, embedded = false, inline = false, onBack = null, nuevo = false, noLeidos = 0, activo = true, onActivar = null, onTema = null, onVisto = null }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { iniciar: iniciarLlamada, iniciarGrupo, unirseGrupo, sala: llamadaSala, enCualquierLlamada, avisar } = useCall();

  const grupoId = tipo === 'grupo' ? chat?.id : null;
  const otroKey = tipo === 'dm' ? chat?.user_key : null;
  const titulo = tipo === 'grupo' ? chat?.nombre : chat?.usuario;
  const avatar = tipo === 'grupo' ? chat?.avatar : chat?.avatar;

  const [mensajes, setMensajes] = useState([]);
  const [borrador, setBorrador] = useState('');
  const [respondiendo, setRespondiendo] = useState(null);
  const [reactMenu, setReactMenu] = useState(null);
  const [reactPos, setReactPos] = useState({ top: 0 });
  const [menuMsg, setMenuMsg] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 8 });
  const [editando, setEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState('emoji'); // 'emoji' | 'sticker' | 'gif'
  const [emojiCats, setEmojiCats] = useState(1);
  const [stickerCount, setStickerCount] = useState(8);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [restringidoOpen, setRestringidoOpen] = useState(false);
  const [limiteMb, setLimiteMb] = useState(200);
  const [subiendo, setSubiendo] = useState(null);
  const [fullMsgId, setFullMsgId] = useState(null);
  // (el expandir del chat ahora navega a /chat)
  const [imgFull, setImgFull] = useState(null);

  const [ajustesOpen, setAjustesOpen] = useState(false);
  const [temas, setTemas] = useState([]);
  const [tema, setTema] = useState({ gradient: '', color: '', emoji: '' });
  const [temaBorrador, setTemaBorrador] = useState({ gradient: '', color: '', emoji: '' });
  const [miApodo, setMiApodo] = useState('');
  const [suApodo, setSuApodo] = useState('');
  const [miDraft, setMiDraft] = useState('');
  const [suDraft, setSuDraft] = useState('');
  const [canalSlug, setCanalSlug] = useState('');
  const [proxOpen, setProxOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [docFocused, setDocFocused] = useState(true);
  const [headMenuOpen, setHeadMenuOpen] = useState(false);
  const [headMenuPos, setHeadMenuPos] = useState({ top: 0, right: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const headBtnRef = useRef(null);
  const headMenuRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recPaused, setRecPaused] = useState(false);
  const [recSeg, setRecSeg] = useState(0);
  const [salaActiva, setSalaActiva] = useState(null);
  // No se puede iniciar otra llamada si ya estoy en una, o si el grupo ya
  // tiene una en curso (la existente debe unirse, no duplicarse).
  const llamadaEnCurso = enCualquierLlamada || (tipo === 'grupo' && !!salaActiva);
  const bodyRef = useRef(null);
  const winRef = useRef(null);
  const inputRef = useRef(null);
  const onVistoRef = useRef(null);
  onVistoRef.current = onVisto;
  const videoRefs = useRef({});
  const lastLen = useRef(0);
  const inicializadoRef = useRef(false);
  const prependRef = useRef(null);
  const atBottomRef = useRef(true);
  const [hasMore, setHasMore] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const recTimerRef = useRef(null);
  // Arrastrar y soltar archivos sobre la ventana del chat.
  const [dragOver, setDragOver] = useState(false);
  // Visor de album: { items: [], idx, cap, autor } — recorrer el grupo completo.
  const [albumVis, setAlbumVis] = useState(null);
  // Avatares que fallaron al cargar (URL externa caida): se muestra la inicial.
  const [avataresMal, setAvataresMal] = useState(() => new Set());
  // Archivos en cola: se ven sobre el input hasta que se envíen (Enter o botón).
  const [pendientes, setPendientes] = useState([]);
  // Si hay varios y no caben, se ocultan tras un "+N" (clic para desplegar).
  const [pendExpandido, setPendExpandido] = useState(false);

  // Al responder un mensaje, deja el input listo para escribir de frente.
  useEffect(() => {
    if (respondiendo) inputRef.current?.focus();
  }, [respondiendo]);

  // Visor de album: flechas del teclado y Escape.
  useEffect(() => {
    if (!albumVis) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setAlbumVis(null);
      if (e.key === 'ArrowRight') {
        setAlbumVis((a) => (a ? { ...a, idx: (a.idx + 1) % a.items.length } : a));
      }
      if (e.key === 'ArrowLeft') {
        setAlbumVis((a) => (a ? { ...a, idx: (a.idx - 1 + a.items.length) % a.items.length } : a));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [albumVis]);

  const cargar = useCallback(async () => {
    if (!userKey) return;
    let r = null;
    if (tipo === 'grupo') {
      if (!grupoId) return;
      r = await apiComunidad.mensajes(grupoId, userKey, { limit: 50 });
    } else {
      if (!otroKey) return;
      r = await apiComunidad.dmMensajes(otroKey, userKey, null, 50);
      if (r && r.miApodo !== undefined) setMiApodo(r.miApodo || '');
      if (r && r.suApodo !== undefined) setSuApodo(r.suApodo || '');
      if (r && r.canal_slug !== undefined) setCanalSlug(r.canal_slug || '');
      if (r && r.tema) setTema({ gradient: r.tema.gradient || '', color: r.tema.color || '', emoji: r.tema.emoji || '' });
    }
    if (!Array.isArray(r?.data)) return;
    const data = r.data;
    if (!inicializadoRef.current) {
      inicializadoRef.current = true;
      setMensajes(data);
      setHasMore(!!r.hasMore);
      return;
    }
    // Refresco (poll/evento): fusiona sin perder los mensajes antiguos ya cargados.
    setMensajes((prev) => {
      const map = new Map(prev.map((m) => [String(m.id), m]));
      let cambio = false;
      for (const m of data) {
        const k = String(m.id);
        const old = map.get(k);
        if (!old) {
          cambio = true;
        } else if (
          // Tambien detecta cambios en mensajes EXISTENTES (reacciones,
          // ediciones, borrados) — antes solo contaban los ids nuevos y el
          // refresco se tiraba: las reacciones nunca se actualizaban.
          old.texto !== m.texto ||
          old.editado !== m.editado ||
          old.eliminado !== m.eliminado ||
          JSON.stringify(old.reacciones || []) !== JSON.stringify(m.reacciones || [])
        ) {
          cambio = true;
        }
        map.set(k, m);
      }
      if (!cambio) return prev;
      return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });
  }, [tipo, grupoId, otroKey, userKey]);

  // Sala de llamada grupal activa: mostrar aviso para unirse (no si ya estoy en ella).
  // En vivo por Redis -> SSE (call_grupo_start/join/leave), sin sondeo.
  useEffect(() => {
    if (tipo !== 'grupo' || !grupoId || !activo) { setSalaActiva(null); return undefined; }
    let alive = true;
    const check = async () => {
      const r = await apiComunidad.llamadaGrupoActiva(grupoId);
      if (alive) setSalaActiva(r && r.sala ? r.sala : null);
    };
    check();
    const onChange = (e) => {
      const d = e?.detail || {};
      const t = String(d.type || '');
      if (!t.startsWith('call_grupo_')) return;
      const p = d.payload || {};
      if (String(p.conv) !== String(grupoId)) return;
      if (t === 'call_grupo_start') {
        if (Array.isArray(p.miembros) && !p.miembros.map(String).includes(String(userKey))) return;
        setSalaActiva({
          call_id: p.callId, comunidad_id: p.conv,
          tipo: p.tipo === 'video' ? 'video' : 'audio',
        });
      } else if (t === 'call_grupo_end') {
        // La sala se cerro: quita el banner al instante.
        setSalaActiva((prev) => (prev && String(prev.call_id) === String(p.callId) ? null : prev));
      } else {
        // join/signal no cambian la sala; leave puede cerrarla -> reconfirmar.
        check();
      }
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => { alive = false; window.removeEventListener('pikantepe:change', onChange); };
  }, [tipo, grupoId, activo]);

  // Carga progresiva de mensajes antiguos (scroll hacia arriba).
  const cargarAntiguos = useCallback(async () => {
    if (!userKey || !hasMore || cargandoMas) return;
    if (mensajes.length === 0) return;
    setCargandoMas(true);
    const before = mensajes[0].id;
    let r = null;
    if (tipo === 'grupo') {
      if (!grupoId) { setCargandoMas(false); return; }
      r = await apiComunidad.mensajes(grupoId, userKey, { before, limit: 50 });
    } else {
      if (!otroKey) { setCargandoMas(false); return; }
      r = await apiComunidad.dmMensajes(otroKey, userKey, before, 50);
    }
    if (Array.isArray(r?.data) && r.data.length) {
      const el = bodyRef.current;
      prependRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
      setMensajes((prev) => {
        const ids = new Set(prev.map((m) => String(m.id)));
        const older = r.data.filter((m) => !ids.has(String(m.id)));
        if (!older.length) { prependRef.current = null; return prev; }
        return [...older, ...prev];
      });
      setHasMore(!!r.hasMore);
    } else {
      setHasMore(false);
    }
    setCargandoMas(false);
  }, [userKey, hasMore, cargandoMas, mensajes, tipo, grupoId, otroKey]);

  function irAlFinal() {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  // Estado REAL del otro en DM: desde la BD (edad del backend) + SSE, en vez
  // del texto fijo "en línea" que mentia aunque estuviera desconectado.
  const [otroEdad, setOtroEdad] = useState(null);
  useEffect(() => {
    if (tipo !== 'dm' || !otroKey) { setOtroEdad(null); return undefined; }
    let alive = true;
    const cargarPres = () => apiComunidad.presencia()
      .then((r) => {
        if (!alive || !Array.isArray(r?.data)) return;
        const row = r.data.find((p) => String(p.user_key) === String(otroKey));
        setOtroEdad(row ? row.edad : null);
      })
      .catch(() => {});
    cargarPres();
    const iv = setInterval(cargarPres, 60000);
    const onChange = (e) => {
      if (String(e?.detail?.type || '') === 'comunidad_presencia') cargarPres();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener('pikantepe:change', onChange);
    };
  }, [tipo, otroKey]);

  // Al cambiar de conversacion: estado limpio y abierto en el ULTIMO mensaje
  // (aunque la instancia no se desmonte por alguna otra via).
  useEffect(() => {
    inicializadoRef.current = false;
    lastLen.current = 0;
    atBottomRef.current = true;
  }, [tipo, grupoId, otroKey]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // Solo se marca "visto" si la ventana/pestaña está enfocada.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const upd = () => setDocFocused(document.visibilityState === 'visible' && document.hasFocus());
    upd();
    window.addEventListener('focus', upd);
    window.addEventListener('blur', upd);
    document.addEventListener('visibilitychange', upd);
    return () => {
      window.removeEventListener('focus', upd);
      window.removeEventListener('blur', upd);
      document.removeEventListener('visibilitychange', upd);
    };
  }, []);

  // Avisa al padre del tema activo (para pintar toda la interfaz en /chat).
  useEffect(() => {
    if (onTema) onTema({ gradient: tema.gradient || '', color: tema.color || '', emoji: tema.emoji || '' });
  }, [onTema, tema.gradient, tema.color, tema.emoji]);

  // Al abrir/activar el chat, enfoca el input y baja al ULTIMO mensaje.
  useEffect(() => {
    if (!activo) return undefined;
    const t = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
    return () => clearTimeout(t);
  }, [activo]);

  // Solo marca "visto" el chat ACTIVO (en el que el usuario esta interactuando).
  // Con varios modales abiertos, los demas no deben marcarse vistos.
  useEffect(() => {
    // Solo si el chat está activo, el input enfocado y la pestaña activa.
    if (!activo || !inputFocused || !docFocused || !userKey) return;
    if (tipo === 'grupo' && grupoId) apiComunidad.marcarChatLeido(grupoId, userKey);
    if (tipo === 'dm' && otroKey) apiComunidad.dmLeido(otroKey, userKey);
    if (onVistoRef.current) onVistoRef.current();
  }, [activo, inputFocused, docFocused, userKey, tipo, grupoId, otroKey, mensajes.length]);

  useEffect(() => {
    // Respaldo lento: la vía viva es el SSE (pikantepe:change).
    // Antes eran 6 s y recargaba 50 mensajes por ventana abierta.
    const iv = setInterval(cargar, 60000);
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (t === 'comunidad_mensaje' || t === 'comunidad_reaccion' || t === 'comunidad_dm') cargar();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => { clearInterval(iv); window.removeEventListener('pikantepe:change', onChange); };
  }, [cargar]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    // Si se cargaron mensajes antiguos, mantiene la posición (no salta).
    if (prependRef.current) {
      const { height, top } = prependRef.current;
      prependRef.current = null;
      el.scrollTop = el.scrollHeight - height + top;
      lastLen.current = mensajes.length;
      return undefined;
    }

    const bajar = () => {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
    };

    // Apertura del chat o mensajes nuevos estando abajo: al ULTIMO mensaje.
    if (atBottomRef.current) bajar();
    lastLen.current = mensajes.length;

    // Mientras estés "abajo", re-ancla cuando el contenido crezca:
    // las fotos/videos/albums cargan tarde y ensanchan el ultimo mensaje.
    // (Crecer no dispara scroll, así que atBottomRef sigue en true hasta que
    //  el usuario suba a leer historia: en ese caso ya no lo molestamos.)
    const alCrecer = () => {
      if (atBottomRef.current) bajar();
    };
    el.addEventListener('load', alCrecer, true); // <img> que termina de cargar
    const ro = new ResizeObserver(alCrecer);      // la ventana cambia de medida
    ro.observe(el);
    const timers = [150, 400, 900, 1600].map((ms) => setTimeout(alCrecer, ms));

    return () => {
      el.removeEventListener('load', alCrecer, true);
      ro.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [mensajes]);

  // Carga progresiva de emojis (por categorías) para no laggear al abrir.
  useEffect(() => {
    if (!pickerOpen || pickerTab !== 'emoji') { setEmojiCats(1); return undefined; }
    setEmojiCats(1);
    const iv = setInterval(() => {
      setEmojiCats((c) => {
        if (c >= EMOJI_CATEGORIES.length) { clearInterval(iv); return c; }
        return c + 1;
      });
    }, 60);
    return () => clearInterval(iv);
  }, [pickerOpen, pickerTab]);

  // Carga progresiva de stickers / gifs.
  useEffect(() => {
    if (!pickerOpen || pickerTab === 'emoji') { setStickerCount(8); return undefined; }
    const total = pickerTab === 'gif' ? GIF_LIST.length : STICKER_LIST.length;
    setStickerCount(8);
    const iv = setInterval(() => {
      setStickerCount((n) => {
        if (n >= total) { clearInterval(iv); return n; }
        return n + 8;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [pickerOpen, pickerTab]);

  // Límite de subida de la cuenta (para el modal de restringido).
  useEffect(() => {
    if (!userKey) return;
    apiComunidad.miLimite(userKey)
      .then((r) => { if (r && !r.error) setLimiteMb(r.mb); })
      .catch(() => {});
  }, [userKey]);

  /** Envía un mensaje con N archivos (álbum) o solo texto — UNA sola petición. */
  async function enviarPayload({ texto = '', tipoMsg = null, file = null, files = null }) {
    if (sending) return false;
    const lista = files && files.length ? files : (file ? [file] : []);
    if (!texto && lista.length === 0) return false;
    // Excede el límite de la cuenta -> modal de restringido (no se envía).
    if (lista.length && limiteMb > 0 && lista.some((f) => f.size > limiteMb * 1024 * 1024)) {
      setRestringidoOpen(true);
      return false;
    }
    setSending(true); setMsg('');
    const tempId = lista.length ? `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : null;
    if (lista.length) {
      setSubiendo({
        id: tempId,
        nombre: lista.length > 1
          ? `${lista.length} ${es ? 'archivos' : 'files'}`
          : (lista[0].name || (es ? 'archivo' : 'file')),
        pct: 0,
      });
    }
    try {
      const fd = new FormData();
      fd.append('userKey', userKey);
      if (texto) fd.append('texto', texto);
      if (tipoMsg) fd.append('tipo', tipoMsg);
      if (respondiendo) fd.append('reply_to', String(respondiendo.id));
      // Todos los archivos van JUNTOS en el mismo multipart (album).
      for (const f of lista) fd.append('media', f);

      let r;
      if (lista.length) {
        const onProg = (pct) => setSubiendo((s) => (s && s.id === tempId ? { ...s, pct } : s));
        r = tipo === 'grupo'
          ? await apiComunidad.enviarMensajeXHR(grupoId, fd, onProg)
          : await apiComunidad.dmEnviarXHR(otroKey, fd, onProg);
      } else {
        r = tipo === 'grupo'
          ? await apiComunidad.enviarMensaje(grupoId, fd)
          : await apiComunidad.dmEnviarFd(otroKey, fd);
      }

      // Si no se completó, no se envía.
      if (!r || r.error || !r.mensaje) {
        setMsg(r?.error || (es ? 'No se pudo enviar el archivo.' : 'Could not send the file.'));
        return false;
      }
      const nuevo = { ...r.mensaje, reacciones: [] };
      if (respondiendo) { nuevo.reply_usuario = respondiendo.usuario; nuevo.reply_texto = respondiendo.texto || ''; }
      setMensajes((cur) => [...cur, nuevo]);
      setRespondiendo(null);
      // Mi mensaje: baja al final aunque estuviera leyendo mensajes viejos.
      atBottomRef.current = true;
      setAtBottom(true);
      requestAnimationFrame(() => irAlFinal());
      return true;
    } finally {
      setSending(false);
      setSubiendo(null);
    }
  }

  async function enviar() {
    const texto = borrador.trim();
    const lista = pendientes.map((p) => p.file);
    if (!texto && lista.length === 0) return;
    // Texto + todos los archivos en UNA sola peticion (album + caption atomicos).
    const ok = await enviarPayload({ texto, files: lista });
    if (ok) {
      setBorrador('');
      pendientes.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
      setPendientes([]);
      setPendExpandido(false);
      setPickerOpen(false);
    }
  }

  async function enviarLike() {
    await enviarPayload({ texto: tema.emoji || '👍', tipoMsg: 'sticker' });
    setPickerOpen(false);
  }

  function elegirPicker(valor) {
    if (pickerTab === 'emoji') {
      setBorrador((b) => b + valor);
    } else {
      enviarPayload({ texto: valor, tipoMsg: pickerTab === 'gif' ? 'gif' : 'sticker' });
    }
  }

  /** Pone archivos en cola (vista previa sobre el input) hasta enviarlos. Sin límite de cantidad. */
  function stageArchivos(files) {
    if (!files.length) return;
    const listos = [];
    for (const f of files) {
      if (limiteMb > 0 && f.size > limiteMb * 1024 * 1024) { setRestringidoOpen(true); return; }
      const nf = normalizarArchivo(f);
      if (nf) listos.push(nf);
    }
    if (!listos.length) { setMsg(es ? 'Archivo no permitido: usa foto, video o audio.' : 'Not allowed: use photo, video or audio.'); return; }
    const nuevos = listos.map((f) => ({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      // Foto y video llevan preview real (imagen o primer frame del video).
      url: (f.type.startsWith('image/') || f.type.startsWith('video/')) ? URL.createObjectURL(f) : '',
    }));
    setPendientes((prev) => [...prev, ...nuevos]);
    if (pendientes.length + nuevos.length > 3) setPendExpandido(false);
  }

  function quitarPendiente(p) {
    if (p.url) URL.revokeObjectURL(p.url);
    setPendientes((prev) => {
      const cur = prev.filter((x) => x.id !== p.id);
      if (cur.length <= 3) setPendExpandido(false);
      return cur;
    });
  }

  function onArchivo(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    stageArchivos(files);
  }

  /* ---- Arrastrar y soltar: mismo camino que los botones de subir ---- */
  function onDragOverChat(e) {
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }

  function onDragLeaveChat(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  }

  function onDropChat(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const arr = Array.from(e.dataTransfer?.files || []);
    if (!arr.length) {
      setMsg(es ? 'Arrastra una foto, video o audio.' : 'Drag a photo, video or audio.');
      return;
    }
    stageArchivos(arr);
  }

  function fmtSeg(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  async function startRecording() {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMsg(es ? 'Tu navegador no permite grabar audio.' : 'Your browser cannot record audio.');
      return;
    }
    setPickerOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimerRef.current);
        const enviar = !!recRef.current?.enviar;
        recRef.current = null;
        setRecording(false);
        if (!enviar) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 800) return;
        const f = new File([blob], `voz-${Date.now()}.webm`, { type: 'audio/webm' });
        await enviarPayload({ file: f });
      };
      rec.start();
      recRef.current = { rec, enviar: true };
      setRecording(true);
      setRecPaused(false);
      setRecSeg(0);
      // Máximo 5 minutos: al llegar a 5:00 se envía solo (no cuenta si está en pausa).
      recTimerRef.current = setInterval(() => {
        setRecSeg((s) => {
          if (recRef.current?.rec.state !== 'recording') return s;
          if (s + 1 >= 300 && recRef.current) {
            recRef.current.enviar = true;
            try { recRef.current.rec.stop(); } catch { /* noop */ }
            return 300;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setMsg(es ? 'No se pudo acceder al micrófono.' : 'Could not access the microphone.');
    }
  }

  function togglePause() {
    const r = recRef.current;
    if (!r) return;
    if (r.rec.state === 'recording') {
      try { r.rec.pause(); } catch { /* noop */ }
      setRecPaused(true);
    } else if (r.rec.state === 'paused') {
      try { r.rec.resume(); } catch { /* noop */ }
      setRecPaused(false);
    }
  }

  function cancelRecording() {
    if (recRef.current) { recRef.current.enviar = false; try { recRef.current.rec.stop(); } catch { /* noop */ } }
  }

  function sendRecording() {
    if (recRef.current) { recRef.current.enviar = true; try { recRef.current.rec.stop(); } catch { /* noop */ } }
  }

  async function reaccionar(m, emoji) {
    setReactMenu(null);
    // Optimista: el cambio se ve AL INSTANTE (toggle igual que el backend).
    setMensajes((cur) => cur.map((x) => {
      if (String(x.id) !== String(m.id)) return x;
      const arr = (Array.isArray(x.reacciones) ? x.reacciones : []).map((rx) => ({ ...rx }));
      const iMine = arr.findIndex((rx) => rx.mi);
      if (iMine >= 0) {
        const mine = arr[iMine];
        if (mine.emoji === emoji) {
          // Mismo emoji -> quitar mi reaccion.
          mine.n -= 1;
          if (mine.n <= 0) arr.splice(iMine, 1);
          else mine.mi = false;
        } else {
          // Otro emoji -> cambia mi voto (una sola reaccion por usuario).
          mine.mi = false;
          mine.n -= 1;
          if (mine.n <= 0) arr.splice(iMine, 1);
          const j = arr.findIndex((rx) => rx.emoji === emoji);
          if (j >= 0) { arr[j].n += 1; arr[j].mi = true; }
          else arr.push({ emoji, n: 1, mi: true });
        }
      } else {
        const j = arr.findIndex((rx) => rx.emoji === emoji);
        if (j >= 0) { arr[j].n += 1; arr[j].mi = true; }
        else arr.push({ emoji, n: 1, mi: true });
      }
      return { ...x, reacciones: arr };
    }));
    const r = tipo === 'grupo'
      ? await apiComunidad.reaccionarMensaje(m.id, userKey, emoji)
      : await apiComunidad.dmReaccionar(m.id, userKey, emoji);
    if (r?.error) { setMsg(r.error); return; } // error visible, nunca en silencio
    cargar();
  }

  /** Coloca un panel flotante pegado al botón (auto izquierda/derecha). */
  function posFlotante(btn, W, H) {
    const win = winRef.current;
    if (!win || !btn) return { top: 60, left: 8 };
    const wRect = win.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    let left = bRect.left - wRect.left;
    if (left + W > wRect.width - 8) left = Math.max(8, bRect.right - wRect.left - W);
    const spaceBelow = wRect.bottom - bRect.bottom;
    const top = spaceBelow > H + 12
      ? (bRect.bottom - wRect.top + 4)
      : Math.max(8, bRect.top - wRect.top - H - 4);
    return { top, left };
  }

  /** Paleta de reacciones pegada al botón. */
  function abrirReacciones(m, btn) {
    if (reactMenu === m.id) { setReactMenu(null); return; }
    setReactPos(posFlotante(btn, 210, 44));
    setReactMenu(m.id);
    setMenuMsg(null);
  }

  /** Menú de 3 puntos (editar / eliminar) pegado al botón, auto izq/der. */
  function abrirMenu(m, btn) {
    if (menuMsg === m.id) { setMenuMsg(null); return; }
    setMenuPos(posFlotante(btn, 150, 96));
    setMenuMsg(m.id);
    setReactMenu(null);
  }

  async function guardarEdit(m) {
    const texto = String(editando?.texto || '').trim();
    if (!texto) return;
    const r = tipo === 'grupo'
      ? await apiComunidad.editarMensaje(grupoId, m.id, userKey, texto)
      : await apiComunidad.dmEditarMensaje(otroKey, m.id, userKey, texto);
    if (r?.error) { setMsg(r.error); return; }
    setMensajes((cur) => cur.map((x) => (String(x.id) === String(m.id) ? { ...x, texto, media: null, editado: true } : x)));
    setEditando(null);
  }

  async function doDelete(paraTodos) {
    const m = confirmDelete;
    if (!m) return;
    const r = tipo === 'grupo'
      ? await apiComunidad.eliminarMensaje(grupoId, m.id, userKey, paraTodos)
      : await apiComunidad.dmEliminarMensaje(otroKey, m.id, userKey, paraTodos);
    setConfirmDelete(null);
    if (r?.error) { setMsg(r.error); return; }
    if (paraTodos) {
      setMensajes((cur) => cur.map((x) => (String(x.id) === String(m.id) ? { ...x, eliminado: true, texto: null, media: null } : x)));
    } else {
      setMensajes((cur) => cur.filter((x) => String(x.id) !== String(m.id)));
    }
  }

  /** Marca la conversación como vista (al reproducir audio/video). */
  function marcarVisto() {
    if (tipo === 'grupo' && grupoId) apiComunidad.marcarChatLeido(grupoId, userKey);
    else if (tipo === 'dm' && otroKey) apiComunidad.dmLeido(otroKey, userKey);
  }

  // Al salir de pantalla completa, vuelve al modo normal.
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFullMsgId(null); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!ajustesOpen || temas.length) return;
    apiComunidad.temas().then((r) => { if (Array.isArray(r?.data)) setTemas(r.data); }).catch(() => {});
  }, [ajustesOpen, temas.length]);

  function expandir() {
    if (onClose) onClose();
    if (tipo === 'grupo') router.push(`/chat?conv=${encodeURIComponent(chat?.slug || grupoId)}`);
    else router.push(`/chat?dm=${encodeURIComponent(otroKey)}`);
  }

  function irAlCanal() {
    if (canalSlug) router.push(`/canal/${canalSlug}`);
  }

  // Perfil del emisor (avatar/nombre): el slug REAL por user_key -> sin 404.
  function irAlPerfil(m) {
    abrirCanal(router, m.user_key, m.usuario);
  }

  // Clic en el encabezado del chat (avatar + nombre + estado):
  // grupo -> pestaña de información del grupo; DM -> su canal.
  const headEsDm = tipo === 'dm' && !!canalSlug;
  const headEsGrupo = tipo === 'grupo' && !!grupoId;
  const headClic = headEsDm || headEsGrupo;
  function irHead() {
    if (headEsGrupo) router.push(`/comunidad/grupo/${grupoId}?tab=informacion`);
    else if (headEsDm) irAlCanal();
  }

  function llamar(tipoLlamada) {
    if (enCualquierLlamada) {
      avisar(es ? 'Ya estás en una llamada' : 'You are already in a call');
      return;
    }
    if (tipo === 'grupo' && salaActiva) {
      avisar(es ? 'Ya hay una llamada en curso en este grupo. Únete a ella.' : 'There is already a call in progress in this group.');
      return;
    }
    if (tipo === 'dm' && otroKey) {
      iniciarLlamada(otroKey, tipoLlamada, { nombre: titulo, avatar });
      return;
    }
    if (tipo === 'grupo' && grupoId) {
      iniciarGrupo(grupoId, tipoLlamada, { nombre: titulo, avatar });
      return;
    }
    avisar(es
      ? 'No se pudo iniciar la llamada (falta el contacto)'
      : 'Could not start the call (missing contact)');
  }

  function toggleHeadMenu() {
    if (headMenuOpen) { setHeadMenuOpen(false); return; }
    const r = headBtnRef.current ? headBtnRef.current.getBoundingClientRect() : null;
    if (r) setHeadMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setHeadMenuOpen(true);
  }

  // Al tocar la zona de mensajes (no botones/inputs) enfoca el input para escribir.
  function enfocarDesdeClick(e) {
    const el = e && e.target;
    if (el && el.closest && el.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (inputRef.current) inputRef.current.focus({ preventScroll: true });
  }

  function abrirAjustes() {
    setTemaBorrador({ ...tema });
    setMiDraft(miApodo || '');
    setSuDraft(suApodo || '');
    setAjustesOpen(true);
  }

  function guardarTema() {
    const t = { gradient: temaBorrador.gradient, color: temaBorrador.color, emoji: temaBorrador.emoji };
    const cambioTema = t.gradient !== tema.gradient || t.color !== tema.color || t.emoji !== tema.emoji;
    const mi = String(miDraft || '').trim().slice(0, 40);
    const su = String(suDraft || '').trim().slice(0, 40);
    const apodosCambio = mi !== (miApodo || '') || su !== (suApodo || '');
    setTema(t);
    setAjustesOpen(false);
    setMiApodo(mi);
    setSuApodo(su);
    if (tipo === 'dm' && otroKey) {
      if (cambioTema) apiComunidad.dmTema(otroKey, userKey, t);
      if (apodosCambio) apiComunidad.dmApodo(otroKey, userKey, mi, su);
    }
  }

  function resetTema() {
    const t = { gradient: '', color: '', emoji: '' };
    setTema(t);
    setTemaBorrador(t);
    setAjustesOpen(false);
    setMiDraft('');
    setSuDraft('');
    setMiApodo('');
    setSuApodo('');
    if (tipo === 'dm' && otroKey) {
      apiComunidad.dmTema(otroKey, userKey, t);
      if (miApodo || suApodo) apiComunidad.dmApodo(otroKey, userKey, '', '');
    }
  }

  // Cierra el menú de 3 puntos al hacer clic fuera.
  useEffect(() => {
    if (!headMenuOpen) return undefined;
    const onDoc = (e) => {
      if (headMenuRef.current && !headMenuRef.current.contains(e.target)) setHeadMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [headMenuOpen]);

  if (!chat) return null;

  // Tema aplicado: mientras se personaliza se ve el borrador (preview).
  const temaActivo = ajustesOpen ? temaBorrador : tema;
  const themed = !!(temaActivo.gradient || temaActivo.color);
  const winStyle = themed ? { background: temaActivo.gradient || temaActivo.color } : undefined;
  const nombreMostrado = String(suApodo || '').trim() || titulo;
  // Resalta el modal con mensajes sin leer mientras NO se esté viendo de verdad.
  const viendoAhora = !!(activo && inputFocused && docFocused);
  const conNuevos = noLeidos > 0 && !viendoAhora && !inline;
  // Chat conmigo mismo (notas): no tiene sentido ponerle apodos a "otra persona".
  const esMio = tipo === 'dm' && !!otroKey && String(otroKey) === String(userKey);

  return (
    <div
      className={`${styles.win} ${inline ? styles.winInline : ''} ${embedded && !inline ? styles.winEmbedded : ''} ${themed ? styles.winThemed : ''} ${conNuevos ? styles.winUnread : ''}`}
      style={winStyle}
      ref={winRef}
      onMouseDown={onActivar || undefined}
      onTouchStart={onActivar || undefined}
      onFocusCapture={onActivar || undefined}
      onClick={enfocarDesdeClick}
      onDragOver={onDragOverChat}
      onDragLeave={onDragLeaveChat}
      onDrop={onDropChat}
    >
      {dragOver && (
        <div className={styles.dragLayer} aria-hidden="true">
          <div className={styles.dragCard}>
            <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
            <span>{es ? 'Suelta para adjuntar' : 'Drop to attach'}</span>
            <small>{es ? 'Foto, video o audio' : 'Photo, video or audio'}</small>
          </div>
        </div>
      )}
      <div className={styles.head}>
        {inline && onBack && (
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label={es ? 'Volver' : 'Back'}>
            <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
          </button>
        )}
        <div
          className={`${styles.headMain} ${headClic ? styles.headMainClick : ''}`}
          onClick={headClic ? irHead : undefined}
          onKeyDown={headClic ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irHead(); } }) : undefined}
          role={headClic ? 'button' : undefined}
          tabIndex={headClic ? 0 : undefined}
          title={headClic
            ? (headEsGrupo
                ? (es ? 'Ver información del grupo' : 'View group info')
                : (es ? 'Ver perfil' : 'View profile'))
            : undefined}
        >
          <span className={styles.avatarWrap}>
            <span className={styles.avatar}>
              {avatar ? <img src={comunidadMedia(avatar)} alt="" /> : String(titulo || '?').charAt(0).toUpperCase()}
            </span>
            {nuevo && !inline && <span className={styles.avatarDot} />}
          </span>
          <div className={styles.headInfo}>
            <strong className={styles.name}>{nombreMostrado}</strong>
            <span className={`${styles.state} ${tipo === 'dm' && !presenciaEstado(otroEdad, es).online ? styles.stateOff : ''}`}>
              {tipo !== 'grupo' && tema.emoji ? `${tema.emoji} ` : ''}
              {tipo === 'grupo'
                ? (chat?.miembros
                    ? `${fmtNum(chat.miembros)} ${es ? 'miembros' : 'members'} · ${fmtNum(chat.activos || 0)} ${es ? 'en línea' : 'online'}`
                    : '')
                : presenciaEstado(otroEdad, es).label}
            </span>
          </div>
        </div>
        {inline ? (
          /* Chat expandido (/chat): todo inline a la derecha del nombre. */
          <>
            {tipo === 'dm' && (
              <button type="button" className={styles.iconBtn} onClick={abrirAjustes} title={es ? 'Personalizar' : 'Customize'}>
                <ion-icon name="color-palette-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'dm' && (
              <button type="button" className={styles.iconBtn} onClick={() => llamar('audio')} disabled={llamadaEnCurso} title={es ? 'Llamada de voz' : 'Voice call'}>
                <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'dm' && (
              <button type="button" className={styles.iconBtn} onClick={() => llamar('video')} disabled={llamadaEnCurso} title={es ? 'Videollamada' : 'Video call'}>
                <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'dm' && (
              <button type="button" className={styles.iconBtn} onClick={irAlCanal} disabled={!canalSlug} title={es ? 'Información' : 'Info'}>
                <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'grupo' && (
              <button type="button" className={styles.iconBtn} onClick={() => llamar('audio')} disabled={llamadaEnCurso} title={es ? 'Llamada de grupo' : 'Group call'}>
                <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'grupo' && (
              <button type="button" className={styles.iconBtn} onClick={() => llamar('video')} disabled={llamadaEnCurso} title={es ? 'Videollamada de grupo' : 'Group video call'}>
                <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'grupo' && enCualquierLlamada && (
              <span className={styles.enLlamadaTag} title={es ? 'En llamada' : 'In call'}>
                <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
                {es ? 'En llamada' : 'In call'}
              </span>
            )}
            {tipo === 'grupo' && (
              <button type="button" className={styles.iconBtn} onClick={() => { if (grupoId) router.push(`/comunidad/grupo/${grupoId}?tab=miembros`); }} title={es ? 'Miembros' : 'Members'}>
                <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {tipo === 'grupo' && (
              <button type="button" className={styles.iconBtn} onClick={() => { if (grupoId) router.push(`/comunidad/grupo/${grupoId}?tab=informacion`); }} title={es ? 'Información del grupo' : 'Group info'}>
                <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
          </>
        ) : (
          /* Flotante: diseño de 3 puntos (igual en PC y celular). */
          <>
            <div className={styles.headMenuWrap} ref={headMenuRef}>
              <button
                type="button"
                ref={headBtnRef}
                className={`${styles.iconBtn} ${headMenuOpen ? styles.iconBtnOn : ''}`}
                onClick={toggleHeadMenu}
                title={es ? 'Más opciones' : 'More options'}
                aria-label={es ? 'Más opciones' : 'More options'}
                aria-expanded={headMenuOpen}
              >
                <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
              </button>
              {headMenuOpen && (
                <div className={styles.headMenu} role="menu" style={{ top: headMenuPos.top, right: headMenuPos.right }}>
                  {tipo === 'dm' && (
                    <button type="button" role="menuitem" onClick={() => { setHeadMenuOpen(false); abrirAjustes(); }}>
                      <ion-icon name="color-palette-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Personalizar chat' : 'Customize chat'}
                    </button>
                  )}
                  {tipo === 'dm' && (
                    <button type="button" role="menuitem" disabled={llamadaEnCurso} onClick={() => { setHeadMenuOpen(false); llamar('audio'); }}>
                      <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Llamada de voz' : 'Voice call'}
                    </button>
                  )}
                  {tipo === 'dm' && (
                    <button type="button" role="menuitem" disabled={llamadaEnCurso} onClick={() => { setHeadMenuOpen(false); llamar('video'); }}>
                      <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Videollamada' : 'Video call'}
                    </button>
                  )}
                  {tipo === 'dm' && (
                    <button type="button" role="menuitem" onClick={() => { setHeadMenuOpen(false); irAlCanal(); }} disabled={!canalSlug}>
                      <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Información' : 'Info'}
                    </button>
                  )}
                  {tipo === 'grupo' && (
                    <button type="button" role="menuitem" disabled={llamadaEnCurso} onClick={() => { setHeadMenuOpen(false); llamar('audio'); }}>
                      <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Llamada de grupo' : 'Group call'}
                    </button>
                  )}
                  {tipo === 'grupo' && (
                    <button type="button" role="menuitem" disabled={llamadaEnCurso} onClick={() => { setHeadMenuOpen(false); llamar('video'); }}>
                      <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Videollamada de grupo' : 'Group video call'}
                    </button>
                  )}
                  {tipo === 'grupo' && (
                    <button type="button" role="menuitem" onClick={() => { setHeadMenuOpen(false); if (grupoId) router.push(`/comunidad/grupo/${grupoId}?tab=conversacion`); }}>
                      <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Ver grupo' : 'View group'}
                    </button>
                  )}
                  {tipo === 'grupo' && (
                    <button type="button" role="menuitem" onClick={() => { setHeadMenuOpen(false); if (grupoId) router.push(`/comunidad/grupo/${grupoId}?tab=miembros`); }}>
                      <ion-icon name="people-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Miembros' : 'Members'}
                    </button>
                  )}
                  {tipo === 'grupo' && (
                    <button type="button" role="menuitem" onClick={() => { setHeadMenuOpen(false); if (grupoId) router.push(`/comunidad/grupo/${grupoId}?tab=informacion`); }}>
                      <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Información' : 'Info'}
                    </button>
                  )}
                </div>
              )}
            </div>
            {onMinimize && (
              <button type="button" className={styles.iconBtn} onClick={onMinimize} title={es ? 'Minimizar' : 'Minimize'}>
                <ion-icon name="remove-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            <button type="button" className={styles.iconBtn} onClick={expandir} title={es ? 'Expandir' : 'Expand'}>
              <ion-icon name="expand-outline" suppressHydrationWarning></ion-icon>
            </button>
            <button type="button" className={styles.iconBtn} onClick={onClose} title={es ? 'Cerrar' : 'Close'}>
              <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
            </button>
          </>
        )}
      </div>

      <div
        className={styles.body}
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const abajo = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          atBottomRef.current = abajo;
          setAtBottom(abajo);
          if (reactMenu) setReactMenu(null);
          if (menuMsg) setMenuMsg(null);
          if (el.scrollTop < 80) cargarAntiguos();
        }}
      >
        {tema.emoji && <span className={styles.watermark} aria-hidden="true">{tema.emoji}</span>}
        {tipo === 'grupo' && salaActiva && !enCualquierLlamada && (
          <button
            type="button"
            className={styles.llamadaBanner}
            onClick={() => unirseGrupo(grupoId, salaActiva.call_id, salaActiva.tipo, { nombre: titulo })}
          >
            <ion-icon name={salaActiva.tipo === 'video' ? 'videocam-outline' : 'call-outline'} suppressHydrationWarning></ion-icon>
            {es ? 'Llamada en curso · Unirse' : 'Call in progress · Join'}
          </button>
        )}
        {mensajes.length === 0 && (
          <p className={styles.empty}>{es ? 'Empieza la conversación.' : 'Start the conversation.'}</p>
        )}
        {mensajes.map((m) => {
          if (m.tipo === 'sistema') {
            const esMio = String(m.user_key) === String(userKey);
            const codigos = {
              diseno: { mio: es ? 'Cambiaste el diseño del chat' : 'You changed the chat design', suyo: es ? `Tu amigo ${m.usuario} cambió el diseño del chat` : `Your friend ${m.usuario} changed the chat design` },
              apodos: { mio: es ? 'Cambiaste los apodos' : 'You changed the nicknames', suyo: es ? `Tu amigo ${m.usuario} cambió los apodos` : `Your friend ${m.usuario} changed the nicknames` },
            };
            let label;
            if (typeof m.texto === 'string' && m.texto.startsWith('llamada|')) {
              const [, lt, lseg, lest, lautor] = m.texto.split('|');
              const video = lt === 'video';
              const seg = Math.max(0, parseInt(lseg, 10) || 0);
              const dur = seg >= 3600
                ? `${Math.floor(seg / 3600)} h ${Math.floor((seg % 3600) / 60)} min`
                : seg >= 60
                  ? `${Math.floor(seg / 60)} min ${seg % 60} s`
                  : `${seg} s`;
              const esAutor = String(lautor) === String(userKey);
              const quien = esAutor ? (es ? 'Iniciaste' : 'You started') : (es ? 'Llamada de' : 'Call from');
              const tipoTxt = video ? (es ? 'videollamada' : 'video call') : (es ? 'llamada de voz' : 'voice call');
              const finalizada = lest === 'finalizada';
              const durTxt = finalizada ? ` · ${dur}` : ` · ${es ? 'cancelada' : 'cancelled'}`;
              return (
                <div key={m.id} className={styles.sistema}>
                  <span className={styles.sistemaText}>
                    <ion-icon name={video ? 'videocam-outline' : 'call-outline'} className={styles.sistemaIcon} suppressHydrationWarning></ion-icon>
                    {`${quien} ${esAutor ? '' : m.usuario + ' · '}${tipoTxt}${durTxt}`}
                  </span>
                  <span className={styles.sistemaTime}>{hora(m.created_at, es)}</span>
                </div>
              );
            }
            if (typeof m.texto === 'string' && m.texto.startsWith('icono|')) {
              const em = m.texto.slice(6).trim();
              label = em
                ? (esMio ? `Cambiaste el icono a ${em}` : `Tu amigo ${m.usuario} cambió el icono a ${em}`)
                : (esMio ? 'Quitaste el icono' : `Tu amigo ${m.usuario} quitó el icono`);
            } else {
              const t2 = codigos[m.texto];
              label = t2 ? (esMio ? t2.mio : t2.suyo) : m.texto;
            }
            return (
              <div key={m.id} className={styles.sistema}>
                <span className={styles.sistemaText}>{label}</span>
                <span className={styles.sistemaTime}>{hora(m.created_at, es)}</span>
              </div>
            );
          }
          const mio = String(m.user_key) === String(userKey);
          const esMedia = (m.media && (m.tipo === 'foto' || m.tipo === 'video' || m.tipo === 'audio'))
            || m.tipo === 'album' || m.tipo === 'sticker' || m.tipo === 'gif';
          const leido = mio && (m.leido || (m.leidos > 0));
          const enEdicion = editando && String(editando.id) === String(m.id);
          return (
            <div key={m.id} data-mid={String(m.id)} className={`${styles.row} ${mio ? styles.mine : ''}`}>
              {mio && !m.eliminado && (
                <div className={styles.msgActions}>
                  {esEditableHora(m.created_at) && (
                    <button type="button" className={styles.msgAction} title={es ? 'Opciones' : 'Options'} onClick={(e) => abrirMenu(m, e.currentTarget)}>
                      <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
                    </button>
                  )}
                  <button type="button" className={styles.msgAction} title={es ? 'Reaccionar' : 'React'} onClick={(e) => abrirReacciones(m, e.currentTarget)}>
                    <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
                  </button>
                  <button type="button" className={styles.msgAction} title={es ? 'Responder' : 'Reply'} onClick={() => setRespondiendo(m)}>
                    <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
              )}
              {!mio && !m.eliminado && (
                <button
                  type="button"
                  className={styles.msgAvatar}
                  title={es ? 'Ver perfil' : 'View profile'}
                  onClick={() => irAlPerfil(m)}
                >
                  {m.avatar && !avataresMal.has(String(m.id))
                    ? <Image src={comunidadMedia(m.avatar)} alt="" width={28} height={28} loading="lazy" onError={() => setAvataresMal((s) => new Set(s).add(String(m.id)))} />
                    : <span>{String(m.usuario || 'U').trim().slice(0, 1).toUpperCase()}</span>}
                </button>
              )}
              <div className={`${styles.bubble} ${mio ? styles.bubbleMine : ''} ${esMedia && !m.eliminado ? styles.bubbleMedia : ''} ${esMedia && !m.eliminado && m.texto ? styles.bubbleWithCaption : ''} ${m.eliminado ? styles.bubbleDeleted : ''}`}>
                {!mio && tipo === 'grupo' && !m.eliminado && (
                  <button type="button" className={styles.user} onClick={() => irAlPerfil(m)}>
                    {m.usuario}
                  </button>
                )}

                {m.eliminado ? (
                  <span className={styles.deletedText}>
                    <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Mensaje eliminado' : 'Message deleted'}
                  </span>
                ) : enEdicion ? (
                  <div className={styles.editBox}>
                    <input
                      className={styles.editInput}
                      value={editando.texto}
                      autoFocus
                      onChange={(e) => setEditando((s) => ({ ...s, texto: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') guardarEdit(m); if (e.key === 'Escape') setEditando(null); }}
                    />
                    <div className={styles.editActions}>
                      <button type="button" className={styles.editCancel} onClick={() => setEditando(null)}>
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                      <button type="button" className={styles.editSave} onClick={() => guardarEdit(m)}>
                        {es ? 'Guardar' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.reply_to && (
                      <div className={styles.quote}>
                        <strong>{m.reply_usuario || (es ? 'Mensaje' : 'Message')}</strong>
                        <span>{(m.reply_texto || (es ? 'archivo' : 'file')).slice(0, 70)}</span>
                      </div>
                    )}
                    {m.tipo === 'album' && (() => {
                      const items = parseMedia(m.media);
                      const visibles = items.slice(0, 4);
                      return (
                        <div className={styles.albumGrid} data-n={items.length}>
                          {visibles.map((p, i) => {
                            const k = kindDeArchivo(p);
                            return (
                              <button
                                type="button"
                                key={`${p}-${i}`}
                                className={styles.albumCell}
                                title={es ? 'Ver' : 'View'}
                                onClick={() => setAlbumVis({ items, idx: i, cap: m.texto || '', autor: m.usuario || '' })}
                              >
                                {k === 'foto'
                                  ? <img src={comunidadMedia(p)} alt="" loading="lazy" />
                                  : <video src={comunidadMedia(p)} preload="metadata" muted playsInline />}
                                {k === 'video' && (
                                  <span className={styles.albumPlay}>
                                    <ion-icon name="play" suppressHydrationWarning></ion-icon>
                                  </span>
                                )}
                                {k === 'audio' && (
                                  <span className={styles.albumPlay}>
                                    <ion-icon name="musical-notes-outline" suppressHydrationWarning></ion-icon>
                                  </span>
                                )}
                                {i === 3 && items.length > 4 && (
                                  <span className={styles.albumMore}>+{items.length - 4}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {m.media && m.tipo === 'foto' && (
                      <img
                        className={`${styles.media} ${styles.mediaZoom}`}
                        src={comunidadMedia(m.media)}
                        alt=""
                        loading="lazy"
                        onClick={() => setImgFull(comunidadMedia(m.media))}
                        title={es ? 'Ampliar' : 'Enlarge'}
                      />
                    )}
                    {m.media && m.tipo === 'video' && (() => {
                      const vSrc = comunidadMedia(m.media);
                      const esFull = String(fullMsgId) === String(m.id);
                      return (
                        <div className={styles.playerWrap}>
                          <Reproductor
                            ref={(el) => { videoRefs.current[m.id] = el; }}
                            src={vSrc}
                            compact={!esFull}
                            ads={false}
                            onPlay={marcarVisto}
                          />
                          <button
                            type="button"
                            className={styles.expandBtn}
                            title={es ? 'Ampliar' : 'Enlarge'}
                            onClick={() => {
                              marcarVisto();
                              setFullMsgId(m.id);
                              const r = videoRefs.current[m.id];
                              if (r?.fullscreen) r.fullscreen();
                            }}
                          >
                            <ion-icon name={esFull ? 'contract-outline' : 'expand-outline'} suppressHydrationWarning></ion-icon>
                          </button>
                        </div>
                      );
                    })()}
                    {m.media && m.tipo === 'audio' && <AudioMsg src={comunidadMedia(m.media)} mine={mio} onPlay={marcarVisto} />}
                    {(m.tipo === 'sticker' || m.tipo === 'gif') && m.texto
                      ? <span className={styles.sticker}>{m.texto}</span>
                      : (m.texto && <span className={styles.text}>{m.texto}</span>)}
                    {m.editado && <span className={styles.editedLabel}>{es ? 'Mensaje editado' : 'Message edited'}</span>}
                  </>
                )}

                {/* Reacciones: fila propia DEBAJO del contenido (audio/archivo/
                    mensaje), sin tapar ni apretar nada mas. */}
                {Array.isArray(m.reacciones) && m.reacciones.length > 0 && !m.eliminado && (
                  <div className={styles.reactionsRow}>
                    {m.reacciones.map((rx) => (
                      <button key={rx.emoji} type="button" className={`${styles.reaction} ${rx.mi ? styles.reactionMine : ''}`} onClick={() => reaccionar(m, rx.emoji)}>
                        {rx.emoji} {rx.n}
                      </button>
                    ))}
                  </div>
                )}

                <div className={styles.metaRow}>
                  <span className={styles.time}>
                    {hora(m.created_at, es)}
                    {mio && !m.eliminado && (
                      <span
                        className={`${styles.checks} ${leido ? styles.checksOn : ''}`}
                        title={leido ? (es ? 'Leído' : 'Read') : (es ? 'Enviado' : 'Sent')}
                      >
                        <ion-icon name="checkmark-done-outline" suppressHydrationWarning></ion-icon>
                      </span>
                    )}
                    {mio && !m.eliminado && leido && (
                      <span className={styles.visto}>{vistoTexto(m.visto_en, es)}</span>
                    )}
                  </span>
                </div>
              </div>
              {!mio && !m.eliminado && (
                <div className={styles.msgActions}>
                  <button type="button" className={styles.msgAction} title={es ? 'Reaccionar' : 'React'} onClick={(e) => abrirReacciones(m, e.currentTarget)}>
                    <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
                  </button>
                  <button type="button" className={styles.msgAction} title={es ? 'Responder' : 'Reply'} onClick={() => setRespondiendo(m)}>
                    <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {subiendo && (
          <div className={styles.uploadRow}>
            <div className={styles.uploadTop}>
              <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
              <span className={styles.uploadName}>{subiendo.nombre}</span>
              <span className={styles.uploadPct}>{subiendo.pct}%</span>
            </div>
            <div className={styles.uploadBar}>
              <div className={styles.uploadFill} style={{ width: `${subiendo.pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {reactMenu && (
        <div className={styles.paletteFloat} style={{ top: `${reactPos.top}px`, left: `${reactPos.left}px` }}>
          {EMOJIS.map((e) => {
            const msg = mensajes.find((x) => String(x.id) === String(reactMenu));
            return (
              <button
                key={e}
                type="button"
                className={styles.paletteBtn}
                onClick={() => { if (msg) reaccionar(msg, e); }}
              >
                {e}
              </button>
            );
          })}
        </div>
      )}

      {menuMsg && (() => {
        const m = mensajes.find((x) => String(x.id) === String(menuMsg));
        if (!m) return null;
        const puedeEditar = !m.eliminado && !m.media && m.texto && m.tipo !== 'sticker' && m.tipo !== 'gif';
        return (
          <div className={styles.menuFloat} style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}>
            {puedeEditar && (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => { setEditando({ id: m.id, texto: m.texto }); setMenuMsg(null); }}
              >
                <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Editar' : 'Edit'}
              </button>
            )}
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuDanger}`}
              onClick={() => { setConfirmDelete(m); setMenuMsg(null); }}
            >
              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Eliminar' : 'Delete'}
            </button>
          </div>
        );
      })()}

      {respondiendo && (
        <div className={styles.replyBar}>
          <span>{es ? 'Respondiendo a' : 'Replying to'} <strong>{respondiendo.usuario}</strong></span>
          <button type="button" className={styles.replyClose} onClick={() => setRespondiendo(null)} aria-label={es ? 'Cancelar' : 'Cancel'}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      )}

      {msg && <p className={styles.error}>{msg}</p>}

      {pickerOpen && (
        <div className={styles.picker}>
          <div className={styles.pickerHead}>
            <div className={styles.pickerTabs}>
              {PICKER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.pickerTab} ${pickerTab === t.id ? styles.pickerTabActive : ''}`}
                  onClick={() => setPickerTab(t.id)}
                >
                  <ion-icon name={t.icon} suppressHydrationWarning></ion-icon>
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.pickerClose}
              onClick={() => setPickerOpen(false)}
              aria-label={es ? 'Cerrar' : 'Close'}
            >
              <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>
          {pickerTab === 'emoji' ? (
            <div className={styles.emojiScroll}>
              {EMOJI_CATEGORIES.slice(0, emojiCats).map((cat) => (
                <div key={cat.name} className={styles.emojiCat}>
                  <span className={styles.emojiCatTitle}>{cat.name}</span>
                  <div className={styles.emojiGrid}>
                    {cat.emojis.map((e) => (
                      <button key={e} type="button" className={styles.pickerEmoji} onClick={() => elegirPicker(e)}>{e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.lockedWrap}>
              <div className={styles.pickerGrid}>
                {(pickerTab === 'gif' ? GIF_LIST : STICKER_LIST).slice(0, stickerCount).map((e) => (
                  <button key={e} type="button" className={styles.pickerSticker} disabled>{e}</button>
                ))}
              </div>
              <div className={styles.lockOverlay}>
                <span className={styles.lockIcon}>
                  <ion-icon name="lock-closed-outline" suppressHydrationWarning></ion-icon>
                </span>
                <p className={styles.lockText}>
                  {es ? 'Solo se puede desbloquear con el modo Premium' : 'Only unlockable with Premium'}
                </p>
                <button
                  type="button"
                  className={styles.lockBtn}
                  onClick={() => { setPickerOpen(false); setPremiumOpen(true); }}
                >
                  <ion-icon name="diamond-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Ver Premium' : 'See Premium'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!atBottom && !recording && (
        <button type="button" className={styles.jumpBtn} onClick={irAlFinal} title={es ? 'Ir al último mensaje' : 'Go to latest'}>
          <ion-icon name="chevron-down-outline" suppressHydrationWarning></ion-icon>
        </button>
      )}

      {recording ? (
        <div className={styles.recBar}>
          <button type="button" className={styles.recTrash} onClick={cancelRecording} title={es ? 'Cancelar' : 'Cancel'}>
            <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
          </button>
          <span className={`${styles.recDot} ${recPaused ? styles.recDotPaused : ''}`} />
          <span className={styles.recTime}>{fmtSeg(recSeg)}</span>
          <span className={styles.recLive}>
            {recPaused ? (es ? 'En pausa' : 'Paused') : (es ? 'Grabando… (máx 5:00)' : 'Recording… (max 5:00)')}
          </span>
          <button
            type="button"
            className={styles.recPause}
            onClick={togglePause}
            title={recPaused ? (es ? 'Reanudar' : 'Resume') : (es ? 'Pausar' : 'Pause')}
          >
            <ion-icon name={recPaused ? 'play' : 'pause'} suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.send} onClick={sendRecording} title={es ? 'Enviar audio' : 'Send audio'}>
            <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      ) : (
        <>
          {pendientes.length > 0 && (
            <div className={styles.pendRow}>
              {(pendExpandido || pendientes.length <= 3 ? pendientes : pendientes.slice(0, 3)).map((p) => (
                <div key={p.id} className={styles.pendChip}>
                  {p.url && p.file.type.startsWith('image/') ? (
                    <img className={styles.pendThumb} src={p.url} alt="" />
                  ) : p.url && p.file.type.startsWith('video/') ? (
                    <video className={styles.pendThumb} src={p.url} preload="metadata" muted playsInline />
                  ) : (
                    <span className={styles.pendIcon}>
                      <ion-icon name="mic-outline" suppressHydrationWarning></ion-icon>
                    </span>
                  )}
                  <span className={styles.pendName}>{p.file.name}</span>
                  <button type="button" className={styles.pendX} onClick={() => quitarPendiente(p)} aria-label={es ? 'Quitar' : 'Remove'}>
                    <ion-icon name="close" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
              ))}
              {pendientes.length > 3 && (
                <button
                  type="button"
                  className={`${styles.pendChip} ${styles.pendMore}`}
                  onClick={() => setPendExpandido((v) => !v)}
                >
                  <ion-icon name={pendExpandido ? 'chevron-up-outline' : 'add-outline'} suppressHydrationWarning></ion-icon>
                  {pendExpandido ? (es ? 'Ver menos' : 'Less') : `+${pendientes.length - 3}`}
                </button>
              )}
            </div>
          )}
        <div className={`${styles.foot} ${conNuevos ? styles.footUnread : ''}`}>
          <button
            type="button"
            className={styles.tool}
            title={es ? 'Grabar audio' : 'Record audio'}
            onClick={startRecording}
          >
            <ion-icon name="mic-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.tool} title={es ? 'Enviar foto o video' : 'Send photo or video'} onClick={() => fileRef.current?.click()}>
            <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
          </button>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Aa"
            value={borrador}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
          />
          <button
            type="button"
            className={`${styles.tool} ${pickerOpen ? styles.toolOn : ''}`}
            title={es ? 'Emoji, stickers y GIF' : 'Emoji, stickers and GIF'}
            onClick={() => setPickerOpen((o) => !o)}
          >
            <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
          </button>
          {borrador.trim() || pendientes.length > 0 ? (
            <button type="button" className={styles.send} onClick={enviar} disabled={sending} title={es ? 'Enviar' : 'Send'}>
              <ion-icon name={sending ? 'sync-outline' : 'paper-plane-outline'} className={sending ? styles.spin : ''} suppressHydrationWarning></ion-icon>
            </button>
          ) : (
            <button type="button" className={styles.send} onClick={enviarLike} disabled={sending} title={es ? 'Enviar' : 'Send'}>
              <span className={styles.sendEmoji}>{tema.emoji || '👍'}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden multiple onChange={onArchivo} />
        </div>
        </>
      )}

      {ajustesOpen && (
        <div className={styles.ajustes}>
          <div className={styles.ajustesHead}>
            <h4 className={styles.ajustesTitle}>{es ? 'Personalizar chat' : 'Customize chat'}</h4>
            <button type="button" className={styles.ajustesClose} onClick={() => setAjustesOpen(false)} aria-label={es ? 'Cerrar' : 'Close'}>
              <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>
          <div className={styles.ajustesBody}>
            {!esMio && (
              <>
                <span className={styles.ajustesLabel}>{es ? 'Mi apodo' : 'My nickname'}</span>
                <input
                  className={styles.ajustesInput}
                  value={miDraft}
                  maxLength={40}
                  placeholder={es ? 'Cómo te llamará' : 'What they will call you'}
                  onChange={(e) => setMiDraft(e.target.value)}
                />

                <span className={styles.ajustesLabel}>{es ? 'Su apodo' : 'Their nickname'}</span>
                <input
                  className={styles.ajustesInput}
                  value={suDraft}
                  maxLength={40}
                  placeholder={titulo}
                  onChange={(e) => setSuDraft(e.target.value)}
                />
              </>
            )}

            <span className={styles.ajustesLabel}>{es ? 'Estilo de fondo' : 'Background style'}</span>
            <div className={styles.temasGrid}>
              {temas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.temaSwatch} ${temaBorrador.gradient === t.gradient ? styles.temaOn : ''}`}
                  style={{ background: t.gradient }}
                  title={t.nombre}
                  onClick={() => setTemaBorrador((s) => ({ ...s, gradient: t.gradient, color: '' }))}
                />
              ))}
            </div>

            <span className={styles.ajustesLabel}>{es ? 'Color de fondo' : 'Background color'}</span>
            <div className={styles.coloresGrid}>
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorSwatch} ${temaBorrador.color === c ? styles.temaOn : ''}`}
                  style={{ background: c }}
                  onClick={() => setTemaBorrador((s) => ({ ...s, color: c, gradient: '' }))}
                />
              ))}
            </div>

            <span className={styles.ajustesLabel}>{es ? 'Emoji' : 'Emoji'}</span>
            <div className={styles.temaEmojis}>
              {TEMA_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`${styles.temaEmoji} ${temaBorrador.emoji === e ? styles.temaOn : ''}`}
                  onClick={() => setTemaBorrador((s) => ({ ...s, emoji: s.emoji === e ? '' : e }))}
                >
                  {e}
                </button>
              ))}
            </div>

            <span className={styles.ajustesLabel}>{es ? 'Vista previa' : 'Preview'}</span>
            <div
              className={styles.preview}
              style={(temaBorrador.gradient || temaBorrador.color)
                ? { background: temaBorrador.gradient || temaBorrador.color }
                : undefined}
            >
              {temaBorrador.emoji && <span className={styles.previewEmoji} aria-hidden="true">{temaBorrador.emoji}</span>}
              <div className={styles.previewHead}>
                <span className={styles.previewAvatar}>{String(titulo || '?').charAt(0).toUpperCase()}</span>
                <div className={styles.previewWho}>
                  <span className={styles.previewName}>{String(suDraft || '').trim() || titulo}</span>
                  <span className={styles.previewStatus}>
                    {temaBorrador.emoji ? `${temaBorrador.emoji} ` : ''}{es ? 'en línea' : 'online'}
                  </span>
                </div>
              </div>
              <div className={styles.previewMsgs}>
                <span className={styles.previewIn}>{es ? 'Hola, ¿qué tal?' : 'Hey, how are you?'}</span>
                <span className={styles.previewOut}>{es ? 'Todo bien 😎' : 'All good 😎'}</span>
              </div>
            </div>
          </div>
          <div className={styles.ajustesFoot}>
            <button type="button" className={styles.ajustesReset} onClick={resetTema}>{es ? 'Restablecer' : 'Reset'}</button>
            <button type="button" className={styles.ajustesSave} onClick={guardarTema}>{es ? 'Guardar' : 'Save'}</button>
          </div>
        </div>
      )}

      {imgFull && (
        <div className={styles.imgLightbox} onClick={(e) => { if (e.target === e.currentTarget) setImgFull(null); }}>
          <button type="button" className={styles.imgClose} onClick={() => setImgFull(null)} aria-label={es ? 'Cerrar' : 'Close'}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
          <img className={styles.imgFullImg} src={imgFull} alt="" />
        </div>
      )}

      {albumVis && (() => {
        const src = comunidadMedia(albumVis.items[albumVis.idx] || '');
        const k = kindDeArchivo(albumVis.items[albumVis.idx] || '');
        const hayVarios = albumVis.items.length > 1;
        return (
          <div className={styles.albumFull} onClick={(e) => { if (e.target === e.currentTarget) setAlbumVis(null); }}>
            <button type="button" className={styles.albumClose} onClick={() => setAlbumVis(null)} aria-label={es ? 'Cerrar' : 'Close'}>
              <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
            </button>
            {hayVarios && (
              <>
                <button
                  type="button"
                  className={`${styles.albumNav} ${styles.albumNavL}`}
                  onClick={() => setAlbumVis((a) => ({ ...a, idx: (a.idx - 1 + a.items.length) % a.items.length }))}
                  aria-label={es ? 'Anterior' : 'Previous'}
                >
                  <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                </button>
                <button
                  type="button"
                  className={`${styles.albumNav} ${styles.albumNavR}`}
                  onClick={() => setAlbumVis((a) => ({ ...a, idx: (a.idx + 1) % a.items.length }))}
                  aria-label={es ? 'Siguiente' : 'Next'}
                >
                  <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                </button>
                <span className={styles.albumCount}>{albumVis.idx + 1} / {albumVis.items.length}</span>
              </>
            )}
            <div className={styles.albumStage}>
              {k === 'video' && (
                <div className={styles.albumPlayer}>
                  <Reproductor key={src} src={src} ads={false} />
                </div>
              )}
              {k === 'audio' && (
                <audio key={src} className={styles.albumAudio} src={src} controls autoPlay />
              )}
              {k === 'foto' && (
                <img className={styles.albumMedia} src={src} alt="" />
              )}
            </div>
            {albumVis.cap && <div className={styles.albumCap}>{albumVis.cap}</div>}
          </div>
        );
      })()}

      {confirmDelete && (
        <div className={styles.delOverlay} onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className={styles.delCard}>
            <h4 className={styles.delTitle}>{es ? 'Eliminar mensaje' : 'Delete message'}</h4>
            <p className={styles.delText}>{es ? '¿Cómo quieres eliminarlo?' : 'How do you want to delete it?'}</p>
            <button type="button" className={styles.delOpt} onClick={() => doDelete(false)}>
              <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Borrar para mí' : 'Delete for me'}
            </button>
            <button type="button" className={`${styles.delOpt} ${styles.delOptDanger}`} onClick={() => doDelete(true)}>
              <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Borrar para todos' : 'Delete for everyone'}
            </button>
            <button type="button" className={styles.delCancel} onClick={() => setConfirmDelete(null)}>
              {es ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      <Premium open={premiumOpen} onClose={() => setPremiumOpen(false)} />
      <Restringido
        open={restringidoOpen}
        onClose={() => setRestringidoOpen(false)}
        onVerPlanes={() => setPremiumOpen(true)}
        limiteMb={limiteMb}
      />

      {proxOpen && (
        <div className={styles.proxOverlay} onClick={(e) => { if (e.target === e.currentTarget) setProxOpen(false); }}>
          <div className={styles.proxCard}>
            <ion-icon name="construct-outline" className={styles.proxIcon} suppressHydrationWarning></ion-icon>
            <strong className={styles.proxTitle}>{es ? 'Próximamente' : 'Coming soon'}</strong>
            <span className={styles.proxText}>
              {es ? 'Las llamadas y videollamadas estarán disponibles pronto.' : 'Calls and video calls will be available soon.'}
            </span>
            <button type="button" className={styles.proxBtn} onClick={() => setProxOpen(false)}>
              {es ? 'Entendido' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
