'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from './fetiches.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import { videoUrl } from '@/_Extras/Datos/urls.js';
import { canalUrl } from '@/_Extras/Canales/canal.js';

const PER_PAGE = 16;

// Valores unicos entre grupos: cada value indica su dimension.
const OPT_ORDEN = [
  { value: 'mas_vistos', es: 'Más vistos', en: 'Most viewed' },
  { value: 'nuevos', es: 'Nuevos primero', en: 'Newest first' },
  { value: 'antiguos', es: 'Antiguos primero', en: 'Oldest first' },
];
const OPT_DURACION = [
  { value: 'todas', es: 'Todas', en: 'All' },
  { value: 'cortos', es: 'Cortos (menos de 8 min)', en: 'Short (under 8 min)' },
  { value: 'largos', es: 'Largos (8 min o más)', en: 'Long (8 min or more)' },
];

// Filtros del modal propio (solo movil). Este seccion solo dispone de
// orden y duracion; nada de categorias ni descargas.
const SELECT_GROUPS = [
  { label: ['Ordenar por', 'Sort by'], opts: OPT_ORDEN },
  { label: ['Duración', 'Duration'], opts: OPT_DURACION },
];

function dimDe(value) {
  if (OPT_ORDEN.some((o) => o.value === value)) return 'orden';
  if (OPT_DURACION.some((o) => o.value === value)) return 'duracion';
  return null;
}

function optTexto(opt, es) {
  return es ? opt.es : opt.en;
}

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

