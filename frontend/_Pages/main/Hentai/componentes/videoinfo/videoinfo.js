'use client';

import { useEffect, useState } from 'react';
import styles from './videoinfo.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { channelSlug } from '@/_Extras/Canales/canal.js';
import { SMARTLINK_URL } from '@/_Pages/main/Home/componentes/anuncio/ads.js';
import DescargaModal from '@/_Pages/main/Packs/componentes/descarga';
import CompartirModal from '@/_Pages/main/Videos/componentes/compartir';
import ReportModal from '@/_Pages/main/Videos/componentes/reportar';
import {
  getHentaiInteractions,
  likeHentai,
  saveHentai,
  downloadHentai,
  followChannel,
  reportHentai,
} from '@/_Extras/Interacciones/interactions.js';
import {
  overlayHentaiStats,
  overlayFollow,
  guestToggleHentaiLike,
  guestToggleHentaiSave,
  guestToggleFollow,
  guestMarkReport,
  guestAddHentaiDownload,
} from '@/_Extras/Interacciones/local.js';

const EMPTY_STATS = { likes: 0, dislikes: 0, views: 0, subscribers: 0, myVote: null, saved: false, following: false, reported: false };

function formatCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace('.0', '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1).replace('.0', '')}K`;
  return String(num);
}

