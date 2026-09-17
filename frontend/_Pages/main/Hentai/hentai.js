'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hentai.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

const PER_PAGE = 16;
const DROP_ORDEN = [
  { value: 'recientes', label: 'filtros.recientes' },
  { value: 'vistos', label: 'filtros.vistos' },
  { value: 'largos', label: 'filtros.largos' },
  { value: 'cortos', label: 'filtros.cortos' },
];
const DROP_DURACION = [
  { value: 'todas', label: 'filtros.todas' },
  { value: 'cortos', label: 'filtros.cortoLen' },
  { value: 'largos', label: 'filtros.largoLen' },
];

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
  const { t } = useLanguage();
  return (
    <div className={styles.dropWrap}>
      <button
        className={`${styles.dropBtn} ${open ? styles.dropOpen : ''}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        {t(options.find((o) => o.value === value)?.label || value)}
        <ion-icon name="chevron-down-outline" className={styles.dropChevron} suppressHydrationWarning></ion-icon>
        {extraIcon && (
          <ion-icon name="options-outline" className={styles.dropOptions} suppressHydrationWarning></ion-icon>
        )}
      </button>
      {open && (
        <div className={styles.dropMenu}>
          {options.map((op) => (
            <button
              key={op.value}
              className={`${styles.dropItem} ${op.value === value ? styles.dropItemActive : ''}`}
              type="button"
              onClick={() => {
                onChange(op.value);
                setOpen(false);
              }}
            >
              {t(op.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HentaiList() {
  const router = useRouter();
  const { t } = useLanguage();
  const { hentai: animes } = useContenido();
  const [page, setPage] = useState(1);
  const [orden, setOrden] = useState(DROP_ORDEN[0].value);
  const [duracion, setDuracion] = useState(DROP_DURACION[0].value);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

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
    orden !== DROP_ORDEN[0].value ||
    duracion !== DROP_DURACION[0].value;

  let filtered = [...animes];
  const q = query.trim().toLowerCase();
  if (q) filtered = filtered.filter((a) => a.title.toLowerCase().includes(q) || a.channel.toLowerCase().includes(q));
  if (orden === 'vistos') filtered.sort((a, b) => parseViews(b.views) - parseViews(a.views));
  else if (orden === 'largos') filtered.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
  else if (orden === 'cortos') filtered.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
  if (duracion === 'cortos') filtered = filtered.filter((a) => parseDuration(a.duration) < 480);
  if (duracion === 'largos') filtered = filtered.filter((a) => parseDuration(a.duration) >= 480);

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
    setOrden(DROP_ORDEN[0].value);
    setDuracion(DROP_DURACION[0].value);
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
          <p className={styles.metaLine}>
            <span className={styles.creator}>{anime.channel}</span>
            <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
            <span className={styles.dot}>•</span>
            <span>{anime.views}</span>
            <span className={styles.dot}>•</span>
            <span>{anime.time}</span>
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
              <h1 className={styles.title}>{t('nav.hentai')}</h1>
              <p className={styles.count}>{filtered.length} {t('secciones.animes')}</p>
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
