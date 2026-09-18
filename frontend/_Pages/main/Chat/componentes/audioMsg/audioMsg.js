'use client';

import { useRef, useState } from 'react';
import styles from './audioMsg.module.css';
import { soloUnoPlay } from '@/_Extras/Media/onlyOne.js';

function fmt(s) {
  if (!s || Number.isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Reproductor de nota de voz con diseño propio. */
export default function AudioMsg({ src, mine = false, onPlay = null }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seek(e) {
    const a = ref.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    a.currentTime = ratio * dur;
  }

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className={`${styles.audio} ${mine ? styles.audioMine : ''}`}>
      <button type="button" className={styles.play} onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        <ion-icon name={playing ? 'pause' : 'play'} suppressHydrationWarning></ion-icon>
      </button>
      <div className={styles.track} onClick={seek} role="slider" aria-label="Progreso" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
        <div className={styles.knob} style={{ left: `${pct}%` }} />
      </div>
      <span className={styles.time}>{fmt(cur)}</span>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => { soloUnoPlay(ref.current); setPlaying(true); if (onPlay) onPlay(); }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setCur(0); }}
      />
    </div>
  );
}
