'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hentaiPlayer.module.css';
import HentaiReproductor from '@/_Pages/main/Hentai/componentes/reproductor';
import HentaiInfo from '@/_Pages/main/Hentai/componentes/videoinfo';
import Recomendados from '@/_Pages/main/Videos/componentes/recomendados';
import Comentarios from '@/_Pages/main/Videos/componentes/comentarios';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import { viewHentai } from '@/_Extras/Interacciones/interactions.js';

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

export default function HentaiPlayer({ hentaiId, slug = '', capNumero = null, info = null, serie = null, capitulos = [] }) {
  const router = useRouter();
  const [theater, setTheater] = useState(false);
  const inicial = (capNumero != null && capitulos.find((c) => String(c.numero) === String(capNumero))) || capitulos[0] || null;
  const [capId, setCapId] = useState(inicial?.id ?? null);
  const [modo, setModo] = useState(pickModo(inicial, 'sub'));

  useEffect(() => {
    const sel = (capNumero != null && capitulos.find((c) => String(c.numero) === String(capNumero))) || capitulos[0] || null;
    setCapId(sel?.id ?? null);
    setModo(pickModo(sel, 'sub'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hentaiId, capNumero]);

  const activeCap = capitulos.find((c) => c.id === capId) || capitulos[0] || null;
  const fuentes = activeCap?.fuentes || [];
  const activeFuente = fuentes.find((f) => f.modo === modo) || fuentes[0] || null;
  const playerSrc = activeFuente?.src || '';

  // La vista cuenta UNA sola vez por capítulo y solo al primer PLAY
  // (anónimo incluido: guest key en el body). Sin SSE: el aviso es local.
  const vistaRef = useRef(null);
  function alPrimerPlay() {
    const cap = activeCap?.id;
    if (!cap || vistaRef.current === cap) return;
    vistaRef.current = cap;
    viewHentai(cap).then((d) => {
      if (d && !d.error && d.views != null) {
        window.dispatchEvent(new CustomEvent('pkp:vista', { detail: { views: d.views } }));
      }
    });
  }

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
    if (slug) router.replace(`/hentai/${slug}/${c.numero}`);
  }

  // Títulos alternos disponibles (ES / JA / romaji / EN + títulos extras), sin repetir el principal
  const titulosExtras = [
    ...(Array.isArray(serie?.titulos_extras) ? serie.titulos_extras : []),
    ...Object.values(serie?.modos || {}).flatMap((m) => (Array.isArray(m?.titulos_extras) ? m.titulos_extras : [])),
  ];
  const altTitles = [...new Set(
    [serie?.titulo_es, serie?.titulo_ja, serie?.titulo_romaji, serie?.titulo_en, ...titulosExtras]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  )].filter((x) => x.toLowerCase() !== String(meta.title || '').trim().toLowerCase());

  const header = {
    title: meta.title,
    desc: meta.desc,
    rating: Number(serie?.rating || 0),
    votos: Number(serie?.votos || 0),
    chips: [meta.tipo, meta.anio, meta.temporada, meta.estado].filter(Boolean),
    altTitles,
    tags: meta.tags || [],
    episode: activeCap ? { numero: activeCap.numero, modo: modoLabel(modo) } : null,
  };

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
          const fuente = (c.fuentes || []).find((f) => f.modo === modo) || (c.fuentes || [])[0] || null;
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.chapter} ${activeCap?.id === c.id ? styles.chapterActive : ''}`}
              onClick={() => selectCap(c)}
            >
              <span className={styles.chapterThumbWrap}>
                {fuente?.thumb
                  ? <img className={styles.chapterThumb} src={fuente.thumb} alt="" loading="lazy" />
                  : <ion-icon name="play-outline" className={styles.chapterThumbIcon} suppressHydrationWarning></ion-icon>}
              </span>
              <span className={styles.chapterBody}>
                <span className={styles.chapterNum}>Ep. {c.numero}</span>
                {c.titulo_es && <span className={styles.chapterName}>{c.titulo_es}</span>}
                <span className={styles.chapterMetaRow}>
                  <span className={styles.chapterModes}>
                    {MODOS.filter((m) => modos.includes(m.id)).map((m) => (
                      <em key={m.id}>{m.short}</em>
                    ))}
                  </span>
                  <span className={styles.chapterDur}>{fuente?.duracion || '00:00'}</span>
                </span>
              </span>
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
              <HentaiReproductor src={playerSrc} poster={activeFuente?.thumb || serie?.thumb || ''} theater={theater} onToggleTheater={() => setTheater((p) => !p)} onPlay={alPrimerPlay} />
            </div>
            <div className={styles.leftCol}>
              <div className={styles.epMobile}>{episodeList}</div>
              <HentaiInfo hentaiId={hentaiId} capituloId={activeCap?.id} info={info} src={playerSrc} header={header} />
              {modeToggle}
              {activeCap && <Comentarios hentaiCapId={activeCap.id} />}
              <AdBanner adKey="e483940fff110a871ea3ba9b07dd3259" width={728} height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js" />
            </div>
            <div className={styles.rightColSlim}>
              <div className={styles.epDesktop}>{episodeList}</div>
              <AdBanner adKey="3a837969e396afcbcfc39bb7494cfe37" width={300} height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js" />
              <Recomendados currentId={hentaiId} title="Recomendados" kind="hentai" scroll={false} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.leftCol}>
              <HentaiReproductor src={playerSrc} poster={activeFuente?.thumb || serie?.thumb || ''} theater={theater} onToggleTheater={() => setTheater((p) => !p)} onPlay={alPrimerPlay} />
              <div className={styles.epMobile}>{episodeList}</div>
              {modeToggle}
              <HentaiInfo hentaiId={hentaiId} capituloId={activeCap?.id} info={info} src={playerSrc} header={header} />
              {activeCap && <Comentarios hentaiCapId={activeCap.id} />}
              <AdBanner adKey="e483940fff110a871ea3ba9b07dd3259" width={728} height={90}
                src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js" />
            </div>
            <div className={styles.rightCol}>
              <div className={styles.epDesktop}>{episodeList}</div>
              <AdBanner adKey="3a837969e396afcbcfc39bb7494cfe37" width={300} height={250}
                src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js" />
              <Recomendados currentId={hentaiId} title="Recomendados" kind="hentai" scroll={false} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
