'use client';

import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './hentai.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import { canalUrl } from '@/_Extras/Canales/canal.js';

const PER_PAGE = 16;
const OPT_ORDEN = [
  { value: 'recientes', label: 'filtros.recientes' },
  { value: 'vistos', label: 'filtros.vistos' },
  { value: 'largos', label: 'filtros.largos' },
  { value: 'cortos', label: 'filtros.cortos' },
];
const OPT_DURACION = [
  { value: 'todas', label: 'filtros.todas' },
  { value: 'cortos', label: 'filtros.cortoLen' },
  { value: 'largos', label: 'filtros.largoLen' },
];

// Filtros del modal propio (solo movil). Esta seccion solo dispone de
// orden y duracion.
const SELECT_GROUPS = [
  { label: ['filtros.ordenarPor', 'filtros.ordenarPor'], opts: OPT_ORDEN },
  { label: ['filtros.duracion', 'filtros.duracion'], opts: OPT_DURACION },
];

function dimDe(value) {
  if (OPT_ORDEN.some((o) => o.value === value)) return 'orden';
  if (OPT_DURACION.some((o) => o.value === value)) return 'duracion';
  return null;
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

export default function HentaiList() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { hentai: animes } = useContenido();
  const [page, setPage] = useState(1);
  const [orden, setOrden] = useState(OPT_ORDEN[0]);
  const [duracion, setDuracion] = useState(OPT_DURACION[0]);
  const [filtroOpen, setFiltroOpen] = useState(false); // modal propio de filtros (solo movil)
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

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
  const isFiltering =
    query.trim() !== '' ||
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

  let filtered = [...animes];
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((a) => a.title.toLowerCase().includes(q) || a.channel.toLowerCase().includes(q));
  if (orden.value === 'vistos') filtered.sort((a, b) => parseViews(b.views) - parseViews(a.views));
  else if (orden.value === 'largos') filtered.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
  else if (orden.value === 'cortos') filtered.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
  if (duracion.value === 'cortos') filtered = filtered.filter((a) => parseDuration(a.duration) < 480);
  if (duracion.value === 'largos') filtered = filtered.filter((a) => parseDuration(a.duration) >= 480);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(anime) {
    router.push(`/hentai/${anime.slug || anime.id}`);
  }

  function clearFilters() {
    setQuery('');
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

  function renderCard(anime) {
    return (
      <article
        key={anime.id}
        className={styles.card}
        role="link"
        tabIndex={0}
        onClick={() => go(anime)}
        onMouseEnter={() => router.prefetch(`/hentai/${anime.slug || anime.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go(anime);
          }
        }}
      >
        <Preview src="" thumb={anime.cover || anime.thumb}>
          <span className={styles.playOverlay}>
            <ion-icon name="play" className={styles.playIcon} suppressHydrationWarning></ion-icon>
          </span>
          <span className={styles.duration}>{anime.chapters || 0} cap.</span>
        </Preview>
        <div className={styles.info}>
          <h3 className={styles.cardTitle}>{anime.title}</h3>
          <button
            type="button"
            className={styles.byRow}
            onClick={(e) => { e.stopPropagation(); router.push(anime.channelSlug ? `/canal/${anime.channelSlug}` : canalUrl(anime.channel)); }}
            aria-label={`${es ? 'Ver canal' : 'View channel'}: ${anime.channel}`}
          >
            {anime.channelAvatar
              ? <Image className={styles.avatar} src={anime.channelAvatar} alt="" width={22} height={22} loading="lazy" />
              : <span className={styles.avatar} aria-hidden="true">{(anime.channel || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className={styles.creator}>{anime.channel}</span>
            <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
          </button>
          <p className={styles.metaLine}>
            <span className={styles.metaItem}>
              <ion-icon name="eye-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {anime.views}
            </span>
            <span className={styles.metaItem}>
              <ion-icon name="time-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {anime.time}
            </span>
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
            <h1 className={styles.title}>{t('nav.hentai')}</h1>
            <div className={styles.toolbar}>
              {!isMobile ? (
                /* PC: selects nativos en flex a la derecha del titulo. */
                [
                  { v: orden, s: setOrden, o: OPT_ORDEN, l: 'filtros.ordenarPor' },
                  { v: duracion, s: setDuracion, o: OPT_DURACION, l: 'filtros.duracion' },
                ].map((d, i) => (
                  <select
                    key={i}
                    className={`${styles.deskSelect} ${d.v.value !== d.o[0].value ? styles.filterSelectActive : ''}`}
                    value={d.v.value}
                    aria-label={t(d.l)}
                    onChange={(e) => {
                      const opt = d.o.find((x) => x.value === e.target.value);
                      if (opt) { d.s(opt); setPage(1); }
                    }}
                  >
                    {d.o.map((op) => (
                      <option key={op.value} value={op.value}>{t(op.label)}</option>
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
                    aria-label={t('filtros.filtros')}
                  >
                    <ion-icon name="options-outline" className={styles.filterBtnIcon} suppressHydrationWarning></ion-icon>
                    <span className={styles.filterBtnLabel}>
                      {t('filtros.filtros')}{nFiltros > 0 ? ` (${nFiltros})` : ''}
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
              <div className={styles.filtroCard} role="dialog" aria-modal="true" aria-label={t('filtros.filtros')}>
                <span className={styles.filtroHandle} aria-hidden="true" />
                <div className={styles.filtroHead}>
                  <span className={styles.filtroHeadIcon}>
                    <ion-icon name="options-outline" suppressHydrationWarning></ion-icon>
                  </span>
                  <strong className={styles.filtroTitle}>{t('filtros.filtros')}</strong>
                  <button
                    type="button"
                    className={styles.filtroClose}
                    onClick={() => setFiltroOpen(false)}
                    aria-label={t('filtros.cerrar')}
                  >
                    <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>

                {nFiltros > 0 && (
                  <button type="button" className={styles.filtroClear} onClick={() => aplicarSelect('')}>
                    <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                    {t('filtros.borrar')} ({nFiltros})
                  </button>
                )}

                <div className={styles.filtroList}>
                  {SELECT_GROUPS.map((g) => (
                    <div key={g.label[0]} className={styles.filtroGroup}>
                      <span className={styles.filtroGroupLabel}>{t(g.label[0])}</span>
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
                            <span>{t(op.label)}</span>
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
                placeholder={t('secciones.buscarAnime')}
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
            <h2 className={styles.sectionTitle}>{isFiltering ? t('filtros.resultados') : t('secciones.todosAnimes')}</h2>
            <div className={styles.allHeadRight}>
              {isFiltering && (
                <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                  <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                  {t('filtros.borrar')}
                </button>
              )}
              <span className={styles.count}>{filtered.length} {t('secciones.animes')}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={styles.empty}>{t('secciones.sinResultados')}</p>
          ) : (
            <div className={styles.grid}>
              {groups}
            </div>
          )}

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />

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
