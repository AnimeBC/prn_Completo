'use client';

import { useRef, useState } from 'react';
import styles from './videos.module.css';
import Reproductor from '@/_Pages/main/Videos/componentes/reproductor';
import VideoInfo from '@/_Pages/main/Videos/componentes/videoinfo';
import Recomendados from '@/_Pages/main/Videos/componentes/recomendados';
import MasVideos from '@/_Pages/main/Videos/componentes/masvideos';
import Comentarios from '@/_Pages/main/Videos/componentes/comentarios';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import { viewVideo } from '@/_Extras/Interacciones/interactions.js';

export default function VideosClient({ videoId, src = '/videos/1.mov', info = null, renditions = [] }) {
  const [theater, setTheater] = useState(false);
  // La vista cuenta UNA sola vez por sesión de reproducción: al primer PLAY
  // (no al abrir la página). Anónimo incluido (guest key en el body).
  const vistaRef = useRef(false);
  function alPrimerPlay() {
    if (vistaRef.current) return;
    vistaRef.current = true;
    viewVideo(videoId).then((d) => {
      if (d && !d.error && d.views != null) {
        // Avisa al detalle (contador) y a las listas (debounce) — local, sin SSE.
        window.dispatchEvent(new CustomEvent('pkp:vista', { detail: { views: d.views } }));
      }
    });
  }

  return (
    <main className={styles.main}>
      <div className={`${styles.grid} ${theater ? styles.theater : ''}`}>
        {theater ? (
          <>
            <div className={styles.playerFull}>
              <Reproductor src={src} renditions={renditions} theater={theater} onToggleTheater={() => setTheater((p) => !p)} onPlay={alPrimerPlay} />
            </div>
            <div className={styles.leftCol}>
              <VideoInfo videoId={videoId} info={info} src={src} />
              <Comentarios videoId={videoId} />
              <AdBanner
                adKey="e483940fff110a871ea3ba9b07dd3259"
                width={728}
                height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
              />
            </div>
            <div className={styles.rightColSlim}>
              <Recomendados currentId={videoId} />
              <AdBanner
                adKey="3a837969e396afcbcfc39bb7494cfe37"
                width={300}
                height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
              />
              <MasVideos currentId={videoId} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.leftCol}>
              <Reproductor src={src} renditions={renditions} theater={theater} onToggleTheater={() => setTheater((p) => !p)} onPlay={alPrimerPlay} />
              <VideoInfo videoId={videoId} info={info} src={src} />
              <Comentarios videoId={videoId} />
              <AdBanner
                adKey="e483940fff110a871ea3ba9b07dd3259"
                width={728}
                height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
              />
            </div>
            <div className={styles.rightCol}>
              <Recomendados currentId={videoId} />
              <AdBanner
                adKey="3a837969e396afcbcfc39bb7494cfe37"
                width={300}
                height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
              />
              <MasVideos currentId={videoId} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
