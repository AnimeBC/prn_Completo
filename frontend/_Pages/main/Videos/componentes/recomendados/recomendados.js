'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './recomendados.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

const BATCH = 5;
const INITIAL = 6;

export default function Recomendados({ currentId }) {
  const router = useRouter();
  const { videos: items } = useContenido();

  // Meta del video actual para calcular relación (mismo canal + tags compartidos)
  const CURRENT_META = Object.fromEntries(
    items.map((v) => [v.id, { channel: v.channel, tags: v.tags }])
  );
  const [count, setCount] = useState(INITIAL);
  const sentinelRef = useRef(null);

  const list = (() => {
    const meta = CURRENT_META[currentId] || { channel: '', tags: [] };
    const metaTags = meta.tags.map((t) => t.toLowerCase());
    const scored = items
      .filter((v) => String(v.id) !== String(currentId))
      .map((v) => {
        let score = 0;
        if (meta.channel && v.channel === meta.channel) score += 3;
        score += v.tags.filter((t) => metaTags.includes(t.toLowerCase())).length * 2;
        return { ...v, score };
      });
    const related = scored.filter((v) => v.score > 0).sort((a, b) => b.score - a.score);
    const rest = scored.filter((v) => v.score === 0);
    // Shuffle determinista según el video actual para que cada página varíe
    let seed = Number(currentId) || 7;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...related, ...rest];
  })();
  const visible = list.slice(0, count);
  const hasMore = count < list.length;

  useEffect(() => {
    setCount(INITIAL);
  }, [currentId]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setCount((c) => Math.min(c + BATCH, list.length));
        }
      },
      { root: el.parentElement, rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, list.length]);

  function go(id) {
    router.push(`/videos/${id}`);
  }

  return (
    <aside className={styles.side}>
      <div className={styles.sideHead}>
        <h3 className={styles.sideTitle}>A continuación</h3>
        <ion-icon name="options-outline" className={styles.filterIcon} suppressHydrationWarning></ion-icon>
      </div>

      <div className={styles.stack}>
        {visible.map((video, idx) => (
          <div key={`wrap-${video.id}`}>
            {idx > 0 && visible[idx - 1].score > 0 && video.score === 0 && (
              <p className={styles.moreLabel}>Más videos</p>
            )}
            <div
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
              <div className={styles.thumb}>
                <Preview src={video.src} thumb={video.thumb}>
                  <span className={styles.duration}>{video.duration}</span>
                </Preview>
              </div>
              <div className={styles.cardInfo}>
                <h4 className={styles.cardTitle}>{video.title}</h4>
                <span className={styles.channel}>{video.channel}</span>
                <span className={styles.meta}>{video.views} • {video.time}</span>
              </div>
            </div>
          </div>
        ))}
        {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
        {!hasMore && <p className={styles.endMsg}>Subiremos más próximamente</p>}
      </div>
    </aside>
  );
}
