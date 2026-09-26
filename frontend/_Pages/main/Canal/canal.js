'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './canal.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';
import { useChatDock } from '@/_Extras/ChatDock/ChatDockProvider.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import AuthModal from '@/_Pages/main/Auth/AuthModal';
import { videoUrl } from '@/_Extras/Datos/urls.js';

const SORTS = [
  { id: 'recent', es: 'Más recientes', en: 'Newest' },
  { id: 'popular', es: 'Popular', en: 'Popular' },
  { id: 'oldest', es: 'Más antiguos', en: 'Oldest' },
];

function resolveImg(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/media/')) return mediaUrl(p);
  return p;
}

function fmtNum(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace('.0', '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1).replace('.0', '')}K`;
  return String(num);
}

function relTime(dateStr, es) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return es ? 'hace un momento' : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return es ? `hace ${m} min` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return es ? `hace ${days} d` : `${days} d ago`;
  const w = Math.floor(days / 7);
  if (w < 5) return es ? `hace ${w} sem` : `${w} w ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return es ? `hace ${mo} mes${mo > 1 ? 'es' : ''}` : `${mo} mo ago`;
  return es ? `hace ${Math.floor(days / 365)} año(s)` : `${Math.floor(days / 365)} y ago`;
}

function pageList(page, pages) {
  const out = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) out.push(i);
    return out;
  }
  out.push(1);
  if (page > 3) out.push('…');
  for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) out.push(i);
  if (page < pages - 2) out.push('…');
  out.push(pages);
  return out;
}

function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = pageList(page, pages);
  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={styles.pageNav}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Anterior"
      >
        <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
      </button>
      {nums.map((n, i) => (
        n === '…' ? (
          <span key={`d${i}`} className={styles.pageDots}>…</span>
        ) : (
          <button
            key={n}
            type="button"
            className={`${styles.pageBtn} ${n === page ? styles.pageBtnActive : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        )
      ))}
      <button
        type="button"
        className={styles.pageNav}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        aria-label="Siguiente"
      >
        <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
      </button>
    </div>
  );
}

