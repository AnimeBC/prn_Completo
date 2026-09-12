'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './detalle.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import Comentarios from '@/_Pages/main/Videos/componentes/comentarios';
import CompartirModal from '@/_Pages/main/Videos/componentes/compartir';
import DescargaModal from '@/_Pages/main/Packs/componentes/descarga';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';
import {
  getPackInteractions,
  likePack,
  savePack,
  sharePack,
  viewPack,
  downloadPack,
} from '@/_Extras/Interacciones/interactions.js';

function parseNum(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

const EMPTY_STATS = { likes: 0, dislikes: 0, guardados: 0, views: 0, downloads: 0, myVote: null, saved: false };

export default function PackDetalle({ packId }) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { packs } = useContenido();
  const [dlOpen, setDlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);

  const found = packs.find((p) => String(p.id) === String(packId));
  const pack = found || {
    id: packId ?? '',
    title: `Pack #${packId ?? ''}`,
    uploader: 'Canal Picante',
    fotos: 0,
    videos: 0,
    views: `0 ${t('packs.vistas')}`,
    descargas: `0 ${t('packs.descargas')}`,
  };

  // Al abrir: cuenta la vista y trae likes/guardados
  useEffect(() => {
    if (!found?.id) return;
    let alive = true;
    viewPack(found.id);
    getPackInteractions(found.id).then((d) => { if (alive && d) setStats((s) => ({ ...s, ...d })); });
    return () => { alive = false; };
  }, [found?.id]);

  async function toggleLike() {
    if (!found?.id) return;
    const d = await likePack(found.id, stats.myVote === 'like' ? 'none' : 'like');
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  async function toggleDislike() {
    if (!found?.id) return;
    const d = await likePack(found.id, stats.myVote === 'dislike' ? 'none' : 'dislike');
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  async function toggleSave() {
    if (!found?.id) return;
    const d = await savePack(found.id);
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  function openShare() {
    if (found?.id) sharePack(found.id, 'modal');
    setShareOpen(true);
  }

  async function registrarDescarga() {
    if (!found?.id) return;
    const d = await downloadPack(found.id);
    if (d) setStats((s) => ({ ...s, downloads: d.descargas }));
  }

  const relacionados = packs
    .filter((p) => String(p.id) !== String(packId))
    .sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas))
    .slice(0, 6);

  function goPack(id) {
    router.push(`/packs/${id}`);
  }

  const descripcion = pack.desc || (es
    ? `Pack con ${pack.fotos} ${t('packs.fotos')} y ${pack.videos} ${t('packs.videos')} de ${pack.uploader}. Contenido exclusivo listo para descargar.`
    : `Pack with ${pack.fotos} ${t('packs.fotos')} and ${pack.videos} ${t('packs.videos')} by ${pack.uploader}. Exclusive content ready to download.`);

  return (
    <main className={styles.wrap}>
    <div className={styles.grid}>
      <div className={styles.leftCol}>
        <div className={styles.photo}>
          <span className={styles.packBadge}>{t('packs.badge')}</span>
          {pack.thumb
            ? <img className={styles.photoImg} src={pack.thumb} alt="" />
            : (
              <>
                <ion-icon name="image-outline" className={styles.photoIcon} suppressHydrationWarning></ion-icon>
                <span className={styles.photoLabel}>{t('packs.imagen')}</span>
              </>
            )}
        </div>

        <DescargaModal
          open={dlOpen}
          onClose={() => setDlOpen(false)}
          onDownload={registrarDescarga}
          paso1={SMARTLINK_URL}
          paso2={SMARTLINK_URL}
          directo={pack.download || '#'}
          titulo={t('descarga.packTitulo')}
        />

        <CompartirModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={pack.title}
        />

        <div className={styles.info}>
          <div className={styles.titleRow}>
            <div className={styles.titleLeft}>
              <h1 className={styles.title}>{pack.title}</h1>
              <ion-icon name="lock-closed-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
            </div>

            <div className={styles.actions}>
              <div className={styles.segmented}>
                <button
                  className={`${styles.segBtn} ${stats.myVote === 'like' ? styles.segActive : ''}`}
                  type="button"
                  aria-label={t('video.like')}
                  aria-pressed={stats.myVote === 'like'}
                  onClick={toggleLike}
                >
                  <ion-icon name={stats.myVote === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} suppressHydrationWarning></ion-icon>
                  <span>{stats.likes}</span>
                </button>
                <div className={styles.segDivider} />
                <button
                  className={`${styles.segBtn} ${stats.myVote === 'dislike' ? styles.segActive : ''}`}
                  type="button"
                  aria-label={t('video.dislike')}
                  aria-pressed={stats.myVote === 'dislike'}
                  onClick={toggleDislike}
                >
                  <ion-icon name={stats.myVote === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'} suppressHydrationWarning></ion-icon>
                  <span>{stats.dislikes}</span>
                </button>
              </div>

              <button
                className={`${styles.actionBtn} ${stats.saved ? styles.actionActive : ''}`}
                type="button"
                onClick={toggleSave}
              >
                <ion-icon name={stats.saved ? 'bookmark' : 'bookmark-outline'} suppressHydrationWarning></ion-icon>
                {stats.saved ? t('video.guardado') : t('video.guardar')}
              </button>

              <button className={styles.actionBtn} type="button" onClick={openShare}>
                <ion-icon name="share-social-outline" suppressHydrationWarning></ion-icon>
                {t('video.compartir')}
              </button>

              <button className={`${styles.actionBtn} ${styles.actionDownload}`} type="button" onClick={() => setDlOpen(true)}>
                <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
                {t('descarga.titulo')}
              </button>
            </div>
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
              {Number(stats.views || 0).toLocaleString(es ? 'es-PE' : 'en-US')} {t('packs.vistas')}
            </span>
            <span className={styles.stat}>
              <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
              {Number(stats.downloads || 0).toLocaleString(es ? 'es-PE' : 'en-US')} {t('packs.descargas')}
            </span>
          </div>
          <p className={styles.desc}>{descripcion}</p>
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
        <h3 className={styles.sideTitle}>{t('packs.relacionados')}</h3>
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
                <span className={styles.miniBadge}>{t('packs.badge')}</span>
                {r.thumb && <img className={styles.miniImg} src={r.thumb} alt="" loading="lazy" />}
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
