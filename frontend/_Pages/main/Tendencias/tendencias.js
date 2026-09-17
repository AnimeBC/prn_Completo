'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './tendencias.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import { videoUrl } from '@/_Extras/Datos/urls.js';

function parseViews(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
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

export default function TendenciasClient() {
  const router = useRouter();
  const { t } = useLanguage();
  const { videos } = useContenido();
  const [isMobile, setIsMobile] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const perRowGroup = isMobile ? 4 : 8;

  const list = [...videos].filter((v) => v.isTendencia).sort((a, b) => parseViews(b.views) - parseViews(a.views));
  const totalPages = Math.max(1, Math.ceil(list.length / 16));

  // ?page= compartible: lee al entrar y sincroniza al cambiar.
  useEffect(() => {
    const p = Number(new URLSearchParams(window.location.search).get('page'));
    if (Number.isInteger(p) && p >= 1 && p <= totalPages) setPage(p);
  }, [totalPages]);

  function goPage(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    router.replace(next > 1 ? `/tendencias?page=${next}` : '/tendencias', { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const paged = list.slice((page - 1) * 16, page * 16);

  function go(item) {
    router.push(videoUrl(item));
  }

  function renderCard(video, idx) {
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
          <span className={styles.rank}>#{idx + 1}</span>
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

  const groups = [];
  for (let i = 0; i < paged.length; i += perRowGroup) {
    groups.push(
      <Fragment key={`g-${i}`}>
        {paged.slice(i, i + perRowGroup).map((video, j) => renderCard(video, (page - 1) * 16 + i + j))}
        <InFeedAd key={`ad-${i}`} />
      </Fragment>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.title}>{t('nav.tendencias')}</h1>
          <p className={styles.count}>{list.length} {t('secciones.videos')} • {t('secciones.tendenciasDesc') || 'Lo más visto de la plataforma'}</p>
        </div>
      </div>

      <div className={styles.layout2col}>
        <div className={styles.feed}>
          <div className={styles.grid}>
            {groups}
          </div>

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              aria-label={t('paginacion.anterior')}
            >
              <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`${styles.pageBtn} ${p === page ? styles.pageActive : ''}`}
                type="button"
                onClick={() => goPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className={styles.pageBtn}
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
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
