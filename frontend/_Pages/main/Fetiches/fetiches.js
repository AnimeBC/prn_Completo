'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './fetiches.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

const PER_PAGE = 16;

const DROP_ORDEN = ['Más vistos', 'Nuevos primero', 'Antiguos primero'];
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

function formatTotalViews(list) {
  const total = list.reduce((acc, v) => acc + parseViews(v.views), 0);
  if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M views`;
  if (total >= 1000) return `${Math.round(total / 1000)}K views`;
  return `${total} views`;
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

export default function FetichesClient() {
  const router = useRouter();
  const { t } = useLanguage();
  const { videos, feticheCategorias } = useContenido();
  const baseFetichesAll = [...videos].filter((v) => v.isFetiche);
  const dynamicCats = (feticheCategorias && feticheCategorias.length ? feticheCategorias : [...new Set(baseFetichesAll.map((v)=> v.feticheCategoria).filter(Boolean))]);
  const TABS = ['Fetiches', ...dynamicCats];
  const [tab, setTab] = useState('Fetiches');
  const [orden, setOrden] = useState(DROP_ORDEN[0]);
  const [duracion, setDuracion] = useState(DROP_DURACION[0]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [tabsLeft, setTabsLeft] = useState(false);
  const [tabsRight, setTabsRight] = useState(true);
  const rowRef = useRef(null);
  const tabsRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const perRowGroup = isMobile ? 4 : 8;

  // Querys propias de fetiches (distintas al buscador global del header).
  // Lee los valores iniciales para links compartidos y los mantiene sincronizados.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setQuery(q);
    const t = p.get('tab');
    if (t && TABS.includes(t)) setTab(t);
    const o = p.get('orden');
    if (o && DROP_ORDEN.includes(o)) setOrden(o);
    const d = p.get('duracion');
    if (d && DROP_DURACION.includes(d)) setDuracion(d);
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg >= 1) setPage(pg);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (tab !== 'Fetiches') p.set('tab', tab);
      if (orden !== DROP_ORDEN[0]) p.set('orden', orden);
      if (duracion !== DROP_DURACION[0]) p.set('duracion', duracion);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      router.replace(qs ? `/fetiches?${qs}` : '/fetiches', { scroll: false });
    }, 400);
    return () => clearTimeout(t);
  }, [query, tab, orden, duracion, page, router]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    function update() {
      setCanLeft(el.scrollLeft > 8);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    function update() {
      setTabsLeft(el.scrollLeft > 8);
      setTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const totalViews = formatTotalViews(baseFetichesAll);

  const isFiltering =
    query.trim() !== '' ||
    tab !== 'Fetiches' ||
    orden !== DROP_ORDEN[0] ||
    duracion !== DROP_DURACION[0];

  const baseFetiches = baseFetichesAll;
  const top10 = [...baseFetiches].sort((a, b) => parseViews(b.views) - parseViews(a.views)).slice(0, 10);

  let list = tab === 'Fetiches' ? [...baseFetiches] : baseFetiches.filter((v) => String(v.feticheCategoria||'').toLowerCase() === tab.toLowerCase() || (v.tags||[]).some(t=> String(t).toLowerCase()===tab.toLowerCase()));
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q));
  if (orden === 'Más vistos') list.sort((a, b) => parseViews(b.views) - parseViews(a.views));
  else if (orden === 'Nuevos primero') list.sort((a, b) => Number(b.id) - Number(a.id));
  else if (orden === 'Antiguos primero') list.sort((a, b) => Number(a.id) - Number(b.id));
  if (duracion === 'Cortos (menos de 8 min)') list = list.filter((v) => parseDuration(v.duration) < 480);
  if (duracion === 'Largos (8 min o más)') list = list.filter((v) => parseDuration(v.duration) >= 480);

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = list.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(id) {
    router.push(`/videos/${id}`);
  }

  function scrollRow(dir = 1) {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  function scrollTabs(dir = 1) {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  function clearFilters() {
    setQuery('');
    setTab('Fetiches');
    setOrden(DROP_ORDEN[0]);
    setDuracion(DROP_DURACION[0]);
    setPage(1);
  }

  const groups = [];
  for (let i = 0; i < paged.length; i += perRowGroup) {
    groups.push(
      <Fragment key={`g-${i}`}>
        {paged.slice(i, i + perRowGroup).map(renderCard)}
        <InFeedAd key={`ad-${i}`} />
      </Fragment>
    );
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

  return (
    <main className={styles.main}>
      <div className={styles.layout2col}>
        <div className={styles.feed}>
          <section className={styles.section}>
            <div className={styles.headRow}>
              <div>
                <h1 className={styles.title}>{t('nav.fetiches')}</h1>
                <p className={styles.subtitle}>{baseFetichesAll.length} {t('secciones.videos')} • {totalViews}</p>
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
                  placeholder="Search fetish, video or channel..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
                {query && (
                  <button className={styles.searchClear} type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                    <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                  </button>
                )}
              </div>
            </div>

            <div className={styles.tabsViewport}>
              <div className={styles.tabs} ref={tabsRef}>
                {TABS.map((t) => (
                  <span
                    key={t}
                    className={`${styles.tab} ${t === tab ? styles.tabActive : ''}`}
                    onClick={() => { setTab(t); setPage(1); }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              {tabsLeft && <div className={`${styles.tabsEdge} ${styles.tabsEdgeLeft}`} aria-hidden="true" />}
              {tabsRight && <div className={`${styles.tabsEdge} ${styles.tabsEdgeRight}`} aria-hidden="true" />}
              {tabsLeft && (
                <button
                  className={`${styles.tabsArrow} ${styles.tabsArrowLeft}`}
                  type="button"
                  aria-label="Tabs anteriores"
                  onClick={() => scrollTabs(-1)}
                >
                  <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
              {tabsRight && (
                <button
                  className={`${styles.tabsArrow} ${styles.tabsArrowRight}`}
                  type="button"
                  aria-label="Tabs siguientes"
                  onClick={() => scrollTabs(1)}
                >
                  <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                </button>
              )}
            </div>

            {!isFiltering && (
              <div className={styles.topSection}>
                <h2 className={styles.sectionTitle}>{t('secciones.topVistos')}</h2>
                <div className={styles.topViewport}>
                  <div className={styles.row} ref={rowRef}>
                    {top10.map(renderCard)}
                  </div>
                  {canLeft && <div className={`${styles.edge} ${styles.edgeLeft}`} aria-hidden="true" />}
                  {canRight && <div className={`${styles.edge} ${styles.edgeRight}`} aria-hidden="true" />}
                  {canLeft && (
                    <button
                      className={`${styles.edgeBtn} ${styles.edgeBtnLeft}`}
                      type="button"
                      aria-label="Previous"
                      onClick={() => scrollRow(-1)}
                    >
                      <ion-icon name="chevron-back-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
                    </button>
                  )}
                  {canRight && (
                    <button
                      className={`${styles.edgeBtn} ${styles.edgeBtnRight}`}
                      type="button"
                      aria-label="Next"
                      onClick={() => scrollRow(1)}
                    >
                      <ion-icon name="chevron-forward-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
                    </button>
                  )}
                </div>
                <AdBanner
                  adKey="e483940fff110a871ea3ba9b07dd3259"
                  width={728}
                  height={90}
                  src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
                />
              </div>
            )}

            <div className={styles.allHead}>
              <h2 className={styles.sectionTitle}>{isFiltering ? t('filtros.resultados') : 'All fetishes'}</h2>
              <div className={styles.allHeadRight}>
                {isFiltering && (
                  <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                    <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                    {t('filtros.borrar')}
                  </button>
                )}
                <span className={styles.count}>{list.length} {t('secciones.videos')}</span>
              </div>
            </div>

            {list.length === 0 ? (
              <p className={styles.empty}>{t('secciones.sinResultados')}</p>
            ) : (
              <div className={styles.grid}>
                {groups}
              </div>
            )}
          </section>

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
