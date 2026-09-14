'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styles from './postRoll.module.css';
import { VAST_TAG, fetchVastAd, firePixels } from './vast.js';

export function isVastEnabled() {
  return Boolean(VAST_TAG);
}

/**
 * Anuncio post-roll (ExoClick VAST). Se coloca como hijo del contenedor del
 * reproductor y se dispara con `ref.current.request()` cuando el video termina.
 */
const VastPostRoll = forwardRef(function VastPostRoll({ tagUrl = VAST_TAG, onFinish }, ref) {
  const [ad, setAd] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [skipIn, setSkipIn] = useState(0);
  const [clickThrough, setClickThrough] = useState(null);
  const videoRef = useRef(null);
  const startedRef = useRef(false);
  const timerRef = useRef(null);
  const adRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function request() {
    if (playing || !tagUrl) return false;
    try {
      const a = await fetchVastAd(tagUrl);
      if (!a || !a.mediaFile) return false;
      adRef.current = a;
      startedRef.current = false;
      setClickThrough(a.clickThrough);
      setAd(a);
      setPlaying(true);
      // contador para saltar
      setSkipIn(Number.isFinite(a.skipAfter) ? a.skipAfter : 5);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSkipIn((s) => {
          if (s <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0; }
          return s - 1;
        });
      }, 1000);
      return true;
    } catch {
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ request }), [playing, tagUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si el navegador bloquea el autoplay del anuncio, lo saltamos.
  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => finish());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function onAdPlay() {
    if (startedRef.current) return;
    startedRef.current = true;
    firePixels(adRef.current?.impression);
    const t = (adRef.current?.tracking || []).filter((x) => x.event === 'start');
    firePixels(t.map((x) => x.url));
  }

  function finish() {
    const a = adRef.current;
    if (a) {
      firePixels(a.tracking.filter((x) => x.event === 'complete').map((x) => x.url));
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    startedRef.current = false;
    adRef.current = null;
    setPlaying(false);
    setAd(null);
    onFinish?.();
  }

  function skip() {
    const a = adRef.current;
    if (a) firePixels(a.tracking.filter((x) => x.event === 'skip').map((x) => x.url));
    finish();
  }

  function openClick() {
    if (!clickThrough) return;
    firePixels(adRef.current?.clickTracking);
    try { window.open(clickThrough, '_blank', 'noopener,noreferrer'); } catch { /* noop */ }
  }

  if (!playing || !ad) return null;

  return (
    <div className={styles.layer}>
      <video
        ref={videoRef}
        className={styles.video}
        src={ad.mediaFile}
        autoPlay
        playsInline
        onPlay={onAdPlay}
        onEnded={finish}
        onError={finish}
        onClick={openClick}
      />
      <span className={styles.tag}>Anuncio</span>

      {clickThrough && (
        <button type="button" className={styles.cta} onClick={openClick}>
          Más información
          <ion-icon name="open-outline" suppressHydrationWarning></ion-icon>
        </button>
      )}

      {skipIn > 0 ? (
        <span className={styles.skipWait}>Podrás saltar en {skipIn}s</span>
      ) : (
        <button type="button" className={styles.skip} onClick={skip}>
          Saltar anuncio
          <ion-icon name="play-skip-forward-outline" suppressHydrationWarning></ion-icon>
        </button>
      )}
    </div>
  );
});

export default VastPostRoll;
