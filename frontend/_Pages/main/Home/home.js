'use client';

import styles from './home.module.css';
import Hero from '@/_Pages/main/Home/componentes/hero';
import Carrusel from '@/_Pages/main/Home/componentes/carrusel';
import Fila from '@/_Pages/main/Home/componentes/fila';
import Categorias from '@/_Pages/main/Home/componentes/categorias';
import Packs from '@/_Pages/main/Home/componentes/packs';
import Comunidad from '@/_Pages/main/Home/componentes/comunidad';
import Lives from '@/_Pages/main/Home/componentes/lives';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function HomeClient() {
  const { t } = useLanguage();

  return (
    <main className={styles.main}>
      <div className={styles.sections}>
        <div className={styles.content}>
          <Hero />
          <Carrusel />
          <Fila
            title={t('secciones.todosVideos')}
            href="/videos"
            icon="sparkles-outline"
            source="videos"
            limit={30}
          />
          <Fila
            title={t('secciones.todosAnimes')}
            href="/hentai"
            icon="videocam-outline"
            source="hentai"
            limit={30}
          />
          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
          <Packs />
          <Categorias />
          <Comunidad />
          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
          <Lives />
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