export default function HentaiInfo({ hentaiId, capituloId = null, info: infoProp = null, src = '', header = null }) {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { authed } = useAuth();
  const { hentai } = useContenido();

  const INFO = Object.fromEntries(
    hentai.map((h) => [h.id, { title: h.title, titleEs: h.titleEs, titleEn: h.titleEn, views: h.viewsFull, date: h.date, channel: h.channel, since: h.since, tags: h.tags, desc: h.desc }])
  );
  const base = INFO[hentaiId] || infoProp || { title: `Hentai #${hentaiId ?? ''}`, views: '0 vistas', date: 'recent', channel: 'Canal', since: '', tags: [], desc: '' };
  const info = { ...base, title: header?.title || base.title, desc: header?.desc || base.desc };
  // Título según idioma (provider/server); si no hay EN, se queda el ES.
  const titulo = es ? (info.titleEs || info.title) : (info.titleEn || info.title);
  const tags = (header?.tags && header.tags.length ? header.tags : base.tags) || [];

  const [stats, setStats] = useState(EMPTY_STATS);
  const [channelAvatar, setChannelAvatar] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!capituloId) return;
    let alive = true;
    const apply = (d) => {
      if (!alive || !d) return;
      setStats((s) => {
        let merged = { ...s, ...d };
        if (!authed) {
          merged = overlayHentaiStats(merged, capituloId);
          merged = overlayFollow(merged, info.channel);
        }
        return merged;
      });
    };
    getHentaiInteractions(capituloId).then(apply);
    // La vista NO se cuenta al abrir: la cuenta hentaiPlayer al primer PLAY
    // y avisa por pkp:vista (listener de abajo) para pintar el contador.
    return () => { alive = false; };
  }, [capituloId, authed, info.channel]);

  // Contador de vistas: se actualiza al instante cuando se registra una vista.
  useEffect(() => {
    const onVista = (e) => {
      const v = e?.detail?.views;
      if (v == null) return;
      setStats((s) => ({ ...s, views: v }));
    };
    window.addEventListener('pkp:vista', onVista);
    return () => window.removeEventListener('pkp:vista', onVista);
  }, []);

  // Foto de perfil del canal (perfil público)
  useEffect(() => {
    const name = info.channel;
    if (!name) { setChannelAvatar(''); return; }
    let alive = true;
    fetch(`${API_URL}/api/channels/${encodeURIComponent(channelSlug(name))}`)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive) setChannelAvatar(j?.channel?.avatar || ''); })
      .catch(() => { if (alive) setChannelAvatar(''); });
    return () => { alive = false; };
  }, [info.channel]);

  async function toggleLike() {
    if (!capituloId) return;
    if (authed) {
      const d = await likeHentai(capituloId, stats.myVote === 'like' ? 'none' : 'like');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestToggleHentaiLike(capituloId, s.myVote === 'like' ? 'none' : 'like');
      return { ...s, myVote: next, likes: s.likes + (next === 'like' ? 1 : 0) - (prev === 'like' ? 1 : 0) };
    });
  }

  async function toggleDislike() {
    if (!capituloId) return;
    if (authed) {
      const d = await likeHentai(capituloId, stats.myVote === 'dislike' ? 'none' : 'dislike');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestToggleHentaiLike(capituloId, s.myVote === 'dislike' ? 'none' : 'dislike');
      return { ...s, myVote: next, dislikes: s.dislikes + (next === 'dislike' ? 1 : 0) - (prev === 'dislike' ? 1 : 0) };
    });
  }

  async function toggleSave() {
    if (!capituloId) return;
    if (!authed) {
      setStats((s) => ({ ...s, saved: guestToggleHentaiSave(capituloId) }));
      return;
    }
    const d = await saveHentai(capituloId);
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
    if (!capituloId) return;
    if (!authed) { guestAddHentaiDownload(capituloId); return; }
    const d = await downloadHentai(capituloId);
    if (d) setStats((s) => ({ ...s, ...d }));
  }

  const totalVotes = stats.likes + stats.dislikes;
  const likePct = totalVotes ? Math.round((stats.likes / totalVotes) * 100) : 50;
  const dislikePct = 100 - likePct;

  // Like/Dislike + barra de ratio (se usa en el canal en PC y junto a las vistas en móvil).
  const segmentedUI = (
    <>
      <div className={styles.ytSegmented}>
        <button className={`${styles.ytSegBtn} ${stats.myVote === 'like' ? styles.ytSegActive : ''}`} type="button" aria-label={es ? 'Me gusta' : 'Like'} aria-pressed={stats.myVote === 'like'} onClick={toggleLike}>
          <ion-icon name={stats.myVote === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
          <span className={styles.ytCount}>{formatCount(stats.likes)}</span>
        </button>
        <div className={styles.ytSegDivider} />
        <button className={`${styles.ytSegBtn} ${stats.myVote === 'dislike' ? styles.ytSegActive : ''}`} type="button" aria-label="No me gusta" aria-pressed={stats.myVote === 'dislike'} onClick={toggleDislike}>
          <ion-icon name={stats.myVote === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'} className={styles.ytSegIcon} suppressHydrationWarning></ion-icon>
          <span className={styles.ytCount}>{formatCount(stats.dislikes)}</span>
        </button>
      </div>
      <div className={styles.ratioWrap} aria-hidden="true">
        <div className={styles.ratioBar}>
          <div className={styles.ratioGreen} style={{ width: `${likePct}%` }} />
          <div className={styles.ratioRed} style={{ width: `${dislikePct}%` }} />
        </div>
        <div className={styles.ratioLabels}>
          <span className={styles.ratioLabelGreen}>{likePct}%</span>
          <span className={styles.ratioLabelRed}>{dislikePct}%</span>
        </div>
      </div>
    </>
  );

  return (
    <div className={styles.col}>
      <div className={styles.videoHead}>
        <div className={styles.headLine}>
          {header?.episode && (
            <span className={styles.episodeLabel}>
              <ion-icon name="play-circle-outline" suppressHydrationWarning></ion-icon>
              {es ? 'Episodio' : 'Episode'} {header.episode.numero} · {header.episode.modo}
            </span>
          )}
          <h1 className={styles.videoTitle}>{titulo}</h1>
          {header?.altTitles?.length > 0 && (
            <span className={styles.altTitles}>
              <span className={styles.altLabel}>{es ? 'También conocido como:' : 'Also known as:'}</span>
              {header.altTitles.map((t2, i) => (
                <span key={`alt-${i}`} className={styles.altTitle}>{t2}</span>
              ))}
            </span>
          )}
          {header?.chips?.length > 0 && (
            <span className={styles.headChips}>
              {header.chips.map((c, i) => (
                <span key={`chip-${i}`} className={styles.headChip}>{c}</span>
              ))}
            </span>
          )}
        </div>
        <div className={styles.metaRow}>
          <p className={styles.videoMeta}>{info.views} • {info.date}</p>
          <div className={`${styles.ytSegmentedWrap} ${styles.segMobile}`}>{segmentedUI}</div>
        </div>
      </div>

      <div className={styles.channelRow}>
        <div className={styles.channel}>
          {channelAvatar ? (
            <img
              className={`${styles.avatar} ${styles.avatarImg}`}
              src={channelAvatar.startsWith('/media/') ? mediaUrl(channelAvatar) : channelAvatar}
              alt={info.channel}
            />
          ) : (
            <div className={styles.avatar} />
          )}
          <div>
            <div className={styles.channelName}>
              <span>{info.channel}</span>
              <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
            </div>
            <span className={styles.channelSince}>
              {formatCount(stats.subscribers)} {es ? 'suscriptores' : 'subscribers'}{info.since ? ` · ${info.since}` : ''}
            </span>
          </div>
          <button
            className={`${styles.followBtn} ${stats.following ? styles.following : ''}`}
            type="button"
            onClick={toggleFollow}
          >
            <ion-icon name={stats.following ? 'checkmark' : 'add-outline'} className={styles.followIcon} suppressHydrationWarning></ion-icon>
            {stats.following ? (es ? 'Siguiendo' : 'Following') : (es ? 'Seguir' : 'Follow')}
          </button>
        </div>

        <div className={`${styles.ytSegmentedWrap} ${styles.segDesktop}`}>
          {segmentedUI}
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

      <DescargaModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        onDownload={recordDownload}
        paso1={SMARTLINK_URL}
        paso2={SMARTLINK_URL}
        directo={src || '#'}
        downloadFile
        downloadName={`pikantepe-${hentaiId}-ep${header?.episode?.numero ?? ''}.mp4`}
        titulo={t('descarga.titulo')}
      />

      <CompartirModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={titulo}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onReported={() => {
          if (!authed && capituloId) guestMarkReport('hentai', capituloId);
          setStats((s) => ({ ...s, reported: true }));
        }}
        submitFn={capituloId ? (motivo, detalle) => reportHentai(capituloId, motivo, detalle) : null}
        title={es ? 'Reportar episodio' : 'Report episode'}
      />

      <div className={styles.descBox}>
        <div className={styles.tagsRow}>
          <span className={styles.tagsLabel}>{t('video.etiquetas')}</span>
          {tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
        <p className={`${styles.desc} ${expanded ? styles.descFull : ''}`}>{info.desc}</p>
        <span className={styles.showMore} onClick={() => setExpanded((p) => !p)}>{expanded ? t('video.mostrarMenos') : t('video.mostrarMas')}</span>
      </div>
    </div>
  );
}
