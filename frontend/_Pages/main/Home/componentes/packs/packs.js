'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './packs.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Packs() {
  const trackRef = useRef(null);
  const router = useRouter();
  const { t } = useLanguage();
  const { packs } = useContenido();
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function update() {
      setCanLeft(track.scrollLeft > 8);
      setCanRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 8);
    }
    update();
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      track.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function scrollByDir(dir) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('secciones.packsPopulares')}</h2>
        <div className={styles.actions}>
          <a href="/packs" className={styles.verMas}>
            {t('secciones.verMas')}
            <ion-icon name="arrow-forward-outline" className={styles.verMasIcon} suppressHydrationWarning></ion-icon>
          </a>
        </div>
      </div>

      <div className={styles.viewport}>
        <div className={styles.track} ref={trackRef}>
          {packs.map((pack) => (
            <article
              key={pack.id}
              className={styles.card}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/packs/${pack.public_id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(`/packs/${pack.public_id}`);
                }
              }}
            >
              <div className={styles.thumb}>
                {pack.thumb
                  ? <img className={styles.thumbImg} src={pack.thumb} alt="" loading="lazy" />
                  : <span className={styles.thumbEmpty}><ion-icon name="cube-outline" suppressHydrationWarning></ion-icon></span>}
                <span className={styles.packBadge}>
                  <ion-icon name="cube-outline" className={styles.packBadgeIcon} suppressHydrationWarning></ion-icon>
                  PACK
                </span>
              </div>
              <div className={styles.info}>
                <h3 className={styles.cardTitle}>{pack.title}</h3>
                <p className={styles.meta}>{pack.fotos} {t('packs.fotos')} • {pack.videos} {t('packs.videos')}</p>
                <span className={styles.views}>{pack.views}</span>
              </div>
            </article>
          ))}
        </div>
        {canLeft && <div className={`${styles.edge} ${styles.edgeLeft}`} aria-hidden="true" />}
        {canRight && <div className={`${styles.edge} ${styles.edgeRight}`} aria-hidden="true" />}
        {canLeft && (
          <button
            className={`${styles.edgeBtn} ${styles.edgeBtnLeft}`}
            type="button"
            aria-label="Anterior"
            onClick={() => scrollByDir(-1)}
          >
            <ion-icon name="chevron-back-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
          </button>
        )}
        {canRight && (
          <button
            className={`${styles.edgeBtn} ${styles.edgeBtnRight}`}
            type="button"
            aria-label="Siguiente"
            onClick={() => scrollByDir(1)}
          >
            <ion-icon name="chevron-forward-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
          </button>
        )}
      </div>
    </section>
  );
}
