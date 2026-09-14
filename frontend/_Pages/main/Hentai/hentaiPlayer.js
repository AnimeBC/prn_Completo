'use client';

import { useEffect, useState } from 'react';
import styles from './hentaiPlayer.module.css';
import HentaiReproductor from '@/_Pages/main/Hentai/componentes/reproductor';
import HentaiInfo from '@/_Pages/main/Hentai/componentes/videoinfo';
import Recomendados from '@/_Pages/main/Videos/componentes/recomendados';
import MasHentai from '@/_Pages/main/Hentai/componentes/masvideos';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';

export default function HentaiPlayer({ hentaiId, src = '', info = null, capitulos = [] }) {
  const [theater, setTheater] = useState(false);
  const [capId, setCapId] = useState(capitulos[0]?.id ?? null);

  useEffect(() => { setCapId(capitulos[0]?.id ?? null); }, [hentaiId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = capitulos.find((c) => c.id === capId) || capitulos[0] || null;
  const playerSrc = active?.src || src;

  const chapterList = capitulos.length > 0 && (
    <section className={styles.chapters}>
      <h2 className={styles.chaptersTitle}>
        <ion-icon name="albums-outline" suppressHydrationWarning></ion-icon>
        Capítulos ({capitulos.length})
      </h2>
      <div className={styles.chaptersScroll}>
        {capitulos.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.chapter} ${active?.id === c.id ? styles.chapterActive : ''}`}
            onClick={() => setCapId(c.id)}
          >
            <span className={styles.chapterNum}>Cap. {c.numero}</span>
            {c.titulo_es && <span className={styles.chapterName}>{c.titulo_es}</span>}
            <span className={styles.chapterDur}>{c.duracion || '00:00'}</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <main className={styles.main}>
      <div className={`${styles.grid} ${theater ? styles.theater : ''}`}>
        {theater ? (
          <>
            <div className={styles.playerFull}>
              <HentaiReproductor src={playerSrc} theater={theater} onToggleTheater={() => setTheater((p) => !p)} />
            </div>
            <div className={styles.leftCol}>
              <HentaiInfo hentaiId={hentaiId} info={info} src={playerSrc} />
              {chapterList}
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
              <HentaiReproductor src={playerSrc} theater={theater} onToggleTheater={() => setTheater((p) => !p)} />
              <HentaiInfo hentaiId={hentaiId} info={info} src={playerSrc} />
              {chapterList}
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
