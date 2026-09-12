'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './masvideos.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import Preview from '@/_Pages/main/Home/componentes/preview';

const BATCH = 5;

export default function MasVideos({ currentId }) {
  const router = useRouter();
  const { videos: items } = useContenido();
  const [count, setCount] = useState(BATCH);
  const sentinelRef = useRef(null);

  const list = (() => {
    const rest = items.filter((v) => String(v.id) !== String(currentId));
    let seed = (Number(currentId) || 7) * 31 + 13;
    function rand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return rest;
  })();
  const visible = list.slice(0, count);
  const hasMore = count < list.length;

  useEffect(() => {
    setCount(BATCH);
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
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, list.length]);

  function go(id) {
    router.push(`/videos/${id}`);
  }

  return (
    <div className={styles.stack}>
      {visible.map((video) => (
        <div
          key={video.id}
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
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </div>
  );
}