export default function CanalClient({ slug, initialChannel, initialVideos = [], initialTotal = 0, initialPages = 1 }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const router = useRouter();
  const { userKey, authed } = useAuth();

  const [channel, setChannel] = useState(initialChannel);
  const [videos, setVideos] = useState(initialVideos);
  const [total, setTotal] = useState(initialTotal);
  const [pages, setPages] = useState(initialPages);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('recent');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [tab, setTab] = useState('videos');
  const [searchOpen, setSearchOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [rel, setRel] = useState(null);
  const [relBusy, setRelBusy] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const { abrir: abrirDock } = useChatDock();

  const [lists, setLists] = useState({
    packs: { data: [], total: 0, pages: 1, page: 1, loading: false, more: false, loaded: false },
    anime: { data: [], total: 0, pages: 1, page: 1, loading: false, more: false, loaded: false },
  });

  const firstRender = useRef(true);
  const listTopRef = useRef(null);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const [subiendoImg, setSubiendoImg] = useState(false);

  function scrollTop() {
    if (listTopRef.current) listTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // perfil fresco (con following según la sesión)
  const loadChannel = useCallback(async () => {
    try {
      const q = userKey ? `?userKey=${encodeURIComponent(userKey)}` : '';
      const r = await fetch(`${API_URL}/api/channels/${slug}${q}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return;
      if (j.channel) setChannel(j.channel);
      setFollowing(!!j.following);
    } catch { /* mantiene lo del server */ }
  }, [slug, userKey]);

  useEffect(() => { loadChannel(); }, [loadChannel]);

  // debounce del buscador
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const fetchVideos = useCallback(async ({ pageToLoad = 1 } = {}) => {
    const params = new URLSearchParams({ page: String(pageToLoad), limit: '24', sort });
    if (debouncedQ) params.set('q', debouncedQ);
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/channels/${slug}/videos?${params.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setVideos(j.data || []);
        setTotal(j.total || 0);
        setPages(j.pages || 1);
        setPage(pageToLoad);
      }
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [slug, sort, debouncedQ]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    fetchVideos({ pageToLoad: 1 });
  }, [fetchVideos]);

  const loadExtras = useCallback(async (kind, pageToLoad = 1, append = false) => {
    setLists((L) => ({ ...L, [kind]: { ...L[kind], loading: !append, more: append } }));
    try {
      const r = await fetch(`${API_URL}/api/channels/${slug}/${kind}?page=${pageToLoad}&limit=24`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setLists((L) => ({
          ...L,
          [kind]: {
            data: append ? [...L[kind].data, ...(j.data || [])] : (j.data || []),
            total: j.total || 0,
            pages: j.pages || 1,
            page: pageToLoad,
            loading: false,
            more: false,
            loaded: true,
          },
        }));
      } else {
        setLists((L) => ({ ...L, [kind]: { ...L[kind], loading: false, more: false, loaded: true } }));
      }
    } catch {
      setLists((L) => ({ ...L, [kind]: { ...L[kind], loading: false, more: false, loaded: true } }));
    }
  }, [slug]);

  useEffect(() => {
    if (tab !== 'videos' && !lists[tab].loaded) loadExtras(tab, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function toggleFollow() {
    if (!authed) { setAuthOpen(true); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/channels/${slug}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setFollowing(!!j.following);
        setChannel((c) => ({ ...c, seguidores: j.seguidores ?? c.seguidores }));
      }
    } catch { /* noop */ }
    finally { setBusy(false); }
  }

  // Amistad con el dueño del canal
  const duenoKey = channel?.user_key || initialChannel?.user_key || null;

  // Bloqueo entre los dos (Redis -> SSE): con bloqueo el canal NO existe
  // para ninguno de los dos hasta que se desbloquee.
  const [bloqueado, setBloqueado] = useState(false);

  const cargarBloqueo = useCallback(async () => {
    if (!authed || !userKey || !duenoKey || String(duenoKey) === String(userKey)) {
      setBloqueado(false);
      return;
    }
    const r = await apiComunidad.relacion(duenoKey, userKey);
    if (r && !r.error) setBloqueado(!!r.bloqueoMio || !!r.bloqueadoPorEl);
    else setBloqueado(false);
  }, [authed, userKey, duenoKey]);

  useEffect(() => { cargarBloqueo(); }, [cargarBloqueo]);

  // Tiempo real: el bloqueo/desbloqueo cierra (o reabre) el canal al instante.
  useEffect(() => {
    const onChange = (e) => {
      const d = e?.detail || {};
      if (String(d.type || '') !== 'comunidad_bloqueo') return;
      const p = d.payload || {};
      const mios = (String(p.de) === String(userKey) && String(p.para) === String(duenoKey))
        || (String(p.de) === String(duenoKey) && String(p.para) === String(userKey));
      if (mios) cargarBloqueo();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargarBloqueo, userKey, duenoKey]);

  const cargarRel = useCallback(async () => {
    if (!authed || !userKey || !duenoKey || String(duenoKey) === String(userKey)) { setRel(null); return; }
    const r = await apiComunidad.amistad(duenoKey, userKey);
    setRel(r && !r.error ? r : null);
  }, [authed, userKey, duenoKey]);

  useEffect(() => { cargarRel(); }, [cargarRel]);

  // Tiempo real: si llega un cambio de amistad/notificacion, refresca la
  // relacion (boton Aceptar/Rechazar/Cancelar) sin recargar la pagina.
  useEffect(() => {
    const onChange = (e) => {
      const t = String(e?.detail?.type || '');
      if (t === 'amistad' || t === 'notificacion' || t === 'user_profile') cargarRel();
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [cargarRel]);

  // Al volver con el boton atras (bfcache) el navegador restaura el DOM sin
  // re-ejecutar efectos: hay que refrescar la relacion aqui.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) cargarRel(); };
    const onFocus = () => cargarRel();
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [cargarRel]);

  async function accionAmistad(acc) {
    if (!authed) { setAuthOpen(true); return; }
    if (!duenoKey || String(duenoKey) === String(userKey)) return;
    setRelBusy(true);
    await apiComunidad.amistadAccion(duenoKey, userKey, acc);
    await cargarRel();
    setRelBusy(false);
    setFavOpen(false);
  }

  function abrirMensaje() {
    if (!authed) { setAuthOpen(true); return; }
    if (!duenoKey) return;
    // En celular no se abren flotantes: va directo al chat 1 a 1
    // (mismo criterio que "abrirAmigo" de Comunidad).
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      router.push(`/chat?dm=${encodeURIComponent(duenoKey)}`);
      return;
    }
    abrirDock({ user_key: duenoKey, usuario: channel?.nombre || '', avatar: channel?.avatar || null }, 'dm');
  }

  // Sube la foto de perfil o la portada de mi canal.
  async function subirImagen(kind, file) {
    if (!file || !userKey) return;
    setSubiendoImg(true);
    try {
      const fd = new FormData();
      fd.append('userKey', userKey);
      fd.append(kind === 'avatar' ? 'avatar' : 'banner', file);
      const r = await fetch(`${API_URL}/api/channels/user/${kind}`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const field = kind === 'avatar' ? 'avatar' : 'banner';
        if (j[field]) setChannel((c) => ({ ...c, [field]: `${j[field]}?v=${Date.now()}` }));
      }
    } catch { /* noop */ }
    finally { setSubiendoImg(false); }
  }

  // Se muestran siempre (PC y celular) en cualquier canal con dueño.
  const mostrarAmistad = !!duenoKey;
  const esMiCanal = !!(duenoKey && String(duenoKey) === String(userKey));

  const avatar = resolveImg(channel?.avatar);
  const banner = resolveImg(channel?.banner);
  const initial = String(channel?.nombre || '?').trim().charAt(0).toUpperCase();
  const desc = String(channel?.descripcion || '');
  const descLong = desc.length > 110;

  // Bloqueados: el canal no muestra nada (ni perfil, ni videos, ni acciones).
  if (bloqueado) {
    return (
      <main className={styles.main}>
        <div className={styles.canalBloqueado}>
          <ion-icon name="ban-outline" suppressHydrationWarning></ion-icon>
          <p>{es ? 'Este canal no está disponible.' : 'This channel is not available.'}</p>
          <button type="button" className={styles.canalBloqueadoBtn} onClick={() => router.push('/comunidad')}>
            <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Volver' : 'Back'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div
        className={styles.banner}
        style={{
          ...(banner ? { backgroundImage: `url(${banner})` } : {}),
          backgroundPosition: channel?.banner_pos || '50% 50%',
        }}
      >
        {!banner && <span className={styles.bannerGlow} aria-hidden="true" />}
      </div>

      <header className={styles.head}>
        <div className={styles.avatarWrap}>
          {avatar
            ? <img className={styles.avatar} src={avatar} alt={channel?.nombre} style={{ objectPosition: channel?.avatar_pos || '50% 50%' }} />
            : <span className={styles.avatarInitial}>{initial}</span>}
        </div>

        <div className={styles.headInfo}>
          <h1 className={styles.name}>
            {channel?.nombre}
            {channel?.verificado && (
              <ion-icon name="checkmark-circle" className={styles.verified} title={es ? 'Verificado' : 'Verified'} suppressHydrationWarning></ion-icon>
            )}
          </h1>

          <p className={styles.meta}>
            <span>@{channel?.slug}</span>
            <span className={styles.dot}>•</span>
            <span>{fmtNum(channel?.seguidores)} {es ? 'suscriptores' : 'subscribers'}</span>
            <span className={styles.dot}>•</span>
            <span>{fmtNum(channel?.videos)} {es ? 'videos' : 'videos'}</span>
            {channel?.packs > 0 && (<>
              <span className={styles.dot}>•</span>
              <span>{fmtNum(channel.packs)} packs</span>
            </>)}
            {channel?.hentai > 0 && (<>
              <span className={styles.dot}>•</span>
              <span>{fmtNum(channel.hentai)} anime</span>
            </>)}
            <span className={styles.dot}>•</span>
            <span>{fmtNum(channel?.vistas)} {es ? 'vistas' : 'views'}</span>
          </p>

          {desc && (
            <p className={styles.desc}>
              {descLong && !descOpen ? `${desc.slice(0, 110)}...` : desc}
              {descLong && (
                <button type="button" className={styles.descMore} onClick={() => setDescOpen((v) => !v)}>
                  {descOpen ? (es ? 'menos' : 'less') : (es ? 'más' : 'more')}
                </button>
              )}
            </p>
          )}

          <div className={styles.actionsRow}>
          {!esMiCanal && (
            <button
              type="button"
              className={`${styles.subBtn} ${following ? styles.subscribed : ''}`}
              onClick={toggleFollow}
              disabled={busy}
            >
              <ion-icon name={following ? 'notifications-outline' : 'add-outline'} suppressHydrationWarning></ion-icon>
              {following ? (es ? 'Suscrito' : 'Subscribed') : (es ? 'Suscribirse' : 'Subscribe')}
            </button>
          )}

          {mostrarAmistad && (
            <div className={styles.friendRow}>
              {!esMiCanal && (!rel || !rel.estado) && (
                <button type="button" className={styles.friendBtn} onClick={() => accionAmistad('solicitar')} disabled={relBusy}>
                  <ion-icon name="person-add-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Agregar a amigos' : 'Add friend'}
                </button>
              )}

              {!esMiCanal && rel?.estado === 'pendiente' && rel.miSolicitud && (
                <button type="button" className={styles.friendBtn} onClick={() => accionAmistad('cancelar')} disabled={relBusy}>
                  <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Cancelar solicitud' : 'Cancel request'}
                </button>
              )}

              {!esMiCanal && rel?.estado === 'pendiente' && !rel.miSolicitud && (
                <>
                  <button type="button" className={`${styles.friendBtn} ${styles.friendPrimary}`} onClick={() => accionAmistad('aceptar')} disabled={relBusy}>
                    <ion-icon name="checkmark-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Aceptar' : 'Accept'}
                  </button>
                  <button type="button" className={styles.friendBtn} onClick={() => accionAmistad('rechazar')} disabled={relBusy}>
                    {es ? 'Rechazar' : 'Reject'}
                  </button>
                </>
              )}

              {!esMiCanal && rel?.estado === 'aceptado' && (
                <div className={styles.friendMenuWrap}>
                  <button type="button" className={`${styles.friendBtn} ${styles.friendPrimary}`} onClick={() => setFavOpen((v) => !v)}>
                    <ion-icon name="people-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Amigos' : 'Friends'}
                  </button>
                  {favOpen && (
                    <div className={styles.friendMenu}>
                      <button type="button" onClick={() => accionAmistad(rel.favorito ? 'nofavorito' : 'favorito')}>
                        <ion-icon name={rel.favorito ? 'star' : 'star-outline'} suppressHydrationWarning></ion-icon>
                        {rel.favorito ? (es ? 'Quitar de favoritos' : 'Remove favorite') : (es ? 'Favoritos' : 'Favorite')}
                      </button>
                      <button type="button" className={styles.friendDanger} onClick={() => accionAmistad('eliminar')}>
                        <ion-icon name="person-remove-outline" suppressHydrationWarning></ion-icon>
                        {es ? 'Eliminar de mis amigos' : 'Remove friend'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {esMiCanal && (
                <>
                  <button type="button" className={styles.friendBtn} onClick={() => bannerInputRef.current?.click()} disabled={subiendoImg}>
                    <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Editar portada' : 'Edit cover'}
                  </button>
                  <button type="button" className={styles.friendBtn} onClick={() => avatarInputRef.current?.click()} disabled={subiendoImg}>
                    <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
                    {es ? 'Editar foto de perfil' : 'Edit profile photo'}
                  </button>
                </>
              )}

              <button type="button" className={styles.friendBtn} onClick={abrirMensaje}>
                <ion-icon name="chatbubble-ellipses-outline" suppressHydrationWarning></ion-icon>
                {es ? 'Mensaje' : 'Message'}
              </button>

              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirImagen('banner', f); }}
              />
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirImagen('avatar', f); }}
              />
            </div>
          )}
          </div>
        </div>
      </header>

      <nav className={styles.tabs} ref={listTopRef}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'videos' ? styles.tabActive : ''}`}
          onClick={() => setTab('videos')}
        >
          {es ? 'Videos' : 'Videos'}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'packs' ? styles.tabActive : ''}`}
          onClick={() => setTab('packs')}
        >
          {es ? 'Packs' : 'Packs'}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'anime' ? styles.tabActive : ''}`}
          onClick={() => setTab('anime')}
        >
          {es ? 'Anime' : 'Anime'}
        </button>
        {tab === 'videos' && (
          <button
            type="button"
            className={styles.searchToggle}
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={es ? 'Buscar en el canal' : 'Search in channel'}
            aria-expanded={searchOpen}
          >
            <ion-icon name={searchOpen ? 'close-outline' : 'search-outline'} suppressHydrationWarning></ion-icon>
          </button>
        )}
      </nav>

      {tab === 'videos' && searchOpen && (
        <div className={styles.searchBox}>
          <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
          <input
            className={styles.searchInput}
            type="text"
            autoFocus
            placeholder={es ? `Buscar en ${channel?.nombre}...` : `Search in ${channel?.nombre}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {tab === 'videos' ? (
        <>
          <div className={styles.filters}>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.chip} ${sort === s.id ? styles.chipActive : ''}`}
                onClick={() => setSort(s.id)}
              >
                {es ? s.es : s.en}
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.loading}>
              <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
              {es ? 'Cargando videos...' : 'Loading videos...'}
            </div>
          ) : videos.length === 0 ? (
            <div className={styles.empty}>
              <ion-icon name="videocam-off-outline" suppressHydrationWarning></ion-icon>
              <p>
                {debouncedQ
                  ? (es ? `No hay resultados para “${debouncedQ}”.` : `No results for “${debouncedQ}”.`)
                  : (es ? 'Este canal aún no subió videos.' : 'This channel has not uploaded videos yet.')}
              </p>
            </div>
          ) : (
            <>
              <div className={styles.grid}>
                {videos.map((v) => {
                  const title = es ? (v.titulo_es || v.titulo_en) : (v.titulo_en || v.titulo_es);
                  return (
                    <article
                      key={v.id}
                      className={styles.card}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(videoUrl(v))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(videoUrl(v)); } }}
                    >
                      <div className={styles.thumb}>
                        <Preview src={resolveImg(v.src)} thumb={resolveImg(v.thumb)}>
                          <span className={styles.duration}>
                            <ion-icon name="time-outline" suppressHydrationWarning></ion-icon>
                            {v.duracion || '00:00'}
                          </span>
                        </Preview>
                      </div>
                      <div className={styles.cardInfo}>
                        <h3 className={styles.cardTitle}>{title}</h3>
                        <p className={styles.cardMeta}>
                          {fmtNum(v.vistas)} {es ? 'vistas' : 'views'} • {relTime(v.created_at, es)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <Pager
                page={page}
                pages={pages}
                onChange={(p) => { fetchVideos({ pageToLoad: p }); scrollTop(); }}
              />
            </>
          )}
        </>
      ) : lists[tab].loading ? (
        <div className={styles.loading}>
          <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
          {es ? 'Cargando...' : 'Loading...'}
        </div>
      ) : lists[tab].data.length === 0 ? (
        <div className={styles.empty}>
          <ion-icon name={tab === 'packs' ? 'cube-outline' : 'sparkles-outline'} suppressHydrationWarning></ion-icon>
          <p>
            {tab === 'packs'
              ? (es ? 'Este canal aún no subió packs.' : 'This channel has not uploaded packs yet.')
              : (es ? 'Este canal aún no subió anime.' : 'This channel has not uploaded anime yet.')}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {lists[tab].data.map((it) => {
              if (tab === 'packs') {
                const title = es
                  ? (it.titulo_es || it.titulo_en || it.titulo)
                  : (it.titulo_en || it.titulo_es || it.titulo);
                return (
                  <article
                    key={it.id}
                    className={styles.card}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/packs/${it.public_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/packs/${it.public_id}`); } }}
                  >
                    <div className={styles.thumb}>
                      {it.thumb
                        ? <img className={styles.packThumb} src={resolveImg(it.thumb)} alt="" loading="lazy" />
                        : <span className={styles.thumbEmpty}><ion-icon name="cube-outline" suppressHydrationWarning></ion-icon></span>}
                      <span className={styles.packBadge}>PACK</span>
                    </div>
                    <div className={styles.cardInfo}>
                      <h3 className={styles.cardTitle}>{title}</h3>
                      <p className={styles.cardMeta}>
                        {it.fotos} {es ? 'fotos' : 'photos'} • {it.videos} {es ? 'videos' : 'videos'}
                      </p>
                      <p className={styles.cardMeta}>{fmtNum(it.vistas)} {es ? 'vistas' : 'views'}</p>
                    </div>
                  </article>
                );
              }
              const title = es ? (it.titulo_es || it.titulo_en) : (it.titulo_en || it.titulo_es);
              return (
                <article
                  key={it.id}
                  className={styles.card}
                  role="link"
                  tabIndex={0}
                    onClick={() => router.push(`/hentai/${it.slug || it.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {                       e.preventDefault(); router.push(`/hentai/${it.slug || it.id}`); } }}
                >
                  <div className={styles.thumb}>
                    <Preview src={resolveImg(it.src)} thumb={resolveImg(it.thumb)}>
                      <span className={styles.duration}>
                        <ion-icon name="time-outline" suppressHydrationWarning></ion-icon>
                        {it.duracion || '00:00'}
                      </span>
                    </Preview>
                  </div>
                  <div className={styles.cardInfo}>
                    <h3 className={styles.cardTitle}>{title}</h3>
                    <p className={styles.cardMeta}>
                      {fmtNum(it.vistas)} {es ? 'vistas' : 'views'} • {relTime(it.created_at, es)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          <Pager
            page={lists[tab].page}
            pages={lists[tab].pages}
            onChange={(p) => { loadExtras(tab, p, false); scrollTop(); }}
          />
        </>
      )}

      <AuthModal open={authOpen} reason="follow" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
