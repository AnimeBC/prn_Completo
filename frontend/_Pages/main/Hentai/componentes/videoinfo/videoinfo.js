'use client';

import { useState } from 'react';
import styles from './videoinfo.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import DescargaModal from '@/_Pages/main/Packs/componentes/descarga';
import CompartirModal from '@/_Pages/main/Videos/componentes/compartir';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';

export default function HentaiInfo({ hentaiId, info: infoProp = null, src = '/videos/1.mov' }) {
  const { t } = useLanguage();
  const { hentai } = useContenido();
  const INFO = Object.fromEntries(
    hentai.map((h) => [
      h.id,
      {
        title: h.title,
        views: h.viewsFull,
        date: h.date,
        channel: h.channel,
        since: h.since,
        tags: h.tags,
        desc: h.desc,
      },
    ])
  );
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reported, setReported] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const seedNum = Number(String(hentaiId).replace(/\D/g, '')) || 7;
  const [likeCount, setLikeCount] = useState(() => 1850 + (seedNum * 731) % 3200);
  const [dislikeCount, setDislikeCount] = useState(() => 28 + (seedNum * 137) % 180);

  const info = INFO[hentaiId] || infoProp || { title: `Anime #${hentaiId ?? ''}`, views: '0 views', date: 'recent', channel: 'Hentai Channel', since: '2024', tags: ['new'], desc: 'Anime description coming soon.' };

  function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K';
    return String(n);
  }

  function openShare() {
    setShareOpen(true);
  }

  function like() {
    if (liked) {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
      if (disliked) {
        setDisliked(false);
        setDislikeCount((c) => Math.max(0, c - 1));
      }
    }
  }

  function dislike() {
    if (disliked) {
      setDisliked(false);
      setDislikeCount((c) => Math.max(0, c - 1));
    } else {
      setDisliked(true);
      setDislikeCount((c) => c + 1);
      if (liked) {
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
    }
  }

  return (
    <div className={styles.col}>
      <div className={styles.videoHead}>
        <h1 className={styles.videoTitle}>{info.title}</h1>
        <p className={styles.videoMeta}>{info.views} • {info.date}</p>
      </div>

      <div className={styles.channelRow}>
        <div className={styles.channel}>
          <div className={styles.avatar} />
          <div>
            <div className={styles.channelName}>
              <span>{info.channel}</span>
              <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
            </div>
            <span className={styles.channelSince}>Subscriber since: {info.since}</span>
          </div>
        </div>
        {(() => {
            const total = Math.max(1, likeCount + dislikeCount);
            const likePct = Math.round((likeCount / total) * 100);
            const dislikePct = 100 - likePct;
            return (
              <div className={styles.ytSegmentedWrap}>
                <div className={styles.ytSegmented}>
                  <button className={`${styles.ytSegBtn} ${liked ? styles.ytSegActive : ''}`} type="button" aria-label="Me gusta" aria-pressed={liked} onClick={like}>
                    <ion-icon name={liked ? 'thumbs-up' : 'thumbs-up-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
                    <span className={styles.ytCount}>{formatCount(likeCount)}</span>
                  </button>
                  <div className={styles.ytSegDivider} />
                  <button className={`${styles.ytSegBtn} ${disliked ? styles.ytSegActive : ''}`} type="button" aria-label="No me gusta" aria-pressed={disliked} onClick={dislike}>
                    <ion-icon name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
                    <span className={styles.ytCount}>{formatCount(dislikeCount)}</span>
                  </button>
                </div>
                <div className={styles.ratioWrap} aria-hidden="true">
                  <div className={styles.ratioBar}>
                    <div className={styles.ratioGreen} style={{ width: `${likePct}%` }} />
                    <div className={styles.ratioRed} style={{ width: `${dislikePct}%` }} />
                  </div>
                  <div className={styles.ratioLabels}>
                    <span className={styles.ratioLabelGreen} style={{ width: `${likePct}%` }}>{likePct}%</span>
                    <span className={styles.ratioLabelRed} style={{ width: `${dislikePct}%` }}>{dislikePct}%</span>
                  </div>
                </div>
              </div>
            );
          })()}
        <div className={styles.actions}>
          <button className={`${styles.actionBtn} ${saved ? styles.actionActive : ''}`} type="button" onClick={() => setSaved((p) => !p)}>
            <ion-icon name={saved ? 'bookmark' : 'bookmark-outline'} className={styles.actionIcon} suppressHydrationWarning></ion-icon> {t('video.guardar')}
          </button>
          <button className={styles.actionBtn} type="button" onClick={openShare}>
            <ion-icon name="share-social-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {t('video.compartir')}
          </button>
          <button className={`${styles.actionBtn} ${reported ? styles.actionActive : ''}`} type="button" onClick={() => setReported((p) => !p)}>
            <ion-icon name="flag-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {reported ? t('video.reportado') : t('video.reportar')}
          </button>
          <button className={`${styles.actionBtn} ${styles.actionDownload}`} type="button" onClick={() => setDlOpen(true)}>
            <ion-icon name="download-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {t('video.descargar')}
          </button>
        </div>
      </div>

      <DescargaModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        paso1={SMARTLINK_URL}
        paso2={SMARTLINK_URL}
        directo={src}
        titulo={t('descarga.titulo')}
      />

      <CompartirModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={info.title}
      />

      <div className={styles.descBox}>
        <div className={styles.tagsRow}>
          <span className={styles.tagsLabel}>{t('video.etiquetas')}</span>
          {info.tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
        <p className={`${styles.desc} ${expanded ? styles.descFull : ''}`}>{info.desc}</p>
        <span className={styles.showMore} onClick={() => setExpanded((p) => !p)}>{expanded ? t('video.mostrarMenos') : t('video.mostrarMas')}</span>
      </div>
    </div>
  );
}
