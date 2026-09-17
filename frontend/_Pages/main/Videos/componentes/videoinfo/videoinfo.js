'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './videoinfo.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import CompartirModal from '@/_Pages/main/Videos/componentes/compartir';
import ReportModal from '@/_Pages/main/Videos/componentes/reportar';
import DescargaModal from '@/_Pages/main/Packs/componentes/descarga';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { canalUrl, channelSlug } from '@/_Extras/Canales/canal.js';
import {
  getInteractions,
  viewVideo,
  likeVideo,
  saveVideo,
  downloadVideo,
  followChannel,
} from '@/_Extras/Interacciones/interactions.js';
import {
  overlayVideoStats,
  overlayFollow,
  guestToggleVideoLike,
  guestToggleVideoSave,
  guestToggleVideoDownload,
  guestToggleFollow,
  guestMarkReport,
} from '@/_Extras/Interacciones/local.js';

function formatCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace('.0', '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(num >= 10000 ? 0 : 1).replace('.0', '') + 'K';
  return String(num);
}

export default function VideoInfo({ videoId, info: infoProp = null, src = '/videos/1.mov' }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { videos } = useContenido();
  const INFO = Object.fromEntries(
    videos.map((v) => [v.id, { title: v.title, views: v.viewsFull, date: v.date, channel: v.channel, since: v.since, tags: v.tags, desc: v.desc }])
  );
  const info = INFO[videoId] || infoProp || { title: `Video #${videoId ?? ''}`, views: '0 vistas', date: 'recent', channel: 'administrador pikante.pe', since: '', tags: [], desc: '' };

  const [expanded, setExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);

  const [stats, setStats] = useState({ likes: 0, dislikes: 0, views: 0, subscribers: 0, myVote: null, saved: false, following: false, reported: false });

  const { authed } = useAuth();
  const [channelAvatar, setChannelAvatar] = useState('');

  // Foto del canal (perfil público) para mostrarla junto al nombre
  useEffect(() => {
    const name = info.channel;
    if (!name) return;
    let alive = true;
    fetch(`${API_URL}/api/channels/${encodeURIComponent(channelSlug(name))}`)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive && j?.channel) setChannelAvatar(j.channel.avatar || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [info.channel]);

  useEffect(() => {
    let alive = true;
    // El invitado ve los conteos globales del server y encima su estado local.
    const apply = (d) => {
      if (!alive || !d) return;
      setStats((s) => {
        let merged = { ...s, ...d };
        if (!authed) {
          merged = overlayVideoStats(merged, videoId);
          merged = overlayFollow(merged, info.channel);
        }
        return merged;
      });
    };
    getInteractions(videoId).then(apply);
    // cuenta la vista al abrir el video (anonima, sirve tambien sin cuenta)
    viewVideo(videoId).then(apply);
    return () => { alive = false; };
  }, [videoId, authed, info.channel]);

  async function toggleLike() {
    if (authed) {
      const d = await likeVideo(videoId, stats.myVote === 'like' ? 'none' : 'like');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestToggleVideoLike(videoId, s.myVote === 'like' ? 'none' : 'like');
      return { ...s, myVote: next, likes: s.likes + (next === 'like' ? 1 : 0) - (prev === 'like' ? 1 : 0) };
    });
  }

  async function toggleDislike() {
    if (authed) {
      const d = await likeVideo(videoId, stats.myVote === 'dislike' ? 'none' : 'dislike');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestToggleVideoLike(videoId, s.myVote === 'dislike' ? 'none' : 'dislike');
      return { ...s, myVote: next, dislikes: s.dislikes + (next === 'dislike' ? 1 : 0) - (prev === 'dislike' ? 1 : 0) };
    });
  }

  async function toggleSave() {
    if (!authed) {
      setStats((s) => ({ ...s, saved: guestToggleVideoSave(videoId) }));
      return;
    }
    const d = await saveVideo(videoId);
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  async function toggleFollow() {
    if (!authed) {
      setStats((s) => {
        const following = guestToggleFollow(info.channel);
        return { ...s, following, subscribers: s.subscribers + (following ? 1 : 0) - (s.following ? 1 : 0) };
      });
      return;
    }
    const d = await followChannel(info.channel);
    if (d) setStats((s) => ({ ...s, following: d.following, subscribers: d.subscribers }));
  }

  async function recordDownload() {
    if (!authed) { guestToggleVideoDownload(videoId); return; }
    const d = await downloadVideo(videoId);
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  const liked = stats.myVote === 'like';
  const disliked = stats.myVote === 'dislike';
  const totalVotes = stats.likes + stats.dislikes;
  // sin votos se muestra la barra al 50/50 (verde/rojo visibles)
  const likePct = totalVotes ? Math.round((stats.likes / totalVotes) * 100) : 50;
  const dislikePct = 100 - likePct;

  return (
    <div className={styles.col}>
      <div className={styles.videoHead}>
        <h1 className={styles.videoTitle}>{info.title}</h1>
        <p className={styles.videoMeta}>{formatCount(stats.views)} vistas • {info.date}</p>
      </div>

      <div className={styles.channelRow}>
        <div className={styles.channel}>
          {channelAvatar ? (
            <img
              className={`${styles.avatar} ${styles.avatarImg}`}
              src={channelAvatar.startsWith('/media/') ? mediaUrl(channelAvatar) : channelAvatar}
              alt={info.channel}
              onClick={() => router.push(canalUrl(info.channel))}
            />
          ) : (
            <div className={styles.avatar} onClick={() => router.push(canalUrl(info.channel))} />
          )}
          <div>
            <div className={styles.channelName}>
              <button
                type="button"
                className={styles.channelLink}
                onClick={() => router.push(canalUrl(info.channel))}
              >
                {info.channel}
              </button>
              <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
            </div>
            <span className={styles.channelSince}>
              {formatCount(stats.subscribers)} {t('video.suscriptores')}{info.since ? ` · ${info.since}` : ''}
            </span>
          </div>
          <button
            className={`${styles.followBtn} ${stats.following ? styles.following : ''}`}
            type="button"
            onClick={toggleFollow}
          >
            <ion-icon name={stats.following ? 'checkmark' : 'add-outline'} className={styles.followIcon} suppressHydrationWarning></ion-icon>
            {stats.following ? t('video.siguiendo') : t('video.seguir')}
          </button>
        </div>

        <div className={styles.rightGroup}>
        <div className={styles.ytSegmentedWrap}>
          <div className={styles.ytSegmented}>
            <button className={`${styles.ytSegBtn} ${liked ? styles.ytSegActive : ''}`} type="button" aria-label={t('video.like')} aria-pressed={liked} onClick={toggleLike}>
              <ion-icon name={liked ? 'thumbs-up' : 'thumbs-up-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
              <span className={styles.ytCount}>{formatCount(stats.likes)}</span>
            </button>
            <div className={styles.ytSegDivider} />
            <button className={`${styles.ytSegBtn} ${disliked ? styles.ytSegActive : ''}`} type="button" aria-label={t('video.dislike')} aria-pressed={disliked} onClick={toggleDislike}>
              <ion-icon name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
              <span className={styles.ytCount}>{formatCount(stats.dislikes)}</span>
            </button>
          </div>
          <div className={styles.ratioWrap} aria-hidden="true">
            <div className={styles.ratioBar}>
              <div className={styles.ratioGreen} style={{ width: `${likePct}%` }} />
              <div className={styles.ratioRed} style={{ width: `${dislikePct}%` }} />
            </div>
            {totalVotes > 0 && (
              <div className={styles.ratioLabels}>
                <span className={styles.ratioLabelGreen} style={{ width: `${likePct}%` }}>{likePct}%</span>
                <span className={styles.ratioLabelRed} style={{ width: `${dislikePct}%` }}>{dislikePct}%</span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={`${styles.actionBtn} ${stats.saved ? styles.actionActive : ''}`} type="button" onClick={toggleSave}>
            <ion-icon name={stats.saved ? 'bookmark' : 'bookmark-outline'} className={styles.actionIcon} suppressHydrationWarning></ion-icon> {stats.saved ? t('video.guardado') : t('video.guardar')}
          </button>
          <button className={styles.actionBtn} type="button" onClick={() => setShareOpen(true)}>
            <ion-icon name="share-social-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {t('video.compartir')}
          </button>
          <button className={`${styles.actionBtn} ${stats.reported ? styles.actionActive : ''}`} type="button" onClick={() => setReportOpen(true)}>
            <ion-icon name="flag-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {stats.reported ? t('video.reportado') : t('video.reportar')}
          </button>
          <button className={`${styles.actionBtn} ${styles.actionDownload}`} type="button" onClick={() => setDlOpen(true)}>
            <ion-icon name="download-outline" className={styles.actionIcon} suppressHydrationWarning></ion-icon> {t('video.descargar')}
          </button>
        </div>
        </div>
      </div>

      <CompartirModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={info.title}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        videoId={videoId}
        onReported={() => {
          if (!authed) guestMarkReport('video', videoId);
          setStats((s) => ({ ...s, reported: true }));
        }}
      />

      <DescargaModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        onDownload={recordDownload}
        paso1={SMARTLINK_URL}
        paso2={SMARTLINK_URL}
        directo={`${API_URL}/api/videos/${videoId}/file`}
        downloadFile
        downloadName={`pikantepe-video-${videoId}.mp4`}
        titulo={t('descarga.titulo')}
      />

      <div className={styles.descBox}>
        <div className={styles.tagsRow}>
          <span className={styles.tagsLabel}>{t('video.etiquetas')}</span>
          {(info.tags || []).map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
        <p className={`${styles.desc} ${expanded ? styles.descFull : ''}`}>{info.desc}</p>
        <span className={styles.showMore} onClick={() => setExpanded((p) => !p)}>{expanded ? t('video.mostrarMenos') : t('video.mostrarMas')}</span>
      </div>
    </div>
  );
}
