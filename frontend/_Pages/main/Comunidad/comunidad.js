'use client';

import { useState } from 'react';
import styles from './comunidad.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';

const CORE_TAGS = ['Amateur', 'HD', 'Latina'];

export default function ComunidadClient() {
  const { t } = useLanguage();
  const { community: uploads } = useContenido();
  const filterKeys = ['all', ...Array.from(new Set(uploads.flatMap((v) => v.tags))), 'other'];
  const [filter, setFilter] = useState('all');
  const list =
    filter === 'all'
      ? uploads
      : filter === 'other'
        ? uploads.filter((v) => v.tags.some((t) => !CORE_TAGS.includes(t)))
        : uploads.filter((v) => v.tags.includes(filter));

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <h1 className={styles.title}>{t('nav.comunidad')}</h1>
        <p className={styles.count}>{list.length} {t('secciones.subidas')}</p>
      </div>

      <div className={styles.layout2col}>
      <div className={styles.feed}>
      <div className={styles.lockWrap}>
      <div className={styles.locked} aria-hidden="true">
      <div className={styles.chips}>
        {filterKeys.map((f) => (
          <button
            key={f}
            className={`${styles.chip} ${f === filter ? styles.chipActive : ''}`}
            type="button"
            onClick={() => setFilter(f)}
            tabIndex={-1}
          >
            {f === 'all' ? t('filtros.todas') : f === 'other' ? t('filtros.otros') : f}
          </button>
        ))}
      </div>

      <AdBanner
        adKey="e483940fff110a871ea3ba9b07dd3259"
        width={728}
        height={90}
        src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
      />

      {list.length === 0 ? (
        <p className={styles.empty}>{t('secciones.sinSubidas')}</p>
      ) : (
        <div className={styles.grid}>
          {list.map((video) => (
            <article
              key={video.id}
              className={styles.card}
            >
              <div className={styles.thumb}>
                <span className={styles.duration}>{video.duration}</span>
              </div>
              <div className={styles.info}>
                <h3 className={styles.cardTitle}>{video.title}</h3>
                <p className={styles.meta}>{video.views} • {video.time}</p>
                <div className={styles.tags}>
                  {video.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <AdBanner
        adKey="e483940fff110a871ea3ba9b07dd3259"
        width={728}
        height={90}
        src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
      />
      </div>
      <div className={styles.lockOverlay}>
        <div className={styles.lockCard}>
          <ion-icon name="construct-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
          <p className={styles.lockTitle}>{t('mantenimiento.titulo')}</p>
          <p className={styles.lockText}>{t('mantenimiento.texto')}</p>
        </div>
      </div>
      </div>
      </div>

      <aside className={styles.rail}>
        <AdBanner
          adKey="78e0b2ea56da0940de81bef223de03b3"
          width={160}
          height={600}
          src="https://www.highrevenueformat.com/78e0b2ea56da0940de81bef223de03b3/invoke.js"
          marco
        />
        <AdBanner
          adKey="3a837969e396afcbcfc39bb7494cfe37"
          width={300}
          height={250}
          src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
        />
        <AdNative
          containerId="container-889d5bee4d5085ec8e0d5a960c034651"
          src="https://pl31251694.profitableratecpmnetwork.com/889d5bee4d5085ec8e0d5a960c034651/invoke.js"
        />
      </aside>
      </div>
    </main>
  );
}
