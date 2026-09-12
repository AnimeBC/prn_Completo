'use client';

import { useRef, useState } from 'react';
import styles from './preview.module.css';

export default function Preview({ src, thumb, ratio = '16 / 9', children }) {
  const videoRef = useRef(null);
  const timer = useRef(null);
  const [active, setActive] = useState(false);

  function enter() {
    if (!src) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.currentTime = 0;
        const p = v.play();
        if (p) p.then(() => setActive(true)).catch(() => {});
        else setActive(true);
      } catch {
        // sin preview
      }
    }, 350);
  }

  function leave() {
    clearTimeout(timer.current);
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        // sin preview
      }
    }
    setActive(false);
  }

  return (
    <div
      className={styles.box}
      style={{ aspectRatio: ratio }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div className={styles.static} />
      {thumb && !active && (
        <img src={thumb} alt="" loading="lazy" className={styles.thumbImg} />
      )}
      {src && (
        <video
          ref={videoRef}
          className={`${styles.video} ${active ? styles.on : ''}`}
          src={src}
          muted
          loop
          playsInline
          preload="none"
        />
      )}
      <div className={styles.top}>{children}</div>
    </div>
  );
}
