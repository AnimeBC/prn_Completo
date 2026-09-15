'use client';

import { useEffect, useState } from 'react';
import styles from './hentaiPlayer.module.css';
import HentaiReproductor from '@/_Pages/main/Hentai/componentes/reproductor';
import HentaiInfo from '@/_Pages/main/Hentai/componentes/videoinfo';
import Recomendados from '@/_Pages/main/Videos/componentes/recomendados';
import MasHentai from '@/_Pages/main/Hentai/componentes/masvideos';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';

const MODOS = [
  { id: 'sub', label: 'Subtitulado ES', short: 'Sub', icon: 'text-outline' },
  { id: 'es', label: 'Español', short: 'Esp', icon: 'volume-high-outline' },
  { id: 'en', label: 'Inglés', short: 'Ing', icon: 'volume-high-outline' },
  { id: 'en_sub', label: 'Inglés subtitulado', short: 'Ing.sub', icon: 'text-outline' },
];

function modoLabel(m) {
  return MODOS.find((x) => x.id === m)?.label || m;
}

function pickModo(cap, prefer) {
  const fuentes = cap?.fuentes || [];
  if (fuentes.some((f) => f.modo === prefer)) return prefer;
  return fuentes[0]?.modo || 'sub';
}

export default function HentaiPlayer({ hentaiId, info = null, serie = null, capitulos = [] }) {
  const [theater, setTheater] = useState(false);
  const [capId, setCapId] = useState(capitulos[0]?.id ?? null);
  const [modo, setModo] = useState(pickModo(capitulos[0], 'sub'));

  useEffect(() => {
    const first = capitulos[0];
    setCapId(first?.id ?? null);
    setModo(pickModo(first, 'sub'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hentaiId]);

  const activeCap = capitulos.find((c) => c.id === capId) || capitulos[0] || null;
  const fuentes = activeCap?.fuentes || [];
  const activeFuente = fuentes.find((f) => f.modo === modo) || fuentes[0] || null;
  const playerSrc = activeFuente?.src || '';

  // Metadatos del modo seleccionado (título, descripción, tags, tipo, estado…)
  const md = (serie?.modos && serie.modos[modo]) || {};
  const meta = {
    title: md.titulo || serie?.title || info?.title,
    desc: md.descripcion || serie?.desc || info?.desc,
    tipo: md.tipo || serie?.tipo,
    anio: md.anio || serie?.anio,
    temporada: md.temporada || serie?.temporada,
    estado: md.estado || serie?.estado,
    tags: md.tags || serie?.tags || [],
  };

  function selectCap(c) {
    setCapId(c.id);
    setModo(pickModo(c, modo));
  }

  const malHeader = (
    <header className={styles.malHead}>
      <div className={styles.malCoverWrap}>
        {serie?.thumb
          ? <img className={styles.malCover} src={serie.thumb} alt="" />
          : <span className={styles.malCoverEmpty}><ion-icon name="images-outline" suppressHydrationWarning></ion-icon></span>}
      </div>
      <div className={styles.malBody}>
        {activeCap && <p className={styles.malEpisode}>Episodio {activeCap.numero} · {modoLabel(modo)}</p>}
        <h1 className={styles.malTitle}>{meta.title || `Anime #${hentaiId}`}</h1>
        <div className={styles.malMeta}>
          {meta.tipo && <span className={styles.malChip}>{meta.tipo}</span>}
          {meta.anio && <span className={styles.malChip}>{meta.anio}</span>}
          {meta.temporada && <span className={styles.malChip}>{meta.temporada}</span>}
          {meta.estado && <span className={styles.malChip}>{meta.estado}</span>}
        </div>
        {meta.desc && <p className={styles.malDesc}>{meta.desc}</p>}
        <div className={styles.malRatingRow}>
          <div className={styles.malRatingBox}>
            <span className={styles.malRatingVal}>{Number(serie?.rating || 0).toFixed(1)}</span>
            <span className={styles.malRatingLabel}>MAL RATING</span>
          </div>
          <span className={styles.malVotes}>{Number(serie?.votos || 0).toLocaleString('es-PE')} Votos</span>
        </div>
      </div>
    </header>
  );

  const modeToggle = fuentes.length > 0 && (
    <div className={styles.modes}>
      {MODOS.map((m) => {
        const has = fuentes.some((f) => f.modo === m.id);
        return (
          <button
            key={m.id}
            type="button"
            className={`${styles.modeBtn} ${modo === m.id ? styles.modeActive : ''}`}
            disabled={!has}
            onClick={() => has && setModo(m.id)}
          >
            <ion-icon name={m.icon} suppressHydrationWarning></ion-icon>
            {m.label}
          </button>
        );
      })}
    </div>
  );

  const episodeList = capitulos.length > 0 && (
    <section className={styles.chapters}>
      <h2 className={styles.chaptersTitle}>
        <ion-icon name="albums-outline" suppressHydrationWarning></ion-icon>
        Episodios ({capitulos.length})
      </h2>
      <div className={styles.chaptersScroll}>
        {capitulos.map((c) => {
          const modos = (c.fuentes || []).map((f) => f.modo);
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.chapter} ${activeCap?.id === c.id ? styles.chapterActive : ''}`}
              onClick={() => selectCap(c)}
            >
              <span className={styles.chapterNum}>Ep. {c.numero}</span>
              {c.titulo_es && <span className={styles.chapterName}>{c.titulo_es}</span>}
              <span className={styles.chapterModes}>
                {MODOS.filter((m) => modos.includes(m.id)).map((m) => (
                  <em key={m.id}>{m.short}</em>
                ))}
              </span>
              <span className={styles.chapterDur}>{c.fuentes?.[0]?.duracion || '00:00'}</span>
            </button>
          );
        })}
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
              {modeToggle}
              {episodeList}
              <AdBanner adKey="e483940fff110a871ea3ba9b07dd3259" width={728} height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js" />
            </div>
            <div className={styles.rightColSlim}>
              <Recomendados currentId={hentaiId} />
              <AdBanner adKey="3a837969e396afcbcfc39bb7494cfe37" width={300} height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js" />
              <MasHentai currentId={hentaiId} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.leftCol}>
              {malHeader}
              <HentaiReproductor src={playerSrc} theater={theater} onToggleTheater={() => setTheater((p) => !p)} />
              {modeToggle}
              {episodeList}
              <HentaiInfo hentaiId={hentaiId} info={info} src={playerSrc} />
              <AdBanner adKey="e483940fff110a871ea3ba9b07dd3259" width={728} height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js" />
            </div>
            <div className={styles.rightCol}>
              <Recomendados currentId={hentaiId} />
              <AdBanner adKey="3a837969e396afcbcfc39bb7494cfe37" width={300} height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js" />
              <MasHentai currentId={hentaiId} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
