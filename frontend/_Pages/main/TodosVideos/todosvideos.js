'use client';

import { Fragment, useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './todosvideos.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

const PER_PAGE = 16;
const DROP_ORDEN = ['Más recientes', 'Más vistos', 'Más largos', 'Más cortos'];
const DROP_DURACION = ['Todas', 'Cortos (menos de 8 min)', 'Largos (8 min o más)'];

function parseViews(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

function parseDuration(text) {
  const parts = String(text).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
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
              onClick={() => {
                onChange(op);
                setOpen(false);
              }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TodosVideosClient() {
  const router = useRouter();
  const { t } = useLanguage();
  const { videos } = useContenido();
  const [page, setPage] = useState(1);
  const [orden, setOrden] = useState(DROP_ORDEN[0]);
  const [duracion, setDuracion] = useState(DROP_DURACION[0]);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const didInitRef = useRef(false);
  const prevQsRef = useRef('');

  // Lee URL solo una vez al montar (evita loop con el effect de escritura)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setQuery(q);
    const o = p.get('orden');
    if (o && DROP_ORDEN.includes(o)) setOrden(o);
    const d = p.get('duracion');
    if (d && DROP_DURACION.includes(d)) setDuracion(d);
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg >= 1) setPage(pg);
    prevQsRef.current = window.location.search.slice(1);
    didInitRef.current = true;
  }, []);

  // Escribe URL solo si cambió y no es el primer mount (idempotente, rompe loop infinito solo en /videos)
  useEffect(() => {
    if (!didInitRef.current) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (orden !== DROP_ORDEN[0]) p.set('orden', orden);
      if (duracion !== DROP_DURACION[0]) p.set('duracion', duracion);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      if (qs === prevQsRef.current) return;
      prevQsRef.current = qs;
      router.replace(qs ? `/videos?${qs}` : '/videos', { scroll: false });
    }, 400);
    return () => clearTimeout(t);
  }, [query, orden, duracion, page, router]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const perRowGroup = isMobile ? 4 : 8;
  const isFiltering =
    query.trim() !== '' ||
    orden !== DROP_ORDEN[0] ||
    duracion !== DROP_DURACION[0];

  const filtered = useMemo(() => {
    let f = [...videos];
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
  }, [videos, query, orden, duracion]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PER_PAGE)), [filtered.length]);
  const safePage = Math.min(page, totalPages);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(id) {
    router.push(`/videos/${id}`);
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
        onClick={() => go(video.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go(video.id);
          }
        }}
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
            <span className={styles.dot}>•</span>
            <span>{video.time}</span>
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
    <main className={styles.main}>
      <div className={styles.layout2col}>
        <div className={styles.feed}>
          <div className={styles.headRow}>
            <div>
              <h1 className={styles.title}>{t('nav.todosVideos')}</h1>
              <p className={styles.count}>{filtered.length} {t('secciones.videos')} • {t('secciones.todosVideosDesc') || 'Todo lo que subimos, sin categorías'}</p>
            </div>
            <div className={styles.toolbar}>
              <Drop options={DROP_ORDEN} value={orden} onChange={(v) => { setOrden(v); setPage(1); }} />
              <Drop options={DROP_DURACION} value={duracion} onChange={(v) => { setDuracion(v); setPage(1); }} extraIcon />
            </div>
          </div>

          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
              <input
                className={styles.searchInput}
                type="text"
                placeholder={t('header.buscarCorto') || 'Buscar videos...'}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              />
              {query && (
                <button className={styles.searchClear} type="button" aria-label={t('filtros.limpiar')} onClick={() => setQuery('')}>
                  <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
            </div>
          </div>

          <div className={styles.allHead}>
            <h2 className={styles.sectionTitle}>{isFiltering ? t('filtros.resultados') : t('secciones.videos')}</h2>
            <div className={styles.allHeadRight}>
              {isFiltering && (
                <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                  <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                  {t('filtros.borrar')}
                </button>
              )}
              <span className={styles.count}>{filtered.length} {t('secciones.videos')}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={styles.empty}>{t('secciones.sinResultados')}</p>
          ) : (
            <div className={styles.grid}>
              {groups}
            </div>
          )}

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              type="button"
              disabled={safePage <= 1}
              onClick={() => goPage(safePage - 1)}
              aria-label={t('paginacion.anterior')}
            >
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
            <button
              className={styles.pageBtn}
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => goPage(safePage + 1)}
              aria-label={t('paginacion.siguiente')}
            >
              <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
            </button>
          </div>

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
        </div>

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
      </div>
    </main>
  );
}
