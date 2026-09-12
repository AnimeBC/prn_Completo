'use client';

import { useState } from 'react';
import styles from './hentaiPlayer.module.css';
import HentaiReproductor from '@/_Pages/main/Hentai/componentes/reproductor';
import HentaiInfo from '@/_Pages/main/Hentai/componentes/videoinfo';
import Recomendados from '@/_Pages/main/Videos/componentes/recomendados';
import MasHentai from '@/_Pages/main/Hentai/componentes/masvideos';
import Comentarios from '@/_Pages/main/Videos/componentes/comentarios';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';

export default function HentaiPlayer({ hentaiId, src = '/videos/1.mov', info = null }) {
  const [theater, setTheater] = useState(false);

  return (
    <main className={styles.main}>
      <div className={`${styles.grid} ${theater ? styles.theater : ''}`}>
        {theater ? (
          <>
            <div className={styles.playerFull}>
              <HentaiReproductor src={src} theater={theater} onToggleTheater={() => setTheater((p) => !p)} />
            </div>
            <div className={styles.leftCol}>
              <HentaiInfo hentaiId={hentaiId} info={info} src={src} />
              <Comentarios videoId={`hentai-${hentaiId}`} />
              <AdBanner
                adKey="e483940fff110a871ea3ba9b07dd3259"
                width={728}
                height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
              />
            </div>
            <div className={styles.rightColSlim}>
              <Recomendados currentId={hentaiId} />
              <AdBanner
                adKey="3a837969e396afcbcfc39bb7494cfe37"
                width={300}
                height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
              />
              <MasHentai currentId={hentaiId} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.leftCol}>
              <HentaiReproductor src={src} theater={theater} onToggleTheater={() => setTheater((p) => !p)} />
              <HentaiInfo hentaiId={hentaiId} info={info} src={src} />
              <Comentarios videoId={`hentai-${hentaiId}`} />
              <AdBanner
                adKey="e483940fff110a871ea3ba9b07dd3259"
                width={728}
                height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
              />
            </div>
            <div className={styles.rightCol}>
              <Recomendados currentId={hentaiId} />
              <AdBanner
                adKey="3a837969e396afcbcfc39bb7494cfe37"
                width={300}
                height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
              />
              <MasHentai currentId={hentaiId} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
