'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './fila.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import Preview from '@/_Pages/main/Home/componentes/preview';
import { videoUrl, hentaiUrl } from '@/_Extras/Datos/urls.js';

/**
 * Fila/carrusel genérico del home.
 * source: 'videos' | 'hentai' | 'packs'
 */
export default function Fila({ title, href = null, icon = 'flame', source = 'videos', limit = 30 }) {
  const trackRef = useRef(null);
  const router = useRouter();
  const { t } = useLanguage();
  const { videos, hentai, packs } = useContenido();
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const base = source === 'hentai' ? hentai : source === 'packs' ? packs : videos;
  const items = [...(base || [])].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, limit);
  const isVideo = source !== 'hentai' && source !== 'packs';

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
  }, [items.length]);

  function scrollByDir(dir) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
  }

  function go(item) {
    if (source === 'hentai') router.push(hentaiUrl(item));
    else if (source === 'packs') router.push(`/packs/${item.public_id}`);
    else router.push(videoUrl(item));
  }

  if (!items.length) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>{title}</h2>
          <ion-icon name={icon} className={styles.flameIcon} suppressHydrationWarning></ion-icon>
        </div>
        {href && (
          <div className={styles.actions}>
            <a href={href} className={styles.verMas}>
              {t('secciones.verMas')}
              <ion-icon name="arrow-forward-outline" className={styles.verMasIcon} suppressHydrationWarning></ion-icon>
            </a>
          </div>
        )}
      </div>

      <div className={styles.viewport}>
        <div className={styles.track} ref={trackRef}>
          {items.map((item) => (
            <article
              key={item.id}
              className={styles.card}
              role="link"
              tabIndex={0}
              onClick={() => go(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(item); }
              }}
            >
              <Preview src={isVideo ? item.src : undefined} thumb={isVideo ? item.thumb : (item.cover || item.thumb)}>
                <span className={styles.badge}>
                  {source === 'packs'
                    ? `${item.fotos} / ${item.videos}`
                    : isVideo
                      ? item.duration
                      : `${item.chapters} cap.`}
                </span>
              </Preview>
              <div className={styles.info}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.meta}>
                  {source === 'packs' ? item.views : `${item.views} • ${item.time}`}
                </p>
                <div className={styles.tags}>
                  {(item.tags || []).slice(0, 3).map((tag) => (
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
          <button className={`${styles.edgeBtn} ${styles.edgeBtnLeft}`} type="button" aria-label="Anterior" onClick={() => scrollByDir(-1)}>
            <ion-icon name="chevron-back-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
          </button>
        )}
        {canRight && (
          <button className={`${styles.edgeBtn} ${styles.edgeBtnRight}`} type="button" aria-label="Siguiente" onClick={() => scrollByDir(1)}>
            <ion-icon name="chevron-forward-outline" className={styles.navIcon} suppressHydrationWarning></ion-icon>
          </button>
        )}
      </div>
    </section>
  );
}
