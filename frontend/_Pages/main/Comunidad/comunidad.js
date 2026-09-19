'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './comunidad.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AuthModal from '@/_Pages/main/Auth/AuthModal';
import { useChatDock } from '@/_Extras/ChatDock/ChatDockProvider.js';
import Mantenimiento from '@/_Pages/main/Chat/componentes/mantenimiento';
import { apiComunidad, comunidadMedia, comprimirImagen } from '@/_Extras/Comunidad/api.js';
import { soloUnoPlay } from '@/_Extras/Media/onlyOne.js';
import { hace, fecha } from '@/_Extras/Fecha/fecha.js';

function ini(name) {
  return String(name || 'U').trim().slice(0, 1).toUpperCase();
}

function mmss(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

const MAX_STORY_MB = 200;      // límite "gratis" por archivo
const MAX_DESC_HISTORIA = 150; // caracteres de la descripción

/** Zona cuadrada para arrastrar o seleccionar la media de la historia. */
function StoryDrop({ onFile, es }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  function pick(files) {
    const f = files?.[0];
    if (f) onFile(f);
  }
  return (
    <div
      className={`${styles.storyDrop} ${drag ? styles.storyDropOn : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer?.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className={styles.hidden}
        onChange={(e) => { const files = e.target.files; e.target.value = ''; pick(files); }}
      />
      <ion-icon name="cloud-upload-outline" className={styles.storyDropIcon} suppressHydrationWarning></ion-icon>
      <span className={styles.storyDropText}>{es ? 'Arrastra o selecciona' : 'Drag or select'}</span>
      <span className={styles.storyDropHint}>{es ? 'Foto o video' : 'Photo or video'}</span>
    </div>
  );
}

export default function ComunidadClient() {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { user, userKey, authed } = useAuth();
  const router = useRouter();

  const [authOpen, setAuthOpen] = useState(false);
  const [feed, setFeed] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [stories, setStories] = useState([]);
  const [storyView, setStoryView] = useState(null);
  const [canStoriesL, setCanStoriesL] = useState(false);
  const [canStoriesR, setCanStoriesR] = useState(false);
  const [mute, setMute] = useState(true);
  const [respuesta, setRespuesta] = useState('');
  const [progreso, setProgreso] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [menuStory, setMenuStory] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [tiempo, setTiempo] = useState(0);
  const [flotantes, setFlotantes] = useState([]);
  const [maxStoryMb, setMaxStoryMb] = useState(MAX_STORY_MB);
  const videoRef = useRef(null);
  const pausadoRef = useRef(false);
  const elapsedRef = useRef(0);
  const swipeRef = useRef(null);
  const storyViewRef = useRef(null);
  const storyIdRef = useRef(null);
  const subidaXhrRef = useRef(null);
  const [storyCreador, setStoryCreador] = useState(null);
  const [storyTexto, setStoryTexto] = useState('');
  const [storyFile, setStoryFile] = useState(null);
  const [storyPreview, setStoryPreview] = useState('');
  const [subiendoPct, setSubiendoPct] = useState(0);
  const [textoExpandido, setTextoExpandido] = useState(false);

  const [grupos, setGrupos] = useState([]);
  const [destacados, setDestacados] = useState([]);
  const [presencia, setPresencia] = useState([]);
  const [amigos, setAmigos] = useState([]);
  const { abrir: abrirDock } = useChatDock();
  const [mantGrupo, setMantGrupo] = useState(false);
  const [chats, setChats] = useState([]);
  const [maxWindows, setMaxWindows] = useState(3);

  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState('');
  const [abrirCrearGrupo, setAbrirCrearGrupo] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', descripcion: '', reglas: '', privacidad: 'publica', modo_union: 'libre' });
  const [grupoImg, setGrupoImg] = useState(null);
  const [onlineQ, setOnlineQ] = useState('');
  const [onlineLimit, setOnlineLimit] = useState(6);
  const [pedirGrupo, setPedirGrupo] = useState(null);
  const [solGrupoModal, setSolGrupoModal] = useState(null);
  const [reactMenu, setReactMenu] = useState(null);
  const [comentariosDe, setComentariosDe] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [comentarioTexto, setComentarioTexto] = useState('');

  const chatsRef = useRef([]);
  const storiesRef = useRef(null);

  const cargarFeed = useCallback(async () => {
    setCargando(true);
    const r = await apiComunidad.feed('populares', userKey, null);
    setFeed(Array.isArray(r.data) ? r.data : []);
    setCargando(false);
  }, [userKey]);

  // Amigos = contactos con los que ya tienes conversación (no cualquiera).
  const cargarAmigos = useCallback(async () => {
    if (!userKey) { setAmigos([]); return; }
    const dm = await apiComunidad.dmChats(userKey);
    if (Array.isArray(dm?.data)) {
      setAmigos(dm.data.map((c) => ({
        user_key: c.otro_key,
        usuario: c.otro_usuario || c.otro_nombre || 'Usuario',
        avatar: c.otro_avatar,
        no_leidos: c.no_leidos || 0,
        ultimo_creado: c.ultimo_creado,
      })));
    }
  }, [userKey]);

  const cargarTodo = useCallback(async () => {
    const [st, gr, pr, dest] = await Promise.all([
      apiComunidad.stories(),
      apiComunidad.grupos(userKey),
      apiComunidad.presencia(),
      apiComunidad.grupos(userKey, { destacados: true, limit: 4 }),
    ]);
    if (Array.isArray(st.data)) setStories(st.data);
    if (Array.isArray(gr.data)) setGrupos(gr.data);
    if (Array.isArray(pr.data)) setPresencia(pr.data);
    cargarAmigos();
    let destList = Array.isArray(dest.data) ? dest.data : [];
    if (!destList.length && Array.isArray(gr.data)) {
      destList = [...gr.data].sort((a, b) => Number(b.miembros) - Number(a.miembros)).slice(0, 4);
    }
    setDestacados(destList);
  }, [userKey, cargarAmigos]);

  useEffect(() => { cargarFeed(); }, [cargarFeed]);
  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // Límite de subida del usuario (según lo que ponga el admin).
  useEffect(() => {
    if (!userKey) { setMaxStoryMb(MAX_STORY_MB); return; }
    apiComunidad.miLimite(userKey).then((r) => {
      if (typeof r.mb === 'number') setMaxStoryMb(r.mb === -1 ? Infinity : r.mb);
    });
  }, [userKey]);

  // El aviso se borra solo.
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(''), 6000);
    return () => clearTimeout(id);
  }, [msg]);

  // Abre el chat si venimos de /comunidad/grupos con ?grupo=<id>
  const abrioQueryRef = useRef(false);
  useEffect(() => {
    if (abrioQueryRef.current || !grupos.length) return;
    const gid = new URLSearchParams(window.location.search).get('grupo');
    if (!gid) return;
    const g = grupos.find((x) => String(x.id) === String(gid));
    if (g) { abrioQueryRef.current = true; abrirChat(g); }
  }, [grupos]);

  // Presencia: latido + refresco
  useEffect(() => {
    if (!userKey) return;
    apiComunidad.latido(userKey);
    const beat = setInterval(() => apiComunidad.latido(userKey), 60000);
    const poll = setInterval(async () => {
      const r = await apiComunidad.presencia();
      if (Array.isArray(r.data)) setPresencia(r.data);
    }, 30000);
    return () => { clearInterval(beat); clearInterval(poll); };
  }, [userKey]);

  // Mantén una referencia viva de los chats (para el sondeo sin re-suscribir)
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  // Cuántas ventanas de chat se abren como máximo (el resto son burbujas)
  useEffect(() => {
    function calc() {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
      setMaxWindows(w >= 1300 ? 3 : 2);
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const cargarMensajesChat = useCallback(async (id) => {
    const r = await apiComunidad.mensajes(id, userKey);
    if (!Array.isArray(r.data)) return;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, mensajes: r.data } : c)));
  }, [userKey]);

  // Refresca las ventanas abiertas (no las burbujas) cada 10s
  useEffect(() => {
    const id = setInterval(() => {
      chatsRef.current.filter((c) => !c.minimizado).forEach((c) => cargarMensajesChat(c.id));
    }, 10000);
    return () => clearInterval(id);
  }, [cargarMensajesChat]);

  // Flechas del carrusel de historias: solo si hay contenido a los lados.
  useEffect(() => {
    const el = storiesRef.current;
    if (!el) return;
    function upd() {
      setCanStoriesL(el.scrollLeft > 8);
      setCanStoriesR(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    }
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    return () => { el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, [stories.length]);

  // Progreso de la historia actual: video (tiempo real) o 5s en imagen/texto.
  useEffect(() => {
    storyViewRef.current = storyView;
    if (!storyView) { setProgreso(0); storyIdRef.current = null; return; }
    elapsedRef.current = 0;
    pausadoRef.current = false;
    setPausado(false);
    setProgreso(0);
    setDuracion(0);
    setTiempo(0);
    setFlotantes([]);
    setTextoExpandido(false);
    const actual = storyGroups[storyView.gi]?.stories[storyView.i];
    storyIdRef.current = actual?.id || null;
    if (!actual || actual.tipo === 'video') return; // el video maneja su tiempo
    const id = setInterval(() => {
      if (pausadoRef.current) return;
      elapsedRef.current += 50;
      const p = Math.min(100, (elapsedRef.current / 5000) * 100);
      setProgreso(p);
      if (p >= 100) irHistoria(1);
    }, 50);
    return () => clearInterval(id);
  }, [storyView?.gi, storyView?.i]);

  // Tiempo real (Redis -> SSE): refresca feed, chats, presencia y grupos al instante.
  useEffect(() => {
    function onCambio(e) {
      const tipo = String(e?.detail?.type || '');
      if (!tipo.startsWith('comunidad_')) return;
      if (['comunidad_post', 'comunidad_comment', 'comunidad_post_like', 'comunidad_post_share', 'comunidad_post_save'].includes(tipo)) {
        cargarFeed();
      }
      if (tipo === 'comunidad_mensaje' || tipo === 'comunidad_reaccion') {
        chatsRef.current.filter((c) => !c.minimizado).forEach((c) => cargarMensajesChat(c.id));
      }
      if (tipo === 'comunidad_presencia') {
        apiComunidad.presencia().then((r) => { if (Array.isArray(r.data)) setPresencia(r.data); });
      }
      if (['comunidad_story', 'comunidad_grupo', 'comunidad_join', 'comunidad_solicitud'].includes(tipo)) {
        cargarTodo();
      }
      if (tipo === 'comunidad_dm') {
        cargarAmigos();
      }
      if (tipo === 'comunidad_story_reaccion') {
        const p = e?.detail?.payload;
        if (p?.emoji && p?.id === storyIdRef.current) lanzarReaccion(p.emoji);
      }
    }
    window.addEventListener('pikantepe:change', onCambio);
    return () => window.removeEventListener('pikantepe:change', onCambio);
  }, [cargarFeed, cargarMensajesChat, cargarTodo, cargarAmigos]);

  function requireAuth() {
    if (authed) return true;
    setAuthOpen(true);
    return false;
  }

  async function alternarLike(p) {
    if (!requireAuth()) return;
    const r = await apiComunidad.like(p.id, userKey);
    if (r.error) return;
    setFeed((list) => list.map((x) => x.id === p.id
      ? { ...x, liked: r.liked, likes: Math.max(0, x.likes + (r.liked ? 1 : -1)) } : x));
  }

  async function alternarGuardar(p) {
    if (!requireAuth()) return;
    const r = await apiComunidad.guardar(p.id, userKey);
    if (r.error) return;
    setFeed((list) => list.map((x) => (x.id === p.id ? { ...x, saved: r.saved } : x)));
  }

  async function compartir(p) {
    apiComunidad.compartir(p.id);
    const url = `${window.location.origin}/comunidad`;
    try { await navigator.clipboard.writeText(url); setMsg(es ? 'Enlace copiado.' : 'Link copied.'); } catch { /* noop */ }
  }

  async function abrirComentarios(p) {
    if (comentariosDe === p.id) { setComentariosDe(null); return; }
    setComentariosDe(p.id);
    setComentarioTexto('');
    const r = await apiComunidad.comentarios(p.id);
    setComentarios(Array.isArray(r.data) ? r.data : []);
  }

  async function comentar(p) {
    if (!requireAuth()) return;
    const tx = comentarioTexto.trim();
    if (!tx) return;
    const r = await apiComunidad.comentar(p.id, userKey, tx);
    if (r.error) return;
    setComentarios((c) => [...c, r.comentario]);
    setComentarioTexto('');
    setFeed((list) => list.map((x) => (x.id === p.id ? { ...x, comentarios: x.comentarios + 1 } : x)));
  }

  /** ¿El usuario puede entrar al chat del grupo? */
  function accesoGrupo(g) {
    return !!(g.miembro || g.soy_dueno) || (g.privacidad !== 'privada' && g.modo_union !== 'invitacion');
  }

  /** ¿El grupo pide aprobación para entrar? */
  function requiereAprobacion(g) {
    return g.privacidad === 'privada' || g.modo_union === 'invitacion';
  }

  function pedirEntrar(g) {
    if (!requireAuth()) return;
    setPedirGrupo({ grupo: g, texto: '' });
  }

  async function enviarSolicitud() {
    if (!pedirGrupo) return;
    const g = pedirGrupo.grupo;
    const r = await apiComunidad.unirse(g.id, userKey, pedirGrupo.texto);
    if (r.error) { setMsg(r.error); return; }
    setMsg(es ? 'Solicitud enviada. El creador o un admin debe aprobarte.' : 'Request sent. The owner or an admin must approve you.');
    setPedirGrupo(null);
    cargarTodo();
  }

  async function unirse(g) {
    if (!requireAuth()) return;
    if (!g.miembro && (g.privacidad === 'privada' || g.modo_union === 'invitacion')) { pedirEntrar(g); return; }
    const r = await apiComunidad.unirse(g.id, userKey);
    if (r.error) { setMsg(r.error); return; }
    if (r.pending) { setMsg(es ? 'Solicitud enviada.' : 'Request sent.'); cargarTodo(); return; }
    setGrupos((list) => list.map((x) => (x.id === g.id
      ? { ...x, miembros: Math.max(0, x.miembros + (r.joined ? 1 : -1)), miembro: r.joined } : x)));
    setChats((prev) => prev.map((c) => (c.id === g.id
      ? { ...c, puedeEscribir: !!r.joined, grupo: { ...c.grupo, miembro: r.joined } } : c)));
  }

  async function verSolicitudes(g) {
    if (!requireAuth()) return;
    const r = await apiComunidad.solicitudesGrupo(g.id, userKey);
    if (r.error) { setMsg(r.error); return; }
    setSolGrupoModal({ grupo: g, lista: Array.isArray(r.data) ? r.data : [] });
  }

  async function resolverSolicitudG(estado, sol) {
    if (!solGrupoModal) return;
    const g = solGrupoModal.grupo;
    const r = await apiComunidad.resolverSolicitudGrupo(g.id, sol.id, userKey, estado);
    if (r.error) { setMsg(r.error); return; }
    setSolGrupoModal((m) => (m ? { ...m, lista: m.lista.map((x) => (x.id === sol.id ? { ...x, estado } : x)) } : m));
    cargarTodo();
  }

  async function crearGrupo() {
    if (!requireAuth()) return;
    if (!nuevoGrupo.nombre.trim()) return;
    setSubiendo(true);
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('nombre', nuevoGrupo.nombre.trim());
    fd.append('descripcion', nuevoGrupo.descripcion);
    fd.append('reglas', nuevoGrupo.reglas);
    fd.append('privacidad', nuevoGrupo.privacidad);
    fd.append('modo_union', nuevoGrupo.modo_union);
    if (grupoImg) fd.append('avatar', await comprimirImagen(grupoImg, 720, 0.82));
    const r = await apiComunidad.crearGrupo(fd);
    setSubiendo(false);
    if (r.error) { setMsg(r.error); return; }
    setNuevoGrupo({ nombre: '', descripcion: '', reglas: '', privacidad: 'publica', modo_union: 'libre' });
    setGrupoImg(null);
    setAbrirCrearGrupo(false);
    setMsg(es ? 'Comunidad creada.' : 'Community created.');
    cargarTodo();
  }

  function cerrarStoryCreador() {
    setStoryCreador(null);
    setStoryTexto('');
    setStoryFile(null);
    setStoryPreview((old) => { if (old) URL.revokeObjectURL(old); return ''; });
    setSubiendoPct(0);
  }

  function quitarStoryMedia() {
    setStoryFile(null);
    setStoryPreview((old) => { if (old) URL.revokeObjectURL(old); return ''; });
  }

  function cancelarSubida() {
    try { subidaXhrRef.current?.abort(); } catch { /* noop */ }
    subidaXhrRef.current = null;
    setSubiendo(false);
    setSubiendoPct(0);
  }

  /** Elige la media de la historia (límite de peso según el usuario). */
  function elegirStoryMedia(file) {
    if (!file) return;
    if (Number.isFinite(maxStoryMb) && file.size > maxStoryMb * 1024 * 1024) {
      setMsg(es
        ? `El archivo pasa de tu límite (${maxStoryMb} MB). Contacta con el admin para una cuenta con más límites y desbloquear más cosas.`
        : `File exceeds your limit (${maxStoryMb} MB). Contact the admin for an account with more limits.`);
      return;
    }
    setStoryFile(file);
    setStoryPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
  }

  function abrirGrupoHistorias(gi) {
    const gp = storyGroups[gi];
    if (!gp) return;
    setStoryView({ gi, i: 0 });
    apiComunidad.verStory(gp.stories[0]?.id, userKey);
  }

  /** Navega dentro del grupo y salta al siguiente usuario al terminar. */
  function irHistoria(delta) {
    setStoryView((v) => {
      if (!v) return v;
      let gi = v.gi;
      let i = v.i + delta;
      const grupoActual = storyGroups[gi];
      if (i < 0) {
        if (gi <= 0) return { gi: 0, i: 0 };
        gi -= 1;
        i = (storyGroups[gi]?.stories.length || 1) - 1;
      } else if (i >= (grupoActual?.stories.length || 1)) {
        if (gi >= storyGroups.length - 1) return null; // se acabaron todas
        gi += 1;
        i = 0;
      }
      apiComunidad.verStory(storyGroups[gi]?.stories[i]?.id, userKey);
      return { gi, i };
    });
  }

  function scrollStories(dir) {
    const el = storiesRef.current;
    if (el) el.scrollBy({ left: dir * 320, behavior: 'smooth' });
  }

  function lanzarReaccion(emoji) {
    if (!emoji) return;
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item = { key, emoji, left: 12 + Math.random() * 70 };
    setFlotantes((prev) => [...prev, item]);
    setTimeout(() => setFlotantes((prev) => prev.filter((f) => f.key !== key)), 2600);
  }

  function reaccionarHistoria(story, emoji) {
    if (!authed) { setAuthOpen(true); return; }
    if (!story?.id) return;
    apiComunidad.reaccionarStory(story.id, userKey, emoji, '');
    lanzarReaccion(emoji);
    setMsg(es ? 'Reacción enviada.' : 'Reaction sent.');
  }

  function enviarRespuestaHistoria(story) {
    if (!authed) { setAuthOpen(true); return; }
    const tx = respuesta.trim();
    if (!tx || !story?.id) return;
    apiComunidad.reaccionarStory(story.id, userKey, '', tx);
    setRespuesta('');
    setMsg(es ? 'Respuesta enviada.' : 'Reply sent.');
  }

  function togglePlayStory() {
    const v = videoRef.current;
    if (v) {
      if (v.paused) { v.play().catch(() => {}); setPausado(false); pausadoRef.current = false; }
      else { v.pause(); setPausado(true); pausadoRef.current = true; }
    } else {
      const n = !pausadoRef.current;
      pausadoRef.current = n;
      setPausado(n);
    }
  }

  function reportarHistoria(story) {
    if (!authed) { setAuthOpen(true); return; }
    if (!story?.id) return;
    apiComunidad.reportar({ userKey, tipo: 'story', target_id: story.id, motivo: 'revision' });
    setMenuStory(false);
    setMsg(es ? 'Historia reportada. Gracias.' : 'Story reported. Thanks.');
  }

  function storySwipeStart(e) { swipeRef.current = e.clientX; }
  function storySwipeEnd(e) {
    if (swipeRef.current == null) return;
    const dx = e.clientX - swipeRef.current;
    swipeRef.current = null;
    if (Math.abs(dx) < 50) return;
    irHistoria(dx < 0 ? 1 : -1);
  }

  async function publicarStory() {
    if (!requireAuth()) return;
    if (storyCreador === 'media' && !storyFile) return;
    if (storyCreador === 'texto' && !storyTexto.trim()) return;
    setSubiendo(true); setMsg(''); setSubiendoPct(0);
    const fd = new FormData();
    fd.append('userKey', userKey);
    if (storyTexto.trim()) fd.append('texto', storyTexto.trim());
    let r;
    if (storyFile) {
      fd.append('media', await comprimirImagen(storyFile));
      const { xhr, promise } = apiComunidad.subirStoryXHR(fd, (p) => setSubiendoPct(p));
      subidaXhrRef.current = xhr;
      r = await promise;
      subidaXhrRef.current = null;
    } else {
      r = await apiComunidad.subirStory(fd);
    }
    setSubiendo(false);
    if (r.aborted) { setMsg(es ? 'Subida cancelada.' : 'Upload cancelled.'); return; }
    if (r.error) { setMsg(r.error); return; }
    if (r.story) setStoryView({ grupo: { usuario: user?.usuario || '', avatar: user?.avatar || '', stories: [r.story] }, i: 0 });
    cerrarStoryCreador();
    cargarTodo();
  }

  /** Ordena los chats: máximo maxWindows ventanas; el resto pasa a burbuja. */
  function ordenarChats(list) {
    let out = [...list];
    while (out.length > maxWindows * 2) out = out.slice(1);
    const expandidas = out.filter((c) => !c.minimizado).length;
    if (expandidas > maxWindows) {
      let aMin = expandidas - maxWindows;
      out = out.map((c) => {
        if (!c.minimizado && aMin > 0) { aMin -= 1; return { ...c, minimizado: true }; }
        return c;
      });
    }
    return out;
  }

  function esMovil() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  }

  function abrirChat(g) {
    // En celular se abre el chat a pantalla completa; en PC, modal de mantenimiento.
    if (esMovil()) {
      if (g && g.id) router.push(`/chat?conv=${encodeURIComponent(g.id)}`);
      return;
    }
    setMantGrupo(true);
  }

  function abrirAmigo(u) {
    if (esMovil()) {
      router.push(`/chat?dm=${encodeURIComponent(u.user_key)}`);
      return;
    }
    abrirDock({ user_key: u.user_key, usuario: u.usuario, avatar: u.avatar }, 'dm');
  }

  function cerrarChat(id) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, cerrando: true } : c)));
    setTimeout(() => setChats((prev) => prev.filter((c) => c.id !== id)), 180);
  }

  function minimizarChat(id) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, minimizado: true, cerrando: false } : c)));
  }

  function restaurarChat(id) {
    setChats((prev) => ordenarChats(prev.map((c) => (c.id === id ? { ...c, minimizado: false, cerrando: false } : c))));
  }

  function setBorrador(id, valor) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, borrador: valor } : c)));
  }

  async function enviarMensaje(id) {
    const chat = chatsRef.current.find((c) => c.id === id);
    if (!chat || !chat.puedeEscribir) return;
    const texto = (chat.borrador || '').trim();
    if (!texto) return;
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('texto', texto);
    if (chat.respondiendo) fd.append('reply_to', String(chat.respondiendo.id));
    const r = await apiComunidad.enviarMensaje(id, fd);
    if (r.error) { setMsg(r.error); return; }
    const nuevo = { ...r.mensaje, reacciones: [] };
    if (chat.respondiendo) {
      nuevo.reply_usuario = chat.respondiendo.usuario;
      nuevo.reply_texto = chat.respondiendo.texto || '';
    }
    setChats((prev) => prev.map((c) => (c.id === id
      ? { ...c, mensajes: [...c.mensajes, nuevo], borrador: '', respondiendo: null } : c)));
  }

  function setRespondiendo(id, msj) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, respondiendo: msj } : c)));
  }

  async function reaccionar(id, msj, emoji) {
    setReactMenu(null);
    if (!authed) { setAuthOpen(true); return; }
    const chat = chatsRef.current.find((c) => c.id === id);
    if (chat && !chat.puedeEscribir) return;
    const r = await apiComunidad.reaccionarMensaje(msj.id, userKey, emoji);
    if (r.error) { setMsg(r.error); return; }
    cargarMensajesChat(id);
  }

  function reportar(p) {
    if (!requireAuth()) return;
    apiComunidad.reportar({ userKey, tipo: 'post', target_id: p.id, comunidad_id: p.comunidad_id, motivo: 'revision' });
    setMsg(es ? 'Reportado. Gracias, lo revisaremos.' : 'Reported. Thanks, we will review it.');
  }

  // Amigos = contactos con los que ya tienes conversación (no cualquiera).
  const onlineSet = useMemo(() => new Set(presencia.map((p) => String(p.user_key))), [presencia]);
  const amigosFiltrados = useMemo(() => {
    const q = onlineQ.trim().toLowerCase();
    const yo = String(userKey || '');
    return amigos
      .filter((u) => !q || String(u.usuario || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Mi propio chat (conmigo mismo) siempre primero.
        const sa = String(a.user_key) === yo ? 1 : 0;
        const sb = String(b.user_key) === yo ? 1 : 0;
        if (sa !== sb) return sb - sa;
        const oa = onlineSet.has(String(a.user_key)) ? 1 : 0;
        const ob = onlineSet.has(String(b.user_key)) ? 1 : 0;
        if (oa !== ob) return ob - oa;
        return new Date(b.ultimo_creado || 0) - new Date(a.ultimo_creado || 0);
      });
  }, [amigos, onlineQ, onlineSet, userKey]);

  // Nunca deja la columna vacía: si no hay destacados, usa los más visitados.
  const gruposDestacados = destacados.length
    ? destacados
    : [...grupos].sort((a, b) => Number(b.miembros) - Number(a.miembros)).slice(0, 4);

  // Agrupa las historias por usuario (varias del mismo usuario = una sola tarjeta).
  const storyGroups = (() => {
    const map = new Map();
    for (const s of stories) {
      const k = s.user_key || s.usuario;
      if (!map.has(k)) map.set(k, { key: k, usuario: s.usuario, avatar: s.avatar, stories: [] });
      map.get(k).stories.push(s);
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.stories.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return arr;
  })();

  return (
    <main className={styles.main}>
      <div className={styles.grid}>
        {/* ===== CENTRO: FEED ===== */}
        <section className={styles.center}>
          {/* ===== STORIES ===== */}
          <div className={styles.storiesWrap}>
            <div className={styles.storiesBar} ref={storiesRef}>
              <button type="button" className={styles.createCard} onClick={() => { if (requireAuth()) setStoryCreador('choose'); }}>
                <span className={styles.createCardTop}>
                  {user?.avatar ? <img src={comunidadMedia(user.avatar)} alt="" /> : <span className={styles.createCardInitial}>{ini(user?.usuario)}</span>}
                </span>
                <span className={styles.createCardPlus}><ion-icon name="add" suppressHydrationWarning></ion-icon></span>
                <span className={styles.createCardLabel}>{es ? 'Crear historia' : 'Create story'}</span>
              </button>

              {storyGroups.map((gp, gi) => {
                const cover = gp.stories.find((s) => s.media) || gp.stories[0];
                return (
                  <button key={gp.key} type="button" className={styles.storyCard} onClick={() => abrirGrupoHistorias(gi)}>
                    {gp.stories.length > 1 && (
                      <span className={styles.storyCardSegs}>
                        {gp.stories.map((s, i) => <span key={`seg-${i}`} className={styles.storyCardSeg} />)}
                      </span>
                    )}
                    {cover?.media && cover.tipo === 'video'
                      ? <video className={styles.storyCardImg} src={comunidadMedia(cover.media)} muted playsInline preload="metadata" />
                      : cover?.media
                        ? <img className={styles.storyCardImg} src={comunidadMedia(cover.media)} alt="" />
                        : <span className={styles.storyCardText}>{cover?.texto || gp.usuario}</span>}
                    <span className={styles.storyCardGrad} />
                    <span className={styles.storyCardAvatar}>
                      {gp.avatar ? <img src={comunidadMedia(gp.avatar)} alt="" /> : ini(gp.usuario)}
                    </span>
                    <span className={styles.storyCardName}>{gp.usuario}</span>
                  </button>
                );
              })}
            </div>
            {canStoriesL && (
              <button type="button" className={`${styles.storyArrow} ${styles.storyArrowL}`} onClick={() => scrollStories(-1)} aria-label="Anterior">
                <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
            {canStoriesR && (
              <button type="button" className={`${styles.storyArrow} ${styles.storyArrowR}`} onClick={() => scrollStories(1)} aria-label="Siguiente">
                <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
              </button>
            )}
          </div>

          {msg && <div className={styles.toast}>{msg}</div>}

          <div className={styles.ranking}>
            <span className={styles.rankingHead}>
              <ion-icon name="trophy-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Comunidades destacadas' : 'Top communities'}
            </span>
            {[...grupos].sort((a, b) => Number(b.miembros) - Number(a.miembros)).slice(0, 5).map((g, i) => (
              <button key={g.id} type="button" className={styles.rankItem} onClick={() => abrirChat(g)}>
                <span className={styles.rankNum}>#{i + 1}</span>
                <span>{g.nombre}</span>
                <span className={styles.rankMeta}>
                  {Number(g.miembros).toLocaleString(es ? 'es-PE' : 'en-US')} · {g.activos || 0} {es ? 'activos' : 'active'}
                </span>
              </button>
            ))}
          </div>

          <p className={styles.sectionLabel}>
            <ion-icon name="flame-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Publicaciones populares del chat global' : 'Popular posts from the global chat'}
          </p>

          {cargando ? (
            <p className={styles.empty}>{es ? 'Cargando...' : 'Loading...'}</p>
          ) : feed.length === 0 ? (
            <p className={styles.empty}>{es ? 'Aún no hay publicaciones. ¡Sé el primero!' : 'No posts yet. Be the first!'}</p>
          ) : (
            feed.map((p) => (
              <article key={p.id} className={styles.post}>
                <header className={styles.postHead}>
                  <span className={styles.avatarSm}>{p.avatar ? <img src={comunidadMedia(p.avatar)} alt="" /> : ini(p.usuario)}</span>
                  <div className={styles.postWho}>
                    <span className={styles.postUser}>{p.usuario}</span>
                    {p.grupo_nombre && <span className={styles.postGroup}>· {p.grupo_nombre}</span>}
                    <span className={styles.postTime}>{fecha(p.created_at, es ? 'es' : 'en')}</span>
                  </div>
                  <button type="button" className={styles.iconBtn} onClick={() => reportar(p)} title={es ? 'Reportar' : 'Report'}>
                    <ion-icon name="flag-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </header>

                {p.texto && <p className={styles.postText}>{p.texto}</p>}

                {Array.isArray(p.media) && p.media.length > 0 && (
                  <div className={styles.mediaGrid}>
                    {p.media.map((m, i) => (
                      <div key={`${p.id}-${i}`} className={styles.mediaItem}>
                        {m.tipo === 'video' ? (
                          <video src={comunidadMedia(m.url)} controls preload="metadata" playsInline onPlay={(e) => soloUnoPlay(e.currentTarget)} />
                        ) : m.tipo === 'audio' ? (
                          <audio src={comunidadMedia(m.url)} controls onPlay={(e) => soloUnoPlay(e.currentTarget)} />
                        ) : (
                          <img src={comunidadMedia(m.url)} alt="" loading="lazy" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.postActions}>
                  <button type="button" className={`${styles.action} ${p.liked ? styles.actionOn : ''}`} onClick={() => alternarLike(p)}>
                    <ion-icon name={p.liked ? 'heart' : 'heart-outline'} suppressHydrationWarning></ion-icon> {p.likes}
                  </button>
                  <button type="button" className={styles.action} onClick={() => abrirComentarios(p)}>
                    <ion-icon name="chatbubble-outline" suppressHydrationWarning></ion-icon> {p.comentarios}
                  </button>
                  <button type="button" className={styles.action} onClick={() => compartir(p)}>
                    <ion-icon name="share-social-outline" suppressHydrationWarning></ion-icon> {p.compartidos}
                  </button>
                  <button type="button" className={`${styles.action} ${styles.actionRight} ${p.saved ? styles.actionOn : ''}`} onClick={() => alternarGuardar(p)}>
                    <ion-icon name={p.saved ? 'bookmark' : 'bookmark-outline'} suppressHydrationWarning></ion-icon>
                  </button>
                </div>

                {comentariosDe === p.id && (
                  <div className={styles.comments}>
                    {comentarios.map((c) => (
                      <div key={c.id} className={styles.comment}>
                        <span className={styles.avatarXs}>{c.avatar ? <img src={comunidadMedia(c.avatar)} alt="" /> : ini(c.usuario)}</span>
                        <div>
                          <span className={styles.commentUser}>{c.usuario}</span>
                          <p className={styles.commentText}>{c.texto}</p>
                        </div>
                      </div>
                    ))}
                    <div className={styles.commentRow}>
                      <input className={styles.input} placeholder={es ? 'Escribe un comentario...' : 'Write a comment...'}
                        value={comentarioTexto} onChange={(e) => setComentarioTexto(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') comentar(p); }} />
                      <button type="button" className={styles.primaryBtn} onClick={() => comentar(p)}>{t('comentarios.comentar') || 'Enviar'}</button>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        {/* ===== DERECHA: GRUPOS + AMIGOS ===== */}
        <aside className={styles.right}>
          <div className={styles.card}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>{es ? 'Grupos y Comunidades' : 'Groups & Communities'}</span>
              <button type="button" className={styles.iconBtn} onClick={() => requireAuth() && setAbrirCrearGrupo((v) => !v)} aria-label="Crear grupo">
                <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>

            {abrirCrearGrupo && (
              <div className={styles.card}>
                <input className={styles.input} placeholder={es ? 'Nombre del grupo' : 'Group name'} value={nuevoGrupo.nombre}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })} />
                <label className={styles.fileRow}>
                  <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                  {grupoImg ? grupoImg.name : (es ? 'Imagen del grupo (opcional)' : 'Group image (optional)')}
                  <input type="file" accept="image/*" className={styles.hidden}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setGrupoImg(f); }} />
                </label>
                <textarea className={styles.textarea} rows={2} placeholder={es ? 'Descripción' : 'Description'} value={nuevoGrupo.descripcion}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, descripcion: e.target.value })} />
                <textarea className={styles.textarea} rows={2} placeholder={es ? 'Reglas del grupo' : 'Group rules'} value={nuevoGrupo.reglas}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, reglas: e.target.value })} />
                <select className={styles.select} value={nuevoGrupo.privacidad}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, privacidad: e.target.value })}>
                  <option value="publica">{es ? 'Pública' : 'Public'}</option>
                  <option value="privada">{es ? 'Privada' : 'Private'}</option>
                </select>
                <select className={styles.select} value={nuevoGrupo.modo_union}
                  onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, modo_union: e.target.value })}>
                  <option value="libre">{es ? 'Unirse directo' : 'Join directly'}</option>
                  <option value="invitacion">{es ? 'Con invitación / aprobación' : 'By invitation / approval'}</option>
                </select>
                <button type="button" className={styles.primaryBtn} onClick={crearGrupo} disabled={subiendo}>
                  <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Crear comunidad' : 'Create community'}
                </button>
              </div>
            )}

            <div className={styles.groupList}>
              {gruposDestacados.map((g) => (
                <div key={g.id} className={styles.groupCard}>
                  <button type="button" className={styles.groupMain} onClick={() => abrirChat(g)}>
                    {g.avatar
                      ? <img className={styles.groupAvatar} src={comunidadMedia(g.avatar)} alt="" />
                      : <span className={styles.groupAvatar}>{ini(g.nombre)}</span>}
                    <span className={styles.groupInfo}>
                      <strong>{g.nombre}</strong>
                      <span className={styles.groupMeta}>
                        <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                        {Number(g.miembros).toLocaleString(es ? 'es-PE' : 'en-US')} {es ? 'miembros' : 'members'}
                      </span>
                      <span className={styles.groupMeta}>
                        <ion-icon name="radio-button-on" className={styles.onIcon} suppressHydrationWarning></ion-icon>
                        {g.activos || 0} {es ? 'activos' : 'active'}
                        <ion-icon name="folder-outline" suppressHydrationWarning></ion-icon>
                        {g.archivos || 0} {es ? 'archivos' : 'files'}
                      </span>
                      <span className={styles.groupBadges}>
                        <span className={g.privacidad === 'privada' ? styles.groupPriv : styles.groupPub}>
                          {g.privacidad === 'privada' ? (es ? 'Privada' : 'Private') : (es ? 'Pública' : 'Public')}
                        </span>
                        <span className={(g.privacidad === 'privada' || g.modo_union === 'invitacion') ? styles.groupPriv : styles.groupPub}>
                          {(g.privacidad === 'privada' || g.modo_union === 'invitacion') ? (es ? 'Invitación' : 'Invite') : (es ? 'Unirse directo' : 'Open join')}
                        </span>
                        {g.solicitud === 'pendiente' && (
                          <span className={styles.groupPend}>{es ? 'Solicitud pendiente' : 'Pending request'}</span>
                        )}
                        {g.miembro && <span className={styles.groupPub}>{es ? 'Miembro' : 'Member'}</span>}
                      </span>
                    </span>
                  </button>
                  <div className={styles.groupActions}>
                    {g.soy_dueno && (
                      <button type="button" className={styles.iconBtn} onClick={() => verSolicitudes(g)} title={es ? 'Solicitudes' : 'Requests'}>
                        <ion-icon name="mail-unread-outline" suppressHydrationWarning></ion-icon>
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => unirse(g)}
                      title={g.miembro ? (es ? 'Salir' : 'Leave')
                        : (g.privacidad === 'privada' || g.modo_union === 'invitacion') ? (es ? 'Pedir entrar' : 'Ask to join')
                          : (es ? 'Unirme' : 'Join')}
                    >
                      <ion-icon
                        name={g.miembro ? 'exit-outline'
                          : g.solicitud === 'pendiente' ? 'hourglass-outline'
                            : (g.privacidad === 'privada' || g.modo_union === 'invitacion') ? 'lock-closed-outline'
                              : 'person-add-outline'}
                        suppressHydrationWarning
                      ></ion-icon>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <a href="/comunidad/grupos" className={styles.verTodas}>
              {es ? 'Ver todas las comunidades' : 'See all communities'}
              <ion-icon name="arrow-forward-outline" suppressHydrationWarning></ion-icon>
            </a>
          </div>

          <div className={styles.card}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>
                {es ? `Amigos (${amigos.length})` : `Friends (${amigos.length})`}
                <ion-icon name="ellipse" className={styles.dotGreen} suppressHydrationWarning></ion-icon>
              </span>
            </div>
            <input
              className={styles.inputSm}
              placeholder={es ? 'Buscar amigo para chatear...' : 'Search a friend to chat...'}
              value={onlineQ}
              onChange={(e) => { setOnlineQ(e.target.value); setOnlineLimit(6); }}
            />
            {amigosFiltrados.length === 0 ? (
              <p className={styles.emptySm}>
                {amigos.length === 0
                  ? (es ? 'Aún no tienes amigos. Escríbele a alguien para agregarlo.' : 'No friends yet. Message someone to add them.')
                  : (es ? 'Sin resultados.' : 'No results.')}
              </p>
            ) : (
              <div
                className={styles.onlineList}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
                    setOnlineLimit((n) => Math.min(n + 8, amigosFiltrados.length));
                  }
                }}
              >
                {amigosFiltrados.slice(0, onlineLimit).map((u) => (
                  <div
                    key={u.user_key}
                    className={styles.onlineItem}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrirAmigo(u)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirAmigo(u); } }}
                    title={es ? 'Enviar mensaje' : 'Send message'}
                  >
                    <span className={styles.avatarSm}>{u.avatar ? <img src={comunidadMedia(u.avatar)} alt="" /> : ini(u.usuario)}</span>
                    <div>
                      <span className={styles.onlineName}>
                        {u.usuario}{String(u.user_key) === String(userKey) ? (es ? ' (Tú)' : ' (You)') : ''}
                      </span>
                      <span className={`${styles.onlineState} ${onlineSet.has(String(u.user_key)) ? '' : styles.onlineStateOff}`}>
                        {onlineSet.has(String(u.user_key)) ? (es ? 'en línea' : 'online') : (es ? 'desconectado' : 'offline')}
                      </span>
                    </div>
                    <ion-icon name="chatbubble-ellipses-outline" className={styles.onlineChatIcon} suppressHydrationWarning></ion-icon>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ===== Viewer de historia (pantalla completa) ===== */}
      {storyView && (() => {
        const gp = storyGroups[storyView.gi];
        if (!gp) return null;
        const actual = gp.stories[storyView.i] || {};
        const puedePrev = !(storyView.gi === 0 && storyView.i === 0);
        const haySiguiente = storyView.gi < storyGroups.length - 1 || storyView.i < gp.stories.length - 1;
        return (
          <div className={styles.viewer}>
            <div
              className={styles.viewerCard}
              onPointerDown={storySwipeStart}
              onPointerUp={storySwipeEnd}
            >
              <div className={styles.viewerHead}>
                <button type="button" className={styles.viewerX} onClick={() => setStoryView(null)} aria-label="Cerrar">
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
                <span className={styles.viewerAvatar}>
                  {gp.avatar ? <img src={comunidadMedia(gp.avatar)} alt="" /> : ini(gp.usuario)}
                </span>
                <span className={styles.viewerName}>{gp.usuario}</span>
                <span className={styles.viewerTime}>{hace(actual.created_at, es ? 'es' : 'en')}</span>
                <ion-icon name="earth-outline" className={styles.viewerGlobe} suppressHydrationWarning></ion-icon>
                <span className={styles.viewerSpacer} />
                <button type="button" className={styles.viewerIcon} onClick={() => setMute((m) => !m)} aria-label="Silenciar">
                  <ion-icon name={mute ? 'volume-mute-outline' : 'volume-high-outline'} suppressHydrationWarning></ion-icon>
                </button>
                <button type="button" className={styles.viewerIcon} onClick={togglePlayStory} aria-label={pausado ? 'Reproducir' : 'Pausar'}>
                  <ion-icon name={pausado ? 'play-sharp' : 'pause-sharp'} suppressHydrationWarning></ion-icon>
                </button>
                <div className={styles.viewerMenuWrap}>
                  <button type="button" className={styles.viewerIcon} onClick={() => setMenuStory((v) => !v)} aria-label="Opciones">
                    <ion-icon name="ellipsis-horizontal" suppressHydrationWarning></ion-icon>
                  </button>
                  {menuStory && (
                    <div className={styles.viewerMenu}>
                      <button type="button" className={styles.viewerMenuItem} onClick={() => reportarHistoria(actual)}>
                        <ion-icon name="flag-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'Reportar' : 'Report'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.viewerBody}>
                {actual.media ? (
                  <div className={styles.mediaBox}>
                    {actual.tipo === 'video'
                      ? (
                        <video
                          ref={videoRef}
                          className={styles.viewerVideo}
                          src={comunidadMedia(actual.media)}
                          autoPlay
                          muted={mute}
                          playsInline
                          disablePictureInPicture
                          controlsList="nodownload nofullscreen noremoteplayback"
                          onContextMenu={(e) => e.preventDefault()}
                          onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration || 0)}
                          onPlay={() => { setPausado(false); pausadoRef.current = false; }}
                          onPause={() => { setPausado(true); pausadoRef.current = true; }}
                          onTimeUpdate={(e) => {
                            const v = e.currentTarget;
                            setTiempo(v.currentTime || 0);
                            if (v.duration) setProgreso((v.currentTime / v.duration) * 100);
                          }}
                          onEnded={() => irHistoria(1)}
                        />
                      )
                      : <img className={styles.viewerMedia} src={comunidadMedia(actual.media)} alt="" />}

                    {actual.texto && (
                      <div className={`${styles.captionOverlay} ${textoExpandido ? styles.captionOverlayFull : ''}`}>
                        <p className={`${styles.captionText} ${textoExpandido ? styles.captionTextFull : ''}`}>{actual.texto}</p>
                        <button
                          type="button"
                          className={styles.captionBtn}
                          onClick={(e) => { e.stopPropagation(); setTextoExpandido((v) => !v); }}
                        >
                          {textoExpandido ? (es ? 'Ver menos' : 'See less') : (es ? 'Ver más' : 'See more')}
                        </button>
                      </div>
                    )}

                    <div className={styles.viewerFloats} aria-hidden="true">
                      {flotantes.map((f) => (
                        <span key={f.key} className={styles.viewerFloat} style={{ left: `${f.left}%` }}>{f.emoji}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className={`${styles.viewerTexto} ${textoExpandido ? styles.viewerTextoFull : ''}`}>{actual.texto}</p>
                    {!textoExpandido && actual.texto && actual.texto.length > 140 && (
                      <button type="button" className={styles.verMas} onClick={() => setTextoExpandido(true)}>
                        {es ? 'Ver más' : 'See more'}
                      </button>
                    )}
                    <div className={styles.viewerFloats} aria-hidden="true">
                      {flotantes.map((f) => (
                        <span key={f.key} className={styles.viewerFloat} style={{ left: `${f.left}%` }}>{f.emoji}</span>
                      ))}
                    </div>
                  </>
                )}

                {actual.tipo === 'video' && (
                  <div className={styles.viewerSeek}>
                    <input
                      type="range"
                      min={0}
                      max={duracion || 0}
                      step={0.1}
                      value={Math.min(tiempo, duracion || 0)}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        if (videoRef.current) videoRef.current.currentTime = t;
                        setTiempo(t);
                      }}
                      className={styles.viewerSeekInput}
                      aria-label="Tiempo del video"
                    />
                    <div className={styles.viewerSeekTimes}>
                      <span>{mmss(tiempo)}</span>
                      <span>{mmss(duracion)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.viewerFoot}>
                <div className={styles.viewerReplyRow}>
                  <input
                    className={styles.viewerInput}
                    placeholder={es ? 'Enviar mensaje...' : 'Send message...'}
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') enviarRespuestaHistoria(actual); }}
                  />
                  <div className={styles.viewerReact}>
                    {['👍', '❤️', '😆', '😮', '😢', '😡'].map((e) => (
                      <button key={e} type="button" className={styles.viewerReactBtn} onClick={() => reaccionarHistoria(actual, e)}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.viewerProgress}>
                  {gp.stories.map((s, i) => (
                    <span key={`pg-${i}`} className={styles.viewerSeg}>
                      <span
                        className={styles.viewerSegFill}
                        style={{ width: i < storyView.i ? '100%' : i === storyView.i ? `${progreso}%` : '0%' }}
                      />
                    </span>
                  ))}
                </div>
              </div>

              {puedePrev && (
                <button type="button" className={`${styles.viewerArrow} ${styles.viewerArrowL}`} onClick={() => irHistoria(-1)} aria-label="Anterior">
                  <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
              {haySiguiente && (
                <button type="button" className={`${styles.viewerArrow} ${styles.viewerArrowR}`} onClick={() => irHistoria(1)} aria-label="Siguiente">
                  <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ===== Dock de chats (ventanas al costado + burbujas) ===== */}
      {chats.length > 0 && (
        <div className={styles.chatsDock}>
          {/* Ventanas abiertas: en fila, pegadas al borde derecho */}
          <div className={styles.chatWindows}>
            {chats.filter((c) => !c.minimizado).map((c) => (
              <div key={c.id} className={styles.chatSlot}>
                <div className={`${styles.chatPanel} ${c.cerrando ? styles.cerrando : ''}`}>
                  <div className={styles.chatHead}>
                    <span className={styles.avatarSm}>{c.grupo.avatar ? <img src={comunidadMedia(c.grupo.avatar)} alt="" /> : ini(c.grupo.nombre)}</span>
                    <strong>{c.grupo.nombre}</strong>
                    <button type="button" className={styles.iconBtn} onClick={() => router.push(`/chat?conv=${c.id}`)} title={es ? 'Expandir' : 'Expand'}>
                      <ion-icon name="expand-outline" suppressHydrationWarning></ion-icon>
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={() => minimizarChat(c.id)} title="Minimizar">
                      <ion-icon name="remove-outline" suppressHydrationWarning></ion-icon>
                    </button>
                    <button type="button" className={styles.iconBtn} onClick={() => cerrarChat(c.id)} title="Cerrar">
                      <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>
                  <div className={styles.chatBody}>
                    {c.mensajes.map((m) => (
                      <div key={m.id} className={`${styles.msgRow} ${m.user_key === userKey ? styles.msgMine : ''}`}>
                        <span className={styles.avatarXs}>{m.avatar ? <img src={comunidadMedia(m.avatar)} alt="" /> : ini(m.usuario)}</span>
                        <div className={styles.msgBubble}>
                          <span className={styles.msgUser}>{m.usuario}</span>
                          {m.reply_to && (
                            <div className={styles.replyQuote}>
                              <strong>{m.reply_usuario || (es ? 'Mensaje' : 'Message')}</strong>
                              <span>{m.reply_texto ? m.reply_texto.slice(0, 90) : (es ? 'archivo' : 'file')}</span>
                            </div>
                          )}
                          {m.media && m.tipo === 'foto' && <img className={styles.msgMedia} src={comunidadMedia(m.media)} alt="" />}
                          {m.media && m.tipo === 'video' && <video className={styles.msgMedia} src={comunidadMedia(m.media)} controls playsInline onPlay={(e) => soloUnoPlay(e.currentTarget)} />}
                          {m.media && m.tipo === 'audio' && <audio src={comunidadMedia(m.media)} controls onPlay={(e) => soloUnoPlay(e.currentTarget)} />}
                          {m.texto && <p className={styles.msgText}>{m.texto}</p>}

                          {Array.isArray(m.reacciones) && m.reacciones.length > 0 && (
                            <div className={styles.reactions}>
                              {m.reacciones.map((rx) => (
                                <button
                                  key={rx.emoji}
                                  type="button"
                                  className={`${styles.reaction} ${rx.mi ? styles.reactionMine : ''}`}
                                  onClick={() => reaccionar(c.id, m, rx.emoji)}
                                >
                                  {rx.emoji} {rx.n}
                                </button>
                              ))}
                            </div>
                          )}

                          {c.puedeEscribir && (
                            <div className={styles.msgActions}>
                              <button type="button" className={styles.msgAction} onClick={() => setRespondiendo(c.id, m)} title={es ? 'Responder' : 'Reply'}>
                                <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                              </button>
                              <button type="button" className={styles.msgAction} onClick={() => setReactMenu(reactMenu === m.id ? null : m.id)} title={es ? 'Reaccionar' : 'React'}>
                                <ion-icon name="happy-outline" suppressHydrationWarning></ion-icon>
                              </button>
                            </div>
                          )}
                          {reactMenu === m.id && (
                            <div className={styles.palette}>
                              {['', '🔥', '😂', '😮', '😢', ''].map((e) => (
                                <button key={e} type="button" className={styles.paletteBtn} onClick={() => reaccionar(c.id, m, e)}>{e}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {c.mensajes.length === 0 && <p className={styles.emptySm}>{es ? 'Sin mensajes aún.' : 'No messages yet.'}</p>}
                  </div>

                  {c.respondiendo && (
                    <div className={styles.replyBar}>
                      <span>{es ? 'Respondiendo a' : 'Replying to'} <strong>{c.respondiendo.usuario}</strong></span>
                      <button type="button" className={styles.msgAction} onClick={() => setRespondiendo(c.id, null)}>
                        <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                      </button>
                    </div>
                  )}

                  {!c.puedeEscribir && (
                    <p className={styles.readOnlyHint}>
                      <ion-icon name="lock-closed-outline" suppressHydrationWarning></ion-icon>
                      {requiereAprobacion(c.grupo)
                        ? (es ? 'Debes enviar una solicitud y que el creador/admins la acepten para escribir.' : 'Send a request and the owner/admins must accept it to write.')
                        : (es ? 'Únete al grupo para escribir en el chat.' : 'Join the group to write in the chat.')}
                    </p>
                  )}
                  <div className={styles.chatFoot}>
                    <input
                      className={styles.input}
                      placeholder={c.puedeEscribir
                        ? (es ? 'Escribe un mensaje...' : 'Write a message...')
                        : (es ? 'Solo los miembros pueden escribir' : 'Only members can write')}
                      value={c.borrador}
                      disabled={!c.puedeEscribir}
                      onChange={(e) => setBorrador(c.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') enviarMensaje(c.id); }}
                    />
                    {c.puedeEscribir ? (
                      <button type="button" className={styles.publishBtn} onClick={() => enviarMensaje(c.id)}>
                        <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.pedirBtn}
                        onClick={() => (requiereAprobacion(c.grupo) ? pedirEntrar(c.grupo) : unirse(c.grupo))}
                      >
                        <ion-icon name={requiereAprobacion(c.grupo) ? 'lock-closed-outline' : 'person-add-outline'} suppressHydrationWarning></ion-icon>
                        {requiereAprobacion(c.grupo)
                          ? (es ? 'Pedir entrar' : 'Ask to join')
                          : (es ? 'Unirme para chatear' : 'Join to chat')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Burbujas minimizadas: en columna, al borde derecho (estilo Facebook) */}
          <div className={styles.chatBubbles}>
            {chats.filter((c) => c.minimizado).map((c) => (
              <div key={c.id} className={`${styles.bubble} ${c.cerrando ? styles.cerrando : ''}`}>
                <button type="button" className={styles.bubbleClose} onClick={() => cerrarChat(c.id)} aria-label="Cerrar">
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
                <button type="button" className={styles.bubbleHead} onClick={() => restaurarChat(c.id)} title={c.grupo.nombre}>
                  {c.grupo.avatar ? <img src={comunidadMedia(c.grupo.avatar)} alt="" /> : <span>{ini(c.grupo.nombre)}</span>}
                  <span className={styles.bubbleDot} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* El chat flotante de un amigo ahora vive en el dock global (useChatDock). */}
      <Mantenimiento open={mantGrupo} onClose={() => setMantGrupo(false)} />

      {/* ===== Pedir entrar a un grupo privado (con mensaje a admins) ===== */}
      {pedirGrupo && (
        <div className={styles.modal} onClick={() => setPedirGrupo(null)}>
          <div className={styles.storyModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.storyModalHead}>
              <span className={styles.avatarSm}>
                {pedirGrupo.grupo.avatar ? <img src={comunidadMedia(pedirGrupo.grupo.avatar)} alt="" /> : ini(pedirGrupo.grupo.nombre)}
              </span>
              <strong>{pedirGrupo.grupo.nombre}</strong>
              <button type="button" className={styles.iconBtn} onClick={() => setPedirGrupo(null)}>
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
            <p className={styles.emptySm}>
              {es
                ? 'Este grupo es privado: necesitas que el creador o un admin te acepten.'
                : 'This group is private: the owner or an admin must accept you.'}
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder={es ? 'Escribe un mensaje para el creador/admins...' : 'Write a message for the owner/admins...'}
              value={pedirGrupo.texto}
              onChange={(e) => setPedirGrupo({ ...pedirGrupo, texto: e.target.value })}
            />
            <button type="button" className={styles.primaryBtn} onClick={enviarSolicitud}>
              <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Enviar solicitud' : 'Send request'}
            </button>
          </div>
        </div>
      )}

      {/* ===== Solicitudes del grupo (solo creador/moderadores) ===== */}
      {solGrupoModal && (
        <div className={styles.modal} onClick={() => setSolGrupoModal(null)}>
          <div className={styles.storyModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.storyModalHead}>
              <strong>{es ? 'Solicitudes · ' : 'Requests · '}{solGrupoModal.grupo.nombre}</strong>
              <button type="button" className={styles.iconBtn} onClick={() => setSolGrupoModal(null)}>
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
            {solGrupoModal.lista.length === 0 ? (
              <p className={styles.emptySm}>{es ? 'Sin solicitudes.' : 'No requests.'}</p>
            ) : solGrupoModal.lista.map((s) => (
              <div key={s.id} className={styles.solRow}>
                <span className={styles.avatarSm}>{ini(s.usuario)}</span>
                <div className={styles.solInfo}>
                  <span className={styles.onlineName}>{s.usuario}</span>
                  {s.mensaje && <p className={styles.commentText}>{s.mensaje}</p>}
                  <span className={styles.groupMeta}>{s.estado}</span>
                </div>
                {s.estado === 'pendiente' && (
                  <div className={styles.solActions}>
                    <button type="button" className={styles.primaryBtn} onClick={() => resolverSolicitudG('aprobado', s)}>
                      {es ? 'Aceptar' : 'Accept'}
                    </button>
                    <button type="button" className={styles.ghostBtn} onClick={() => resolverSolicitudG('rechazado', s)}>
                      {es ? 'Rechazar' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Crear historia (elegir tipo -> formulario) ===== */}
      {storyCreador && (
        <div className={styles.modal} onClick={cerrarStoryCreador}>
          <div className={styles.storyModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.storyModalHead}>
              <strong>{es ? 'Crear historia' : 'Create story'}</strong>
              <button type="button" className={styles.iconBtn} onClick={cerrarStoryCreador}>
                <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>

            {storyCreador === 'choose' && (
              <div className={styles.storyOpts}>
                <button type="button" className={styles.storyOpt} onClick={() => setStoryCreador('texto')}>
                  <ion-icon name="text-outline" suppressHydrationWarning></ion-icon>
                  <span>{es ? 'Historia con texto' : 'Text story'}</span>
                </button>
                <button type="button" className={styles.storyOpt} onClick={() => setStoryCreador('media')}>
                  <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                  <span>{es ? 'Historia con foto o video' : 'Photo or video story'}</span>
                </button>
              </div>
            )}

            {storyCreador === 'texto' && (
              <>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  placeholder={es ? 'Escribe tu historia...' : 'Write your story...'}
                  value={storyTexto}
                  onChange={(e) => setStoryTexto(e.target.value)}
                />
                <button type="button" className={styles.primaryBtn} onClick={publicarStory} disabled={subiendo || !storyTexto.trim()}>
                  <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
                  {subiendo ? (es ? 'Subiendo...' : 'Uploading...') : (es ? 'Publicar historia' : 'Post story')}
                </button>
              </>
            )}

            {storyCreador === 'media' && (
              <>
                {!storyFile ? (
                  <StoryDrop onFile={elegirStoryMedia} es={es} />
                ) : (
                  <div className={styles.previewRow}>
                    {/^video\//.test(storyFile.type)
                      ? <video className={styles.previewVideo} src={storyPreview} controls muted playsInline preload="metadata" />
                      : <img className={styles.previewVideo} src={storyPreview} alt="" />}
                    <button type="button" className={styles.trashBtn} onClick={quitarStoryMedia} title={es ? 'Quitar' : 'Remove'}>
                      <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>
                )}

                <textarea
                  className={styles.textarea}
                  rows={2}
                  maxLength={MAX_DESC_HISTORIA}
                  placeholder={es ? 'Descripción (opcional)' : 'Description (optional)'}
                  value={storyTexto}
                  onChange={(e) => setStoryTexto(e.target.value)}
                />
                <span className={styles.descCount}>{storyTexto.length}/{MAX_DESC_HISTORIA}</span>

                {subiendo ? (
                  <div className={styles.uploadBox}>
                    <div className={styles.uploadBar}>
                      <span className={styles.uploadFill} style={{ width: `${subiendoPct}%` }} />
                    </div>
                    <div className={styles.uploadRow}>
                      <span className={styles.uploadPct}>{subiendoPct}% {es ? 'subiendo…' : 'uploading…'}</span>
                      <button type="button" className={styles.ghostBtn} onClick={cancelarSubida}>
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={styles.primaryBtn} onClick={publicarStory} disabled={!storyFile}>
                    <ion-icon name="paper-plane-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Publicar historia' : 'Post story'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <AuthModal open={authOpen} reason="like" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
