'use client';

import { Fragment, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './misVideos.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { getGuestData } from '@/_Extras/Interacciones/local.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import { videoUrl } from '@/_Extras/Datos/urls.js';

const PER_PAGE = 16;
const DROP_ORDEN = ['Más recientes', 'Más vistos', 'Más largos', 'Más cortos'];
const DROP_DURACION = ['Todas', 'Cortos (menos de 8 min)', 'Largos (8 min o más)'];

function fmtViews(n, es) {
  const num = Number(n) || 0;
  const suf = es ? 'vistas' : 'views';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace('.0', '')}M ${suf}`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace('.0', '')}K ${suf}`;
  return `${num} ${suf}`;
}

function parseViews(text) {
  const m = String(text).match(/([\d,.]+)\s*([KM])?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  const mult = (m[2] || '').toUpperCase() === 'M' ? 1000000 : (m[2] || '').toUpperCase() === 'K' ? 1000 : 1;
  return n * mult;
}

function parseDuration(text) {
  const parts = String(text).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// Invitado: arma la lista (guardados/me gusta/descargas) desde su navegador.
function buildGuestItems(which, videos) {
  const d = getGuestData();
  let ids = [];
  if (which === 'saved') ids = d.videoSaved;
  else if (which === 'downloads') ids = d.videoDownloads;
  else if (which === 'likes') ids = Object.entries(d.videoLikes).filter(([, tipo]) => tipo === 'like').map(([id]) => id);
  const byId = new Map(videos.map((v) => [String(v.id), v]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean).map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    views: v.views,
    duration: v.duration,
    src: v.src,
    thumb: v.thumb,
  }));
}

function InFeedAd() {
  return (
    <div className={styles.adRow}>
      <AdBanner
        adKey="e483940fff110a871ea3ba9b07dd3259"
        width={728}
        height={90}
        src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
      />
    </div>
  );
}

