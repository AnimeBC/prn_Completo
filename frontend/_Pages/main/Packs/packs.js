'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './packs.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import { canalUrl } from '@/_Extras/Canales/canal.js';

const PER_PAGE = 16;

function parseNum(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

const OPT_DESCARGAS = [
  { value: 'desc_mas', key: 'packs.optDescMas' },
  { value: 'desc_menos', key: 'packs.optDescMenos' },
];
const OPT_BUSCADOS = [
  { value: 'busq_mas', key: 'packs.optBusqMas' },
  { value: 'busq_menos', key: 'packs.optBusqMenos' },
];
const OPT_NUEVOS = [
  { value: 'nuevos', key: 'packs.optNuevos' },
  { value: 'antiguos', key: 'packs.optAntiguos' },
];
const OPT_CATEGORIA = [
  { value: 'todas', key: 'packs.optTodas' },
  { value: 'grandes', key: 'packs.optGrandes' },
  { value: 'completos', key: 'packs.optCompletos' },
];

function findOption(options, value, fallback) {
  return options.find((o) => o.value === value) || fallback;
}

// Todos los filtros en UN solo modal desplegable con grupos (el select nativo
// del navegador se ve feo en movil). Los values son unicos entre grupos, asi
// que cada value indica su dimension.
const SELECT_GROUPS = [
  { label: ['Descargas', 'Downloads'], opts: OPT_DESCARGAS },
  { label: ['Popularidad', 'Popularity'], opts: OPT_BUSCADOS },
  { label: ['Antigüedad', 'Age'], opts: OPT_NUEVOS },
  { label: ['Categoría', 'Category'], opts: OPT_CATEGORIA },
];

function dimDe(value) {
  if (OPT_DESCARGAS.some((o) => o.value === value)) return 'descargas';
  if (OPT_BUSCADOS.some((o) => o.value === value)) return 'buscados';
  if (OPT_NUEVOS.some((o) => o.value === value)) return 'novedad';
  if (OPT_CATEGORIA.some((o) => o.value === value)) return 'categoria';
  return null;
}

export default function PacksClient() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { packs } = useContenido();
  const [descargas, setDescargas] = useState(OPT_DESCARGAS[0]);
  const [buscados, setBuscados] = useState(OPT_BUSCADOS[0]);
  const [novedad, setNovedad] = useState(OPT_NUEVOS[0]);
  const [categoria, setCategoria] = useState(OPT_CATEGORIA[0]);
  const [filtroOpen, setFiltroOpen] = useState(false); // modal propio de filtros (el select nativo es feo en movil)
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const rowRef = useRef(null);
  const didInitRef = useRef(false);
  const prevQsRef = useRef('');

  // Lee los valores iniciales para links compartidos y los mantiene sincronizados.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setQuery(q);
    const d = p.get('descargas');
    if (d) setDescargas(findOption(OPT_DESCARGAS, d, OPT_DESCARGAS[0]));
    const b = p.get('buscados');
    if (b) setBuscados(findOption(OPT_BUSCADOS, b, OPT_BUSCADOS[0]));
    const n = p.get('novedad');
    if (n) setNovedad(findOption(OPT_NUEVOS, n, OPT_NUEVOS[0]));
    const c = p.get('categoria');
    if (c) setCategoria(findOption(OPT_CATEGORIA, c, OPT_CATEGORIA[0]));
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg >= 1) setPage(pg);
    prevQsRef.current = window.location.search.slice(1);
    didInitRef.current = true;
  }, []);

  // Escribe la URL solo si cambió y no es el primer mount (rompe el loop infinito).
  useEffect(() => {
    if (!didInitRef.current) return;
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (descargas.value !== OPT_DESCARGAS[0].value) p.set('descargas', descargas.value);
      if (buscados.value !== OPT_BUSCADOS[0].value) p.set('buscados', buscados.value);
      if (novedad.value !== OPT_NUEVOS[0].value) p.set('novedad', novedad.value);
      if (categoria.value !== OPT_CATEGORIA[0].value) p.set('categoria', categoria.value);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      if (qs === prevQsRef.current) return;
      prevQsRef.current = qs;
      router.replace(qs ? `/packs?${qs}` : '/packs', { scroll: false });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, descargas, buscados, novedad, categoria, page, router]);

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

  const perRowGroup = isMobile ? 4 : 8;

  const isFiltering =
    query.trim() !== '' ||
    descargas.value !== OPT_DESCARGAS[0].value ||
    buscados.value !== OPT_BUSCADOS[0].value ||
    novedad.value !== OPT_NUEVOS[0].value ||
    categoria.value !== OPT_CATEGORIA[0].value;

  // Cuantos filtros de grupo hay activos (para el contador del trigger).
  const nFiltros = [
    descargas.value !== OPT_DESCARGAS[0].value,
    buscados.value !== OPT_BUSCADOS[0].value,
    novedad.value !== OPT_NUEVOS[0].value,
    categoria.value !== OPT_CATEGORIA[0].value,
  ].filter(Boolean).length;

  // Valor actual de cada dimension (para los checks del modal).
  const valDeDim = {
    descargas: descargas.value,
    buscados: buscados.value,
    novedad: novedad.value,
    categoria: categoria.value,
  };

  // Bloquea el scroll del fondo con el modal abierto (solo movil).
  useEffect(() => {
    if (!filtroOpen || !isMobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [filtroOpen, isMobile]);

  const top10 = [...packs].sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas)).slice(0, 10);

  let list = [...packs];
  if (categoria.value === 'grandes') list = list.filter((p) => p.fotos >= 30);
  if (categoria.value === 'completos') list = list.filter((p) => p.videos >= 3);
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.uploader || '').toLowerCase().includes(q));
  if (descargas.value === 'desc_mas') list.sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas));
  else list.sort((a, b) => parseNum(a.descargas) - parseNum(b.descargas));
  if (buscados.value === 'busq_mas') list.sort((a, b) => parseNum(b.views) - parseNum(a.views));
  else list.sort((a, b) => parseNum(a.views) - parseNum(b.views));
  if (novedad.value === 'antiguos') list.reverse();

  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = list.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goPack(id) {
    router.push(`/packs/${id}`);
  }

  function scrollRow(dir = 1) {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  function clearFilters() {
    setQuery('');
    setDescargas(OPT_DESCARGAS[0]);
    setBuscados(OPT_BUSCADOS[0]);
    setNovedad(OPT_NUEVOS[0]);
    setCategoria(OPT_CATEGORIA[0]);
    setPage(1);
  }

  // Aplica la opcion elegida en el modal de filtros y lo cierra.
  function aplicarSelect(v) {
    setFiltroOpen(false);
    if (!v) { clearFilters(); return; }
    const dim = dimDe(v);
    const arr = dim === 'descargas' ? OPT_DESCARGAS
      : dim === 'buscados' ? OPT_BUSCADOS
        : dim === 'novedad' ? OPT_NUEVOS
          : OPT_CATEGORIA;
    const opt = arr.find((o) => o.value === v);
    if (!opt) return;
    if (dim === 'descargas') setDescargas(opt);
    else if (dim === 'buscados') setBuscados(opt);
    else if (dim === 'novedad') setNovedad(opt);
    else setCategoria(opt);
    setPage(1);
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

  function renderCard(pack) {
    return (
      <article
        key={pack.id}
        className={styles.card}
        role="link"
        tabIndex={0}
        onClick={() => goPack(pack.public_id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            goPack(pack.public_id);
          }
        }}
      >
        <div className={styles.thumb}>
          <span className={styles.packBadge}>{t('packs.badge')}</span>
          {pack.thumb
            ? (
              <Image
                className={styles.thumbImg}
                src={pack.thumb}
                alt=""
                fill
                loading="lazy"
                sizes="(max-width: 768px) 50vw, (max-width: 1400px) 25vw, 340px"
              />
            )
            : (
              <>
                <ion-icon name="image-outline" className={styles.thumbIcon} suppressHydrationWarning></ion-icon>
                <span className={styles.thumbLabel}>{t('packs.imagen')}</span>
              </>
            )}
        </div>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <h3 className={styles.cardTitle}>{pack.title}</h3>
            <ion-icon name="lock-closed-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
          </div>
          <button
            type="button"
            className={styles.byRow}
            onClick={(e) => { e.stopPropagation(); router.push(pack.channelSlug ? `/canal/${pack.channelSlug}` : canalUrl(pack.uploader)); }}
            aria-label={`${es ? 'Ver canal' : 'View channel'}: ${pack.uploader}`}
          >
            {pack.channelAvatar
              ? <img className={styles.avatar} src={pack.channelAvatar} alt="" loading="lazy" />
              : <span className={styles.avatar} aria-hidden="true">{(pack.uploader || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className={styles.creator}>{pack.uploader}</span>
          </button>
          <span className={styles.meta}>{pack.fotos} {t('packs.fotos')} + {pack.videos} {t('packs.videos')}</span>
          <p className={styles.metaLine}>
            <span className={styles.metaItem}>
              <ion-icon name="eye-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {pack.views}
            </span>
            <span className={styles.metaItem}>
              <ion-icon name="download-outline" className={styles.metaIcon} suppressHydrationWarning></ion-icon>
              {pack.descargas}
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
              <h1 className={styles.title}>{t('packs.titulo')}</h1>
              <div className={styles.toolbar}>
                {!isMobile ? (
                  /* PC: 4 selects nativos en flex a la derecha del titulo. */
                  [
                    { v: descargas, s: setDescargas, o: OPT_DESCARGAS, l: ['Descargas', 'Downloads'] },
                    { v: buscados, s: setBuscados, o: OPT_BUSCADOS, l: ['Popularidad', 'Popularity'] },
                    { v: novedad, s: setNovedad, o: OPT_NUEVOS, l: ['Antigüedad', 'Age'] },
                    { v: categoria, s: setCategoria, o: OPT_CATEGORIA, l: ['Categoría', 'Category'] },
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
                        <option key={op.value} value={op.value}>{t(op.key)}</option>
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
                              <span>{t(op.key)}</span>
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
                  placeholder={t('packs.buscar')}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
                {query && (
                  <button className={styles.searchClear} type="button" aria-label={t('packs.limpiar')} onClick={() => setQuery('')}>
                    <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                  </button>
                )}
              </div>
            </div>

            {!isFiltering && (
              <div className={styles.topSection}>
                <h2 className={styles.sectionTitle}>{t('packs.topDescargados')}</h2>
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
                      aria-label={t('paginacion.anterior')}
                      onClick={() => scrollRow(-1)}
                    >
                      <ion-icon name="chevron-back-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
                    </button>
                  )}
                  {canRight && (
                    <button
                      className={`${styles.edgeBtn} ${styles.edgeBtnRight}`}
                      type="button"
                      aria-label={t('paginacion.siguiente')}
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
              <h2 className={styles.sectionTitle}>{isFiltering ? t('packs.resultados') : t('packs.todosPacks')}</h2>
              <div className={styles.allHeadRight}>
                {isFiltering && (
                  <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                    <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                    {t('packs.borrarFiltros')}
                  </button>
                )}
                <span className={styles.count}>{list.length} {t('nav.packs').toLowerCase()}</span>
              </div>
            </div>

            {list.length === 0 ? (
              <p className={styles.empty}>{t('packs.sinResultados')}</p>
            ) : (
              <>
                <div className={styles.grid}>
                  {(() => {
                    const groups = [];
                    for (let i = 0; i < paged.length; i += perRowGroup) {
                      groups.push(
                        <Fragment key={`g-${i}`}>
                          {paged.slice(i, i + perRowGroup).map(renderCard)}
                          <InFeedAd key={`ad-${i}`} />
                        </Fragment>
                      );
                    }
                    return groups;
                  })()}
                </div>

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
              </>
            )}
          </section>

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
