'use client';

import { useRef, useState } from 'react';
import styles from './reproductor.module.css';

const SPEEDS = [1, 1.25, 1.5, 2];

// TODO(BD): reemplazar `src` por las URLs reales de la base de datos.
// Por ahora todas apuntan al único archivo disponible; 720p es la calidad por defecto.
const QUALITIES = [
  { label: '1080p', src: '/videos/1.mov' },
  { label: '720p HD', src: '/videos/1.mov', def: true },
  { label: '480p', src: '/videos/1.mov' },
  { label: 'Automático', src: '/videos/1.mov' },
];

function fmt(sec) {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function HentaiReproductor({ src = '/videos/1.mov', theater, onToggleTheater }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState(QUALITIES.find((q) => q.def)?.label || QUALITIES[0].label);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);

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
    const t = v ? v.currentTime : 0;
    const wasPlaying = v ? !v.paused : false;
    setQuality(q.label);
    setQualityOpen(false);
    if (v) {
      setVideoError(false);
      v.load();
      v.playbackRate = speed;
      v.currentTime = t;
      if (wasPlaying) v.play();
    }
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
          src={src}
          preload="auto"
          playsInline
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          onClick={togglePlay}
          onLoadStart={() => setWaiting(true)}
          onPlay={() => { setPlaying(true); setWaiting(false); }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onStalled={() => setWaiting(true)}
          onSeeking={() => setWaiting(true)}
          onSeeked={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlayThrough={() => setWaiting(false)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onProgress={(e) => syncBuffered(e.currentTarget)}
          onLoadedMetadata={(e) => syncDuration(e.currentTarget)}
          onDurationChange={(e) => syncDuration(e.currentTarget)}
          onCanPlay={(e) => { setVideoError(false); setWaiting(false); syncDuration(e.currentTarget); }}
          onError={() => { setVideoError(true); setWaiting(false); }}
        />
        {waiting && !videoError && (
          <div className={styles.spinnerOverlay} aria-hidden="true">
            <div className={styles.spinner} />
          </div>
        )}
        {videoError && (
          <div className={styles.videoError}>
            <ion-icon name="alert-circle-outline" className={styles.videoErrorIcon} suppressHydrationWarning></ion-icon>
            <p className={styles.videoErrorText}>Could not load the anime</p>
            <span className={styles.videoErrorSub}>Check the file or try another quality</span>
            <button className={styles.videoRetryBtn} type="button" onClick={retry}>
              <ion-icon name="refresh-outline" className={styles.videoRetryIcon} suppressHydrationWarning></ion-icon>
              Retry
            </button>
          </div>
        )}
        {qualityOpen && (
          <div className={styles.qualityMenu}>
            <p className={styles.qualityTitle}>Quality</p>
            {QUALITIES.map((q) => (
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
          <div className={styles.progress} onClick={seek} role="slider" aria-label="Progress" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' && videoRef.current) videoRef.current.currentTime += 5; if (e.key === 'ArrowLeft' && videoRef.current) videoRef.current.currentTime -= 5; }}>
            <div className={styles.bufferedFill} style={{ width: `${Math.min(Math.max(buffered, 0), 1) * 100}%` }} />
            <div className={styles.progressFill} style={{ width: `${pct}%` }}>
              <div className={styles.knob} />
            </div>
          </div>
          <div className={styles.controlsRow}>
            <div className={styles.controlsLeft}>
              <button className={styles.ctrlBtn} type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                <ion-icon name={playing ? 'pause-sharp' : 'play-sharp'} className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              <button className={styles.ctrlBtn} type="button" aria-label="Next anime">
                <ion-icon name="play-skip-forward-sharp" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              <div className={styles.volumeWrap}>
                <button className={styles.ctrlBtn} type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                  <ion-icon name={volumeIcon()} className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
                </button>
                <input
                  className={styles.volumeSlider}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={changeVolume}
                  aria-label="Volume"
                  style={{
                    background: `linear-gradient(to right, #F20D16 ${(muted ? 0 : volume) * 100}%, rgba(242,13,22,0.22) ${(muted ? 0 : volume) * 100}%)`,
                  }}
                />
              </div>
              <span className={styles.time}>{fmt(current)} / {fmt(duration)}</span>
            </div>
            <div className={styles.controlsRight}>
              <button className={styles.speedBtn} type="button" aria-label="Speed" onClick={cycleSpeed}>{speed}x</button>
              <button className={`${styles.ctrlBtn} ${qualityOpen ? styles.ctrlActive : ''}`} type="button" aria-label="Quality" onClick={() => setQualityOpen((p) => !p)}>
                <ion-icon name="settings-sharp" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              <button className={styles.ctrlBtn} type="button" aria-label="Mini player" onClick={togglePip}>
                <ion-icon name="albums-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              <button className={`${styles.ctrlBtn} ${theater ? styles.ctrlActive : ''}`} type="button" aria-label="Theater mode" onClick={onToggleTheater}>
                <ion-icon name="square-outline" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
              <button className={styles.ctrlBtn} type="button" aria-label="Fullscreen" onClick={toggleFullscreen}>
                <ion-icon name="expand-sharp" className={styles.ctrlIcon} suppressHydrationWarning></ion-icon>
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}
