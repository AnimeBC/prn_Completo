'use client';

import { useRef, useState, useEffect } from 'react';
import styles from './comunidad.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useSidebar } from '@/app/sidebarContext.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

export default function Comunidad() {
  const trackRef = useRef(null);
  const { openMaint } = useSidebar();
  const { t } = useLanguage();
  const { community: uploads } = useContenido();
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
        <h2 className={styles.title}>{t('secciones.comunidad')}</h2>
        <div className={styles.actions}>
          <a href="/comunidad" className={styles.verMas}>
            {t('secciones.verMas')}
            <ion-icon name="arrow-forward-outline" className={styles.verMasIcon} suppressHydrationWarning></ion-icon>
          </a>
        </div>
      </div>

      <div className={styles.viewport}>
        <div className={styles.track} ref={trackRef}>
          {uploads.map((video) => (
            <article
            key={video.id}
            className={styles.card}
            role="link"
            tabIndex={0}
            onClick={() => openMaint()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMaint();
              }
            }}
          >
              <Preview src={video.src} thumb={video.thumb}>
                <span className={styles.duration}>{video.duration}</span>
              </Preview>
              <div className={styles.info}>
                <h3 className={styles.cardTitle}>{video.title}</h3>
                <p className={styles.meta}>{video.views} • {video.time}</p>
                <div className={styles.tags}>
                  {video.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
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