function Drop({ options, value, onChange, extraIcon }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.dropWrap}>
      <button
        className={`${styles.dropBtn} ${open ? styles.dropOpen : ''}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        {value}
        <ion-icon name="chevron-down-outline" className={styles.dropChevron} suppressHydrationWarning></ion-icon>
        {extraIcon && (
          <ion-icon name="options-outline" className={styles.dropOptions} suppressHydrationWarning></ion-icon>
        )}
      </button>
      {open && (
        <div className={styles.dropMenu}>
          {options.map((op) => (
            <button
              key={op}
              className={`${styles.dropItem} ${op === value ? styles.dropItemActive : ''}`}
              type="button"
              onClick={() => { onChange(op); setOpen(false); }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MisVideos({ title, endpoint, emptyText, embedded = false, withRail = true }) {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  // Título/vacío de la sección según endpoint (si no se pasa prop).
  const tituloSecc = title || (endpoint === 'saved' ? (es ? 'Favoritos' : 'Favorites') : endpoint === 'likes' ? (es ? 'Me gusta' : 'Likes') : endpoint === 'history' ? (es ? 'Historial' : 'History') : endpoint === 'downloads' ? (es ? 'Descargas' : 'Downloads') : (es ? 'Videos' : 'Videos'));
  const vacioSecc = emptyText || (endpoint === 'saved' ? (es ? 'Aún no guardas ningún video.' : 'You have not saved any video yet.') : endpoint === 'likes' ? (es ? 'Aún no le diste me gusta a nada.' : 'You haven’t liked anything yet.') : endpoint === 'history' ? (es ? 'Todavía no has visto ningún video.' : 'You have not watched any video yet.') : endpoint === 'downloads' ? (es ? 'Aún no has descargado ningún video.' : 'You haven’t downloaded any video yet.') : (es ? 'No hay videos todavía.' : 'No videos yet.'));
  const { authed } = useAuth();
  const { videos } = useContenido();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [orden, setOrden] = useState(DROP_ORDEN[0]);
  const [duracion, setDuracion] = useState(DROP_DURACION[0]);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let alive = true;
    // Invitado: guardados / me gusta / descargas salen de su almacén local.
    // El historial sí es del server (vistas anónimas por dispositivo).
    if (!authed && ['saved', 'likes', 'downloads'].includes(endpoint)) {
      setItems(buildGuestItems(endpoint, videos));
      setLoading(false);
      return () => { alive = false; };
    }
    const key = getUserKey();
    if (!key) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/auth/profile/${endpoint}?userKey=${encodeURIComponent(key)}&limit=200`);
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        setItems((j.data || []).map((v) => ({
          id: v.id,
          title: es ? (v.titulo_es || v.titulo_en || `Video #${v.id}`) : (v.titulo_en || v.titulo_es || `Video #${v.id}`),
          channel: v.canal || 'administrador pikante.pe',
          views: fmtViews(v.vistas, es),
          duration: v.duracion || '00:00',
          src: mediaUrl(v.src),
          thumb: mediaUrl(v.thumb),
        })));
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [endpoint, es, authed, videos]);

  // Redis realtime: refresca al cambiar likes/guardados/descargas/historial
  useEffect(() => {
    if (!authed) return undefined;
    const onChange = () => {
      const key = getUserKey();
      if (!key) return;
      fetch(`${API_URL}/api/auth/profile/${endpoint}?userKey=${encodeURIComponent(key)}&limit=200`)
        .then((r) => r.json())
        .then((j) => setItems((j.data || []).map((v) => ({
          id: v.id,
          title: es ? (v.titulo_es || v.titulo_en || `Video #${v.id}`) : (v.titulo_en || v.titulo_es || `Video #${v.id}`),
          channel: v.canal || 'administrador pikante.pe',
          views: fmtViews(v.vistas, es),
          duration: v.duracion || '00:00',
          src: mediaUrl(v.src),
          thumb: mediaUrl(v.thumb),
        }))))
        .catch(() => {});
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [endpoint, es, authed]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const perRowGroup = isMobile ? 4 : 8;
  const isFiltering = query.trim() !== '' || orden !== DROP_ORDEN[0] || duracion !== DROP_DURACION[0];

  const filtered = useMemo(() => {
    let f = [...items];
    const q = query.trim().toLowerCase();
    if (q) f = f.filter((v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q));
    if (orden === 'Más recientes') f.sort((a, b) => Number(b.id) - Number(a.id));
    else if (orden === 'Más vistos') f.sort((a, b) => parseViews(b.views) - parseViews(a.views));
    else if (orden === 'Más largos') f.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
    else if (orden === 'Más cortos') f.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
    else f.sort((a, b) => Number(b.id) - Number(a.id));
    if (duracion === 'Cortos (menos de 8 min)') f = f.filter((v) => parseDuration(v.duration) < 480);
    if (duracion === 'Largos (8 min o más)') f = f.filter((v) => parseDuration(v.duration) >= 480);
    return f;
  }, [items, query, orden, duracion]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PER_PAGE)), [filtered.length]);
  const safePage = Math.min(page, totalPages);

  function resetPage() { setPage(1); }

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    setQuery('');
    setOrden(DROP_ORDEN[0]);
    setDuracion(DROP_DURACION[0]);
    setPage(1);
  }

  function renderCard(video) {
    return (
      <article
        key={video.id}
        className={styles.card}
        role="link"
        tabIndex={0}
        onClick={() => router.push(videoUrl(video))}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(videoUrl(video)); } }}
      >
        <Preview src={video.src} thumb={video.thumb}>
          <span className={styles.duration}>{video.duration}</span>
        </Preview>
        <div className={styles.info}>
          <h3 className={styles.cardTitle}>{video.title}</h3>
          <p className={styles.metaLine}>
            <span className={styles.creator}>{video.channel}</span>
            <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
            <span className={styles.dot}>•</span>
            <span>{video.views}</span>
          </p>
        </div>
      </article>
    );
  }

  const list = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const groups = [];
  for (let i = 0; i < list.length; i += perRowGroup) {
    groups.push(
      <Fragment key={`g-${i}`}>
        {list.slice(i, i + perRowGroup).map(renderCard)}
        <InFeedAd key={`ad-${i}`} />
      </Fragment>
    );
  }

  return (
    <div className={`${styles.main} ${embedded ? styles.embedded : ''}`}>
      <div className={styles.layout2col}>
        <div className={styles.feed}>
          <div className={styles.headRow}>
            <div>
              {!embedded && tituloSecc && <h1 className={styles.title}>{tituloSecc}</h1>}
              <p className={styles.count}>
                {filtered.length} {es ? 'videos' : 'videos'}
                {isFiltering ? ` · ${es ? 'filtrados' : 'filtered'}` : ''}
              </p>
            </div>
            <div className={styles.toolbar}>
              <Drop options={DROP_ORDEN} value={orden} onChange={(v) => { setOrden(v); resetPage(); }} />
              <Drop options={DROP_DURACION} value={duracion} onChange={(v) => { setDuracion(v); resetPage(); }} extraIcon />
            </div>
          </div>

          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.searchInput}
                type="text"
                placeholder={es ? 'Buscar en esta lista...' : 'Search this list...'}
                value={query}
                onChange={(e) => { setQuery(e.target.value); resetPage(); }}
              />
              {query && (
                <button className={styles.searchClear} type="button" aria-label={es ? 'Limpiar' : 'Clear'} onClick={() => { setQuery(''); resetPage(); }}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
            </div>
          </div>

          <div className={styles.allHead}>
            <h2 className={styles.sectionTitle}>
              {isFiltering ? (es ? 'Resultados' : 'Results') : tituloSecc}
            </h2>
            <div className={styles.allHeadRight}>
              {isFiltering && (
                <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                  <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Borrar filtros' : 'Clear filters'}
                </button>
              )}
              <span className={styles.count}>{filtered.length}</span>
            </div>
          </div>

          {loading ? (
            <div className={styles.empty}>
              <ion-icon name="sync-outline" suppressHydrationWarning></ion-icon>
              <p>{es ? 'Cargando…' : 'Loading…'}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <ion-icon name="folder-open-outline" suppressHydrationWarning></ion-icon>
              <p>{vacioSecc}</p>
            </div>
          ) : (
            <div className={styles.grid}>{groups}</div>
          )}

          {!loading && totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} type="button" disabled={safePage <= 1} onClick={() => goPage(safePage - 1)} aria-label={es ? 'Anterior' : 'Previous'}>
                <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`${styles.pageBtn} ${p === safePage ? styles.pageActive : ''}`}
                  type="button"
                  onClick={() => goPage(p)}
                >
                  {p}
                </button>
              ))}
              <button className={styles.pageBtn} type="button" disabled={safePage >= totalPages} onClick={() => goPage(safePage + 1)} aria-label={es ? 'Siguiente' : 'Next'}>
                <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
              </button>
            </div>
          )}

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
        </div>

        {withRail && (
          <aside className={styles.rail}>
            <AdBanner
              adKey="78e0b2ea56da0940de81bef223de03b3"
              width={160}
              height={600}
              src="https://www.highrevenueformat.com/78e0b2ea56da0940de81bef223de03b3/invoke.js"
              marco
            />
            <AdBanner
              adKey="3a837969e396afcbcfc39bb7494cfe37"
              width={300}
              height={250}
              src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
            />
            <AdNative
              containerId="container-889d5bee4d5085ec8e0d5a960c034651"
              src="https://pl31251694.profitableratecpmnetwork.com/889d5bee4d5085ec8e0d5a960c034651/invoke.js"
            />
          </aside>
        )}
      </div>
    </div>
  );
}
