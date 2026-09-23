'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import styles from './reproductor.module.css';
import VastPostRoll from '@/_Extras/Ads/VastPostRoll.js';
import { soloUnoPlay, soloUnoStop } from '@/_Extras/Media/onlyOne.js';

const SPEEDS = [1, 1.25, 1.5, 2];

function fmt(sec) {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const Reproductor = forwardRef(function Reproductor({
  src = '/videos/1.mov',
  renditions = [],
  theater,
  onToggleTheater,
  compact = false,
  onPlay = null,
  ads = true,
  startTime = 0,
  onTime = null,
}, ref) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const resumeRef = useRef(null);
  const adRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Calidades: las que generó el backend (1080p→360p). Si no hay, cae al src.
  const qualities = useMemo(() => {
    const list = Array.isArray(renditions) && renditions.length
      ? renditions.map((x) => ({ label: x.label, src: x.src }))
      : [{ label: 'Original', src }];
    return list;
  }, [renditions, src]);

  const [currentSrc, setCurrentSrc] = useState(src);
  const [quality, setQuality] = useState(() => qualities[0]?.label || 'Original');
  const [qualityOpen, setQualityOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setQuality(qualities[0]?.label || 'Original');
    setCurrent(0);
    setWaiting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const pct = duration ? (current / duration) * 100 : 0;

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function seek(e) {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const v = videoRef.current;
    if (v && duration) {
      setWaiting(true);
      v.currentTime = ratio * duration;
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function changeVolume(e) {
    const val = Number(e.target.value);
    const v = videoRef.current;
    setVolume(val);
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setMuted(val === 0);
  }

  function volumeIcon() {
    if (muted || volume === 0) return 'volume-mute-sharp';
    if (volume < 0.5) return 'volume-low-sharp';
    return 'volume-high-sharp';
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  function selectQuality(q) {
    const v = videoRef.current;
    if (v && q.src === currentSrc) { setQualityOpen(false); return; }
    resumeRef.current = v ? { time: v.currentTime, playing: !v.paused } : null;
    setVideoError(false);
    setQuality(q.label);
    setCurrentSrc(q.src);
    setQualityOpen(false);
  }

  function syncDuration(target) {
    if (target && Number.isFinite(target.duration)) {
      setDuration(target.duration);
    }
  }

  function syncBuffered(target) {
    try {
      if (target && target.buffered && target.buffered.length > 0 && Number.isFinite(target.duration) && target.duration > 0) {
        setBuffered(target.buffered.end(target.buffered.length - 1) / target.duration);
      }
    } catch {
      // buffered no disponible
    }
  }

  function retry() {
    const v = videoRef.current;
    setVideoError(false);
    setCurrent(0);
    if (v) v.load();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wrapRef.current) wrapRef.current.requestFullscreen();
  }

  // Permite ampliar a pantalla completa desde afuera (ej. el botón del chat).
  useImperativeHandle(ref, () => ({
    fullscreen: () => { if (wrapRef.current) wrapRef.current.requestFullscreen(); },
  }), []);

  async function togglePip() {
    try {
      const v = videoRef.current;
      if (!v) return;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      // PiP no soportado
    }
  }

  return (
    <div className={`${styles.player} ${theater ? styles.playerTheater : ''}`} ref={wrapRef}>
      <video
          ref={videoRef}
          className={styles.video}
          src={currentSrc}
          preload="auto"
          playsInline
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          onClick={togglePlay}
          onLoadStart={() => setWaiting(true)}
          onPlay={() => { soloUnoPlay(videoRef.current); setPlaying(true); setWaiting(false); if (onPlay) onPlay(); }}
          onPause={() => { setPlaying(false); soloUnoStop(videoRef.current); }}
          onWaiting={() => setWaiting(true)}
          onStalled={() => setWaiting(true)}
          onSeeking={() => setWaiting(true)}
          onSeeked={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlayThrough={() => setWaiting(false)}
          onTimeUpdate={(e) => { setCurrent(e.currentTarget.currentTime); if (onTime) onTime(e.currentTarget.currentTime); }}
          onProgress={(e) => syncBuffered(e.currentTarget)}
          onLoadedMetadata={(e) => {
            syncDuration(e.currentTarget);
            const r = resumeRef.current;
            if (r) {
              try { e.currentTarget.currentTime = r.time; } catch { /* ignore */ }
              if (r.playing) e.currentTarget.play().catch(() => {});
              resumeRef.current = null;
            } else if (startTime > 0) {
              try { e.currentTarget.currentTime = startTime; } catch { /* ignore */ }
            }
          }}
          onDurationChange={(e) => syncDuration(e.currentTarget)}
          onCanPlay={(e) => { setVideoError(false); setWaiting(false); syncDuration(e.currentTarget); }}
          onError={() => { setVideoError(true); setWaiting(false); }}
          onEnded={() => { if (!compact && ads) adRef.current?.request(); }}
        />
        {waiting && !videoError && (
          <div className={styles.spinnerOverlay} aria-hidden="true">
            <div className={styles.spinner} />
          </div>
        )}
        {videoError && (
          <div className={styles.videoError}>
            <ion-icon name="alert-circle-outline" className={styles.videoErrorIcon} suppressHydrationWarning></ion-icon>
            <p className={styles.videoErrorText}>No se pudo cargar el video</p>
            <span className={styles.videoErrorSub}>Revisa el archivo o prueba con otra calidad</span>
            <button className={styles.videoRetryBtn} type="button" onClick={retry}>
              <ion-icon name="refresh-outline" className={styles.videoRetryIcon} suppressHydrationWarning></ion-icon>
              Reintentar
            </button>
          </div>
        )}
        {qualityOpen && (
          <div className={styles.qualityMenu}>
            <p className={styles.qualityTitle}>Calidad</p>
            {qualities.map((q) => (
              <button
                key={q.label}
                className={`${styles.qualityItem} ${q.label === quality ? styles.qualityActive : ''}`}
                type="button"
                onClick={() => selectQuality(q)}
              >
                {q.label === quality && (
                  <ion-icon name="checkmark-sharp" className={styles.qualityCheck} suppressHydrationWarning></ion-icon>
                )}
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.controls}>
          <div className={styles.progress} onClick={seek} role="slider" aria-label="Progreso" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' && videoRef.current) videoRef.current.currentTime += 5; if (e.key === 'ArrowLeft' && videoRef.current) videoRef.current.currentTime -= 5; }}>
            <div className={styles.bufferedFill} style={{ width: `${Math.min(Math.max(buffered, 0), 1) * 100}%` }} />
            <div className={styles.progressFill} style={{ width: `${pct}%` }}>
              <div className={styles.knob} />
            </div>
          </div>
          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              <button className={styles.ctrlBtn} type="button" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={togglePlay}>
                <ion-icon name={playing ? 'pause-sharp' : 'play-sharp'} className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              {!compact && (
                <button className={styles.ctrlBtn} type="button" aria-label="Siguiente video">
                  <ion-icon name="play-skip-forward-sharp" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                </button>
              )}
              <div className={styles.volumeWrap}>
                <button className={styles.ctrlBtn} type="button" aria-label={muted ? 'Activar sonido' : 'Silenciar'} onClick={toggleMute}>
                  <ion-icon name={volumeIcon()} className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                </button>
                {!compact && (
                  <input
                    className={styles.volumeSlider}
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    onChange={changeVolume}
                    aria-label="Volumen"
                    style={{
                      background: `linear-gradient(to right, #F20D16 ${(muted ? 0 : volume) * 100}%, rgba(242,13,22,0.22) ${(muted ? 0 : volume) * 100}%)`,
                    }}
                  />
                )}
              </div>
              <span className={styles.time}>{fmt(current)} / {fmt(duration)}</span>
            </div>
            <div className={styles.controlsRight}>
              <button className={styles.speedBtn} type="button" aria-label="Velocidad" onClick={cycleSpeed}>{speed}x</button>
              <button className={`${styles.ctrlBtn} ${qualityOpen ? styles.ctrlActive : ''}`} type="button" aria-label="Calidad del video" aria-haspopup="menu" aria-expanded={qualityOpen} onClick={() => setQualityOpen((p) => !p)}>
                <ion-icon name="settings-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              {!compact && (
                <button className={styles.ctrlBtn} type="button" aria-label="Mini reproductor" onClick={togglePip}>
                  <ion-icon name="albums-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                </button>
              )}
              {!compact && (
                <button className={`${styles.ctrlBtn} ${theater ? styles.ctrlActive : ''}`} type="button" aria-label="Modo teatro" onClick={onToggleTheater}>
                  <ion-icon name="square-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                </button>
              )}
              <button className={styles.ctrlBtn} type="button" aria-label="Pantalla completa" onClick={toggleFullscreen}>
                <ion-icon name="expand-sharp" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
            </div>
        </div>
      </div>
      {!compact && ads && <VastPostRoll ref={adRef} />}
    </div>
  );
});

export default Reproductor;
