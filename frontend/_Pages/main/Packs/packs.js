'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './packs.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';

const PER_PAGE = 16;

function parseNum(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

const DROP_DESCARGAS = ['Más descargados', 'Menos descargados'];
const DROP_BUSCADOS = ['Más buscados', 'Menos buscados'];
const DROP_NUEVOS = ['Nuevos primero', 'Antiguos primero'];
const DROP_CATEGORIA = ['Todas', 'Grandes (+30 fotos)', 'Completos (+3 videos)'];

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

export default function PacksClient() {
  const router = useRouter();
  const { packs } = useContenido();
  const [descargas, setDescargas] = useState(DROP_DESCARGAS[0]);
  const [buscados, setBuscados] = useState(DROP_BUSCADOS[0]);
  const [novedad, setNovedad] = useState(DROP_NUEVOS[0]);
  const [categoria, setCategoria] = useState(DROP_CATEGORIA[0]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const rowRef = useRef(null);

  // Querys propias de packs (distintas al buscador global del header).
  // Lee los valores iniciales para links compartidos y los mantiene sincronizados.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    if (q) setQuery(q);
    const d = p.get('descargas');
    if (d && DROP_DESCARGAS.includes(d)) setDescargas(d);
    const b = p.get('buscados');
    if (b && DROP_BUSCADOS.includes(b)) setBuscados(b);
    const n = p.get('novedad');
    if (n && DROP_NUEVOS.includes(n)) setNovedad(n);
    const c = p.get('categoria');
    if (c && DROP_CATEGORIA.includes(c)) setCategoria(c);
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg >= 1) setPage(pg);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set('q', query.trim());
      if (descargas !== DROP_DESCARGAS[0]) p.set('descargas', descargas);
      if (buscados !== DROP_BUSCADOS[0]) p.set('buscados', buscados);
      if (novedad !== DROP_NUEVOS[0]) p.set('novedad', novedad);
      if (categoria !== DROP_CATEGORIA[0]) p.set('categoria', categoria);
      if (page > 1) p.set('page', String(page));
      const qs = p.toString();
      router.replace(qs ? `/packs?${qs}` : '/packs', { scroll: false });
    }, 400);
    return () => clearTimeout(t);
  }, [query, descargas, buscados, novedad, categoria, page, router]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => setIsMobile(e.matches);
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
    descargas !== DROP_DESCARGAS[0] ||
    buscados !== DROP_BUSCADOS[0] ||
    novedad !== DROP_NUEVOS[0] ||
    categoria !== DROP_CATEGORIA[0];

  const top10 = [...packs].sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas)).slice(0, 10);

  let list = [...packs];
  if (categoria === 'Grandes (+30 fotos)') list = list.filter((p) => p.fotos >= 30);
  if (categoria === 'Completos (+3 videos)') list = list.filter((p) => p.videos >= 3);
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.uploader.toLowerCase().includes(q));
  if (descargas === 'Más descargados') list.sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas));
  else list.sort((a, b) => parseNum(a.descargas) - parseNum(b.descargas));
  if (buscados === 'Más buscados') list.sort((a, b) => parseNum(b.views) - parseNum(a.views));
  else list.sort((a, b) => parseNum(a.views) - parseNum(b.views));
  if (novedad === 'Antiguos primero') list.reverse();

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
    setDescargas(DROP_DESCARGAS[0]);
    setBuscados(DROP_BUSCADOS[0]);
    setNovedad(DROP_NUEVOS[0]);
    setCategoria(DROP_CATEGORIA[0]);
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
        onClick={() => goPack(pack.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            goPack(pack.id);
          }
        }}
      >
        <div className={styles.thumb}>
          <span className={styles.packBadge}>PACK</span>
          <ion-icon name="image-outline" className={styles.thumbIcon} suppressHydrationWarning></ion-icon>
          <span className={styles.thumbLabel}>IMAGEN DE PACK</span>
        </div>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <h3 className={styles.cardTitle}>{pack.title}</h3>
            <ion-icon name="lock-closed-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
          </div>
          <span className={styles.uploader}>{pack.uploader}</span>
          <span className={styles.meta}>{pack.fotos} Fotos + {pack.videos} Videos</span>
          <span className={styles.views}>
            <ion-icon name="eye-outline" className={styles.eyeIcon} suppressHydrationWarning></ion-icon>
            {pack.views}
          </span>
          <span className={styles.downloads}>
            <ion-icon name="download-outline" className={styles.eyeIcon} suppressHydrationWarning></ion-icon>
            {pack.descargas}
          </span>
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
                <h1 className={styles.title}>Packs populares</h1>
                <p className={styles.subtitle}>Todos los Packs</p>
              </div>
              <div className={styles.toolbar}>
                <Drop options={DROP_DESCARGAS} value={descargas} onChange={(v) => { setDescargas(v); setPage(1); }} />
                <Drop options={DROP_BUSCADOS} value={buscados} onChange={(v) => { setBuscados(v); setPage(1); }} />
                <Drop options={DROP_NUEVOS} value={novedad} onChange={(v) => { setNovedad(v); setPage(1); }} />
                <Drop options={DROP_CATEGORIA} value={categoria} onChange={(v) => { setCategoria(v); setPage(1); }} extraIcon />
              </div>
            </div>

            <div className={styles.searchRow}>
              <div className={styles.searchBox}>
                <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder="Buscar por nombre o persona..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                />
                {query && (
                  <button className={styles.searchClear} type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}>
                    <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
                  </button>
                )}
              </div>
            </div>

            {!isFiltering && (
              <div className={styles.topSection}>
                <h2 className={styles.sectionTitle}>Los 10 más descargados</h2>
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
                      aria-label="Anterior"
                      onClick={() => scrollRow(-1)}
                    >
                      <ion-icon name="chevron-back-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
                    </button>
                  )}
                  {canRight && (
                    <button
                      className={`${styles.edgeBtn} ${styles.edgeBtnRight}`}
                      type="button"
                      aria-label="Siguiente"
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
              <h2 className={styles.sectionTitle}>{isFiltering ? 'Resultados' : 'Todos los packs'}</h2>
              <div className={styles.allHeadRight}>
                {isFiltering && (
                  <button className={styles.clearFiltersBtn} type="button" onClick={clearFilters}>
                    <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                    Borrar filtros
                  </button>
                )}
                <span className={styles.count}>{list.length} packs</span>
              </div>
            </div>

            {list.length === 0 ? (
              <p className={styles.empty}>No hay packs con esos filtros por ahora.</p>
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
                    aria-label="Página anterior"
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
                    aria-label="Página siguiente"
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