export default function FetichesClient() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { videos, feticheCategorias } = useContenido();
  const baseFetichesAll = [...videos].filter((v) => v.isFetiche);
  const dynamicCats = (feticheCategorias && feticheCategorias.length ? feticheCategorias : [...new Set(baseFetichesAll.map((v)=> v.feticheCategoria).filter(Boolean))]);
  const TABS = ['Fetiches', ...dynamicCats];
  const [tab, setTab] = useState('Fetiches');
  const [orden, setOrden] = useState(OPT_ORDEN[0]);
  const [duracion, setDuracion] = useState(OPT_DURACION[0]);
  const [filtroOpen, setFiltroOpen] = useState(false); // modal propio de filtros (solo movil)
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [tabsLeft, setTabsLeft] = useState(false);
  const [tabsRight, setTabsRight] = useState(true);
  const rowRef = useRef(null);
  const tabsRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const didInitRef = useRef(false);
  const prevQsRef = useRef('');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => {
      setIsMobile(e.matches);
      // Al pasar a PC (donde van los selects) se cierra el modal y su scroll-lock.
      if (!e.matches) setFiltroOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const perRowGroup = isMobile ? 4 : 8;

  // Lee los valores iniciales para links compartidos y los mantiene sincronizados.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setQuery(q);
    const t = p.get('tab');
    if (t && TABS.includes(t)) setTab(t);
    const o = p.get('orden');
    if (o && OPT_ORDEN.some((x) => x.value === o)) setOrden(OPT_ORDEN.find((x) => x.value === o));
    const d = p.get('duracion');
    if (d && OPT_DURACION.some((x) => x.value === d)) setDuracion(OPT_DURACION.find((x) => x.value === d));
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg >= 1) setPage(pg);
    prevQsRef.current = window.location.search.slice(1);
    didInitRef.current = true;
  }, []);

  // Escribe la URL solo si cambió y no es el primer mount (rompe el loop infinito).
  useEffect(() => {
    if (!didInitRef.current) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (tab !== 'Fetiches') p.set('tab', tab);
      if (orden.value !== OPT_ORDEN[0].value) p.set('orden', orden.value);
      if (duracion.value !== OPT_DURACION[0].value) p.set('duracion', duracion.value);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      if (qs === prevQsRef.current) return;
      prevQsRef.current = qs;
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

  const isFiltering =
    query.trim() !== '' ||
    tab !== 'Fetiches' ||
    orden.value !== OPT_ORDEN[0].value ||
    duracion.value !== OPT_DURACION[0].value;

  // Cuantos filtros de grupo estan activos (para el contador del trigger).
  const nFiltros = [
    orden.value !== OPT_ORDEN[0].value,
    duracion.value !== OPT_DURACION[0].value,
  ].filter(Boolean).length;

  // Valor actual de cada dimension (para los checks del modal).
  const valDeDim = { orden: orden.value, duracion: duracion.value };

  // Bloquea el scroll del fondo con el modal abierto (solo movil).
  useEffect(() => {
    if (!filtroOpen || !isMobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [filtroOpen, isMobile]);

  const baseFetiches = baseFetichesAll;
  const top10 = [...baseFetiches].sort((a, b) => parseViews(b.views) - parseViews(a.views)).slice(0, 10);

  let list = tab === 'Fetiches' ? [...baseFetiches] : baseFetiches.filter((v) => String(v.feticheCategoria||'').toLowerCase() === tab.toLowerCase() || (v.tags||[]).some(t=> String(t).toLowerCase()===tab.toLowerCase()));
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((v) => v.title.toLowerCase().includes(q) || v.channel.toLowerCase().includes(q));
  if (orden.value === 'mas_vistos') list.sort((a, b) => parseViews(b.views) - parseViews(a.views));
  else if (orden.value === 'nuevos') list.sort((a, b) => Number(b.id) - Number(a.id));
  else if (orden.value === 'antiguos') list.sort((a, b) => Number(a.id) - Number(b.id));
  if (duracion.value === 'cortos') list = list.filter((v) => parseDuration(v.duration) < 480);
  if (duracion.value === 'largos') list = list.filter((v) => parseDuration(v.duration) >= 480);

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = list.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(item) {
    router.push(videoUrl(item));
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
    setOrden(OPT_ORDEN[0]);
    setDuracion(OPT_DURACION[0]);
    setPage(1);
  }

  // Aplica la opcion elegida en el modal de filtros y lo cierra.
  function aplicarSelect(v) {
    setFiltroOpen(false);
    if (!v) { clearFilters(); return; }
    const dim = dimDe(v);
    if (dim === 'orden') {
      const opt = OPT_ORDEN.find((o) => o.value === v);
      if (opt) setOrden(opt);
    } else if (dim === 'duracion') {
      const opt = OPT_DURACION.find((o) => o.value === v);
      if (opt) setDuracion(opt);
    } else return;
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
        onClick={() => go(video)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go(video);
          }
        }}
      >
        <Preview src={video.src} thumb={video.thumb}>
          <span className={styles.duration}>{video.duration}</span>
        </Preview>
        <div className={styles.info}>
          <h3 className={styles.cardTitle}>{video.title}</h3>
          <button
            type="button"
            className={styles.byRow}
            onClick={(e) => { e.stopPropagation(); router.push(video.channelSlug ? `/canal/${video.channelSlug}` : canalUrl(video.channel)); }}
            aria-label={`${es ? 'Ver canal' : 'View channel'}: ${video.channel}`}
          >
            {video.channelAvatar
              ? <img className={styles.avatar} src={video.channelAvatar} alt="" loading="lazy" />
              : <span className={styles.avatar} aria-hidden="true">{(video.channel || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className={styles.creator}>{video.channel}</span>
            <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
          </button>
          <p className={styles.metaLine}>
            <span className={styles.metaItem}>
              <ion-icon name="eye-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {video.views}
            </span>
            <span className={styles.metaItem}>
              <ion-icon name="time-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {video.time}
            </span>
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
              <h1 className={styles.title}>{t('nav.fetiches')}</h1>
              <div className={styles.toolbar}>
                {!isMobile ? (
                  /* PC: selects nativos en flex a la derecha del titulo. */
                  [
                    { v: orden, s: setOrden, o: OPT_ORDEN, l: ['Ordenar por', 'Sort by'] },
                    { v: duracion, s: setDuracion, o: OPT_DURACION, l: ['Duración', 'Duration'] },
                  ].map((d, i) => (
                    <select
                      key={i}
                      className={`${styles.deskSelect} ${d.v.value !== d.o[0].value ? styles.filterSelectActive : ''}`}
                      value={d.v.value}
                      aria-label={es ? d.l[0] : d.l[1]}
                      onChange={(e) => {
                        const opt = d.o.find((x) => x.value === e.target.value);
                        if (opt) { d.s(opt); setPage(1); }
                      }}
                    >
                      {d.o.map((op) => (
                        <option key={op.value} value={op.value}>{optTexto(op, es)}</option>
                      ))}
                    </select>
                  ))
                ) : (
                  /* Movil: un solo trigger que abre el modal propio. */
                  <div className={styles.selectWrap}>
                    <button
                      type="button"
                      className={`${styles.filterBtn} ${nFiltros ? styles.filterSelectActive : ''}`}
                      onClick={() => setFiltroOpen(true)}
                      aria-haspopup="dialog"
                      aria-label={es ? 'Filtros' : 'Filters'}
                    >
                      <ion-icon name="options-outline" className={styles.filterBtnIcon} suppressHydrationWarning></ion-icon>
                      <span className={styles.filterBtnLabel}>
                        {es ? 'Filtros' : 'Filters'}{nFiltros > 0 ? ` (${nFiltros})` : ''}
                      </span>
                      <ion-icon name="chevron-down-outline" className={styles.selectChevron} suppressHydrationWarning></ion-icon>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal propio de filtros (solo movil; portal a body). */}
            {isMobile && filtroOpen && createPortal(
              <div
                className={styles.filtroOverlay}
                onClick={(e) => { if (e.target === e.currentTarget) setFiltroOpen(false); }}
              >
                <div className={styles.filtroCard} role="dialog" aria-modal="true" aria-label={es ? 'Filtros' : 'Filters'}>
                  <span className={styles.filtroHandle} aria-hidden="true" />
                  <div className={styles.filtroHead}>
                    <span className={styles.filtroHeadIcon}>
                      <ion-icon name="options-outline" suppressHydrationWarning></ion-icon>
                    </span>
                    <strong className={styles.filtroTitle}>{es ? 'Filtros' : 'Filters'}</strong>
                    <button
                      type="button"
                      className={styles.filtroClose}
                      onClick={() => setFiltroOpen(false)}
                      aria-label={es ? 'Cerrar' : 'Close'}
                    >
                      <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>

                  {nFiltros > 0 && (
                    <button type="button" className={styles.filtroClear} onClick={() => aplicarSelect('')}>
                      <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                      {es ? 'Borrar filtros' : 'Clear filters'} ({nFiltros})
                    </button>
                  )}

                  <div className={styles.filtroList}>
                    {SELECT_GROUPS.map((g) => (
                      <div key={g.label[0]} className={styles.filtroGroup}>
                        <span className={styles.filtroGroupLabel}>{es ? g.label[0] : g.label[1]}</span>
                        {g.opts.map((op) => {
                          const dim = dimDe(op.value);
                          const activa = valDeDim[dim] === op.value;
                          return (
                            <button
                              key={op.value}
                              type="button"
                              className={`${styles.filtroOpt} ${activa ? styles.filtroOptActive : ''}`}
                              onClick={() => aplicarSelect(op.value)}
                            >
                              <span>{optTexto(op, es)}</span>
                              <ion-icon name="checkmark-circle" className={styles.filtroOptCheck} suppressHydrationWarning></ion-icon>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            )}

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
