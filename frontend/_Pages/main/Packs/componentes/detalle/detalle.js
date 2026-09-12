'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './detalle.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import Comentarios from '@/_Pages/main/Videos/componentes/comentarios';
import DescargaModal from '@/_Pages/main/Packs/componentes/descarga';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';

function parseNum(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

export default function PackDetalle({ packId }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { packs } = useContenido();
  const [dlOpen, setDlOpen] = useState(false);

  const pack = packs.find((p) => String(p.id) === String(packId)) || {
    id: packId ?? '',
    title: `Pack #${packId ?? ''}`,
    uploader: 'Canal Picante',
    fotos: 0,
    videos: 0,
    views: `0 ${t('packs.vistas')}`,
    descargas: `0 ${t('packs.descargas')}`,
  };

  const relacionados = packs
    .filter((p) => String(p.id) !== String(packId))
    .sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas))
    .slice(0, 6);

  function goPack(id) {
    router.push(`/packs/${id}`);
  }

  return (
    <main className={styles.wrap}>
    <div className={styles.grid}>
      <div className={styles.leftCol}>
        <div className={styles.photo}>
          <span className={styles.packBadge}>PACK</span>
          <ion-icon name="image-outline" className={styles.photoIcon} suppressHydrationWarning></ion-icon>
          <span className={styles.photoLabel}>PACK IMAGE</span>
        </div>

        <DescargaModal
          open={dlOpen}
          onClose={() => setDlOpen(false)}
          paso1={SMARTLINK_URL}
          paso2={SMARTLINK_URL}
          directo={pack.download || '#'}
          titulo={t('descarga.packTitulo')}
        />

        <div className={styles.info}>
          <div className={styles.titleRow}>
            <div className={styles.titleLeft}>
              <h1 className={styles.title}>{pack.title}</h1>
              <ion-icon name="lock-closed-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
            </div>
            <button className={styles.downloadBtn} type="button" onClick={() => setDlOpen(true)}>
              <ion-icon name="download-outline" className={styles.downloadIcon} suppressHydrationWarning></ion-icon>
              {t('descarga.titulo')}
            </button>
          </div>
          <p className={styles.uploader}>{pack.uploader}</p>
          <div className={styles.stats}>
            <span className={styles.stat}>
              <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
              {pack.fotos} {t('packs.fotos')}
            </span>
            <span className={styles.stat}>
              <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
              {pack.videos} {t('packs.videos')}
            </span>
            <span className={styles.stat}>
              <ion-icon name="eye-outline" suppressHydrationWarning></ion-icon>
              {pack.views}
            </span>
            <span className={styles.stat}>
              <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
              {pack.descargas}
            </span>
          </div>
          <p className={styles.desc}>
            Pack with {pack.fotos} {t('packs.fotos')} and {pack.videos} {t('packs.videos')} by {pack.uploader}.
            Exclusive content ready to download.
          </p>
        </div>

        <Comentarios videoId={`pack-${pack.id}`} />

        <AdBanner
          adKey="e483940fff110a871ea3ba9b07dd3259"
          width={728}
          height={90}
          src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
        />
      </div>

      <div className={styles.rightCol}>
        <h3 className={styles.sideTitle}>Related packs</h3>
        <div className={styles.stack}>
          {relacionados.map((r) => (
            <div
              key={r.id}
              className={styles.card}
              role="link"
              tabIndex={0}
              onClick={() => goPack(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  goPack(r.id);
                }
              }}
            >
              <div className={styles.thumb}>
                <span className={styles.miniBadge}>PACK</span>
              </div>
              <div className={styles.cardInfo}>
                <h4 className={styles.cardTitle}>{r.title}</h4>
                <span className={styles.uploaderSm}>{r.uploader}</span>
                <span className={styles.meta}>{r.fotos} {t('packs.fotos')} • {r.videos} {t('packs.videos')}</span>
                <span className={styles.meta}>{r.descargas}</span>
              </div>
            </div>
          ))}
        </div>
        <AdBanner
          adKey="3a837969e396afcbcfc39bb7494cfe37"
          width={300}
          height={250}
          src="https://www.highrevenueformat.com/3a837969e396afcbcfc39bb7494cfe37/invoke.js"
        />
      </div>
    </div>
    </main>
  );
}
