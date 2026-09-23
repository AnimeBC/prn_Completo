'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './detalle.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { channelSlug } from '@/_Extras/Canales/canal.js';
import SecureImage from '@/_Extras/Imagen/SecureImage.js';
import VastPostRoll from '@/_Extras/Ads/VastPostRoll.js';
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
import {
  overlayPackStats,
  guestTogglePackLike,
  guestTogglePackSave,
  guestAddPackDownload,
} from '@/_Extras/Interacciones/local.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';

function parseNum(text) {
  const m = String(text).match(/([\d,.]+)\s*K?/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return /K/i.test(text) ? n * 1000 : n;
}

function fmtCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace('.0', '')}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1).replace('.0', '')}K`;
  return String(num);
}

const EMPTY_STATS = { likes: 0, dislikes: 0, guardados: 0, views: 0, downloads: 0, myVote: null, saved: false };

export default function PackDetalle({ packId }) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { packs } = useContenido();
  const { authed } = useAuth();

  const [detail, setDetail] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [channelAvatar, setChannelAvatar] = useState('');

  const [tab, setTab] = useState('foto');
  const [idx, setIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [ratio, setRatio] = useState(16 / 9);
  const [dragging, setDragging] = useState(false);
  const [videoWaiting, setVideoWaiting] = useState(false);
  // Play central: se muestra hasta la primera reproducción del video actual.
  const [packStarted, setPackStarted] = useState(false);
  const videoElRef = useRef(null);
  const viewerRef = useRef(null);
  const dragRef = useRef(null);
  const adRef = useRef(null);

  const found = packs.find((p) => String(p.public_id) === String(packId));

  // Detalle del pack (incluye la lista de fotos/videos)
  useEffect(() => {
    if (!packId) return;
    let alive = true;
    fetch(`${API_URL}/api/packs/${encodeURIComponent(packId)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive && j && j.public_id) setDetail(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, [packId]);

  const pack = useMemo(() => {
    const s = { ...(found || {}), ...(detail || {}) };
    const title = s.title
      || (es ? (detail?.titulo_es || detail?.titulo_en) : (detail?.titulo_en || detail?.titulo_es))
      || `Pack #${packId ?? ''}`;
    return {
      id: s.id ?? detail?.id ?? packId,
      public_id: s.public_id ?? packId,
      title,
      uploader: s.uploader || 'Canal Picante',
      thumb: s.thumb || '',
      fotos: s.fotos ?? 0,
      videos: s.videos ?? 0,
      download: s.download || '#',
      desc: s.desc || '',
    };
  }, [found, detail, packId, es]);

  const items = useMemo(() => {
    const list = (detail?.media || []).map((m) => ({
      type: m.tipo,
      src: mediaUrl(m.src),
      thumb: m.thumb ? mediaUrl(m.thumb) : '',
      duracion: m.duracion || '',
    }));
    list.sort((a, b) => (a.type === 'video' ? 1 : 0) - (b.type === 'video' ? 1 : 0));
    if (!list.length && pack.thumb) return [{ type: 'foto', src: mediaUrl(pack.thumb), thumb: '', duracion: '' }];
    return list;
  }, [detail, pack.thumb]);

  useEffect(() => { setTab('foto'); setIdx(0); setPage(0); setZoom(1); setPos({ x: 0.5, y: 0.5 }); }, [packId]);

  const photos = useMemo(() => items.filter((i) => i.type !== 'video'), [items]);
  const videos = useMemo(() => items.filter((i) => i.type === 'video'), [items]);
  const shown = tab === 'video' ? videos : photos;
  const active = shown[idx] || photos[0] || videos[0] || null;
  const isPhoto = active?.type !== 'video';

  const perPage = isMobile ? 6 : 8;
  const totalPages = Math.max(1, Math.ceil(shown.length / perPage));
  const pageSafe = Math.min(page, totalPages - 1);
  const paged = shown.slice(pageSafe * perPage, pageSafe * perPage + perPage);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Si no hay fotos, abre en videos
  useEffect(() => {
    if (items.length && tab === 'foto' && photos.length === 0 && videos.length > 0) setTab('video');
  }, [items.length, tab, photos.length, videos.length]);

  // Buffering progresivo del video (como en la sección de videos)
  useEffect(() => {
    setVideoWaiting(!!active && active.type === 'video');
    setPackStarted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.src]);

  // Vistas + likes/guardados (el invitado guarda su voto en el navegador)
  useEffect(() => {
    if (!pack.public_id) return;
    let alive = true;
    viewPack(pack.public_id).then((d) => {
      // Contador al toque + refresco local de las listas (sin SSE).
      if (d && !d.error && d.vistas != null) {
        window.dispatchEvent(new CustomEvent('pkp:vista', { detail: { views: d.vistas } }));
      }
    });
    getPackInteractions(pack.public_id).then((d) => {
      if (!alive || !d) return;
      setStats((s) => (authed ? { ...s, ...d } : overlayPackStats({ ...s, ...d }, pack.public_id)));
    });
    return () => { alive = false; };
  }, [pack.public_id, authed]);

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

  // Avatar del canal (uploader)
  useEffect(() => {
    const name = pack.uploader;
    if (!name) return;
    let alive = true;
    fetch(`${API_URL}/api/channels/${encodeURIComponent(channelSlug(name))}`)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (alive && j?.channel) setChannelAvatar(j.channel.avatar || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pack.uploader]);

  async function toggleLike() {
    if (!pack.public_id) return;
    if (authed) {
      const d = await likePack(pack.public_id, stats.myVote === 'like' ? 'none' : 'like');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestTogglePackLike(pack.public_id, s.myVote === 'like' ? 'none' : 'like');
      return { ...s, myVote: next, likes: s.likes + (next === 'like' ? 1 : 0) - (prev === 'like' ? 1 : 0) };
    });
  }
  async function toggleDislike() {
    if (!pack.public_id) return;
    if (authed) {
      const d = await likePack(pack.public_id, stats.myVote === 'dislike' ? 'none' : 'dislike');
      if (d) setStats((s) => ({ ...s, ...d }));
      return;
    }
    setStats((s) => {
      const prev = s.myVote;
      const next = guestTogglePackLike(pack.public_id, s.myVote === 'dislike' ? 'none' : 'dislike');
      return { ...s, myVote: next, dislikes: s.dislikes + (next === 'dislike' ? 1 : 0) - (prev === 'dislike' ? 1 : 0) };
    });
  }
  async function toggleSave() {
    if (!pack.public_id) return;
    if (!authed) {
      setStats((s) => ({ ...s, saved: guestTogglePackSave(pack.public_id) }));
      return;
    }
    const d = await savePack(pack.public_id);
    if (d) setStats((s) => ({ ...s, ...d }));
  }
  function openShare() {
    if (pack.public_id) sharePack(pack.public_id, 'modal');
    setShareOpen(true);
  }
  async function registrarDescarga() {
    if (!pack.public_id) return;
    if (!authed) {
      guestAddPackDownload(pack.public_id);
      setStats((s) => ({ ...s, downloads: s.downloads + 1 }));
      return;
    }
    const d = await downloadPack(pack.public_id);
    if (d) setStats((s) => ({ ...s, downloads: d.descargas }));
  }

  // ===== Zoom / pan del visor =====
  function clampRatio(r) {
    return Number.isFinite(r) && r > 0 ? Math.max(0.55, Math.min(2.6, r)) : 16 / 9;
  }
  function resetTransform() {
    setZoom(1);
    setPos({ x: 0.5, y: 0.5 });
  }
  function selectItem(i) {
    setIdx(i);
    resetTransform();
  }
  function selectTab(next) {
    setTab(next);
    setIdx(0);
    setPage(0);
    resetTransform();
  }
  function goStep(dir) {
    if (!shown.length) return;
    const next = (idx + dir + shown.length) % shown.length;
    setIdx(next);
    setPage(Math.floor(next / perPage));
    resetTransform();
  }
  function zoomBy(factor) {
    setZoom((z) => Math.max(1, Math.min(4, z * factor)));
  }
  function resetView() {
    setZoom(1);
    setPos({ x: 0.5, y: 0.5 });
  }
  function onDown(e) {
    if (!isPhoto) return;
    const el = viewerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, w: rect.width, h: rect.height };
    setDragging(true);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  function onMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const nx = Math.max(0, Math.min(1, d.px - (e.clientX - d.x) / d.w));
    const ny = Math.max(0, Math.min(1, d.py - (e.clientY - d.y) / d.h));
    setPos({ x: nx, y: ny });
  }
  function onUp(e) {
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  }

  const relacionados = packs
    .filter((p) => String(p.public_id) !== String(packId))
    .sort((a, b) => parseNum(b.descargas) - parseNum(a.descargas))
    .slice(0, 6);

  function goPack(id) { router.push(`/packs/${id}`); }

  const descripcion = pack.desc || (es
    ? `Pack con ${pack.fotos} ${t('packs.fotos')} y ${pack.videos} ${t('packs.videos')} de ${pack.uploader}. Contenido exclusivo listo para descargar.`
    : `Pack with ${pack.fotos} ${t('packs.fotos')} and ${pack.videos} ${t('packs.videos')} by ${pack.uploader}. Exclusive content ready to download.`);

  const avatarSrc = channelAvatar
    ? (channelAvatar.startsWith('/media/') ? mediaUrl(channelAvatar) : channelAvatar)
    : '';

  return (
    <main className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.leftCol}>
          {/* ===== Visor principal ===== */}
          <div
            ref={viewerRef}
            className={`${styles.photo} ${dragging ? styles.grabbing : ''}`}
            style={{ aspectRatio: String(ratio) }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className={styles.packBadge}>{t('packs.badge')}</span>

            {!active ? (
              <>
                <ion-icon name="image-outline" className={styles.photoIcon} suppressHydrationWarning></ion-icon>
                <span className={styles.photoLabel}>{t('packs.imagen')}</span>
              </>
            ) : isPhoto ? (
              <SecureImage
                className={styles.secureImg}
                src={active.src}
                fill
                fit="contain"
                zoom={zoom}
                pos={pos}
                onReady={(img) => setRatio(clampRatio(img.naturalWidth / img.naturalHeight))}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            ) : (
              <>
                <video
                  className={styles.photoVideo}
                  ref={videoElRef}
                  src={active.src}
                  poster={active.thumb || undefined}
                  controls
                  playsInline
                  preload="auto"
                  controlsList="nodownload"
                  disablePictureInPicture
                  onLoadedMetadata={(e) => setRatio(clampRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight))}
                  onWaiting={() => setVideoWaiting(true)}
                  onStalled={() => setVideoWaiting(true)}
                  onSeeking={() => setVideoWaiting(true)}
                  onPlaying={() => { setVideoWaiting(false); setPackStarted(true); }}
                  onCanPlay={() => setVideoWaiting(false)}
                  onLoadedData={() => setVideoWaiting(false)}
                  onError={() => setVideoWaiting(false)}
                  onEnded={() => adRef.current?.request()}
                  onContextMenu={(e) => e.preventDefault()}
                />
                {!packStarted && (
                  <button
                    type="button"
                    className={styles.playCenter}
                    onClick={() => videoElRef.current && videoElRef.current.play()}
                    aria-label={es ? 'Reproducir' : 'Play'}
                  >
                    <ion-icon name="play" suppressHydrationWarning></ion-icon>
                  </button>
                )}
                {videoWaiting && (
                  <div className={styles.videoSpinner} aria-hidden="true">
                    <span className={styles.spinner} />
                  </div>
                )}
                <VastPostRoll ref={adRef} />
              </>
            )}

            {isPhoto && active && (
              <div className={styles.zoomBar}>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1 / 1.25)} aria-label="Alejar">
                  <ion-icon name="remove-outline" suppressHydrationWarning></ion-icon>
                </button>
                <span className={styles.zoomVal}>{Math.round(zoom * 100)}%</span>
                <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1.25)} aria-label="Acercar">
                  <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
                </button>
                <button type="button" className={styles.zoomBtn} onClick={resetView} aria-label="Restablecer">
                  <ion-icon name="refresh-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>
            )}

            {shown.length > 1 && (
              <>
                <button type="button" className={styles.navPrev} onClick={() => goStep(-1)} aria-label={es ? 'Anterior' : 'Previous'}>
                  <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                </button>
                <button type="button" className={styles.navNext} onClick={() => goStep(1)} aria-label={es ? 'Siguiente' : 'Next'}>
                  <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                </button>
                <span className={styles.counter}>{idx + 1} / {shown.length}</span>
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

          {/* ===== Info + acciones ===== */}
          <div className={styles.info}>
            <div className={styles.titleRow}>
              <div className={styles.titleLeft}>
                <h1 className={styles.title}>{pack.title}</h1>
                <ion-icon name="lock-closed-outline" className={styles.lockIcon} suppressHydrationWarning></ion-icon>
              </div>
            </div>

            <div className={styles.channelRow}>
              <button type="button" className={styles.channel} onClick={() => router.push(`/canal/${channelSlug(pack.uploader)}`)}>
                {avatarSrc ? <img className={styles.chAvatar} src={avatarSrc} alt="" /> : <span className={styles.chAvatar} />}
                <span className={styles.chName}>{pack.uploader}</span>
                <ion-icon name="checkmark-circle" className={styles.chVerified} suppressHydrationWarning></ion-icon>
              </button>

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
                    <span>{fmtCount(stats.likes)}</span>
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
                    <span>{fmtCount(stats.dislikes)}</span>
                  </button>
                </div>

                <button className={`${styles.actionBtn} ${stats.saved ? styles.actionActive : ''}`} type="button" onClick={toggleSave}>
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

          <Comentarios packId={pack.public_id} />

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
        </div>

        <div className={styles.rightCol}>
          {/* ===== Galería: pestañas Fotos / Videos + cuadrícula ===== */}
          {items.length > 0 && (
            <div className={`${styles.galleryWrap} ${styles.gallerySide}`}>
              <h3 className={styles.sideTitle}>{es ? 'Fotos y videos' : 'Photos & videos'}</h3>
              <div className={styles.gTabs}>
                {photos.length > 0 && (
                  <button type="button" className={`${styles.gTab} ${tab !== 'video' ? styles.gTabActive : ''}`} onClick={() => selectTab('foto')}>
                    <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                    {t('packs.fotos')}
                    <span className={styles.gCount}>{photos.length}</span>
                  </button>
                )}
                {videos.length > 0 && (
                  <button type="button" className={`${styles.gTab} ${tab === 'video' ? styles.gTabActive : ''}`} onClick={() => selectTab('video')}>
                    <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                    {t('packs.videos')}
                    <span className={styles.gCount}>{videos.length}</span>
                  </button>
                )}
              </div>

              <div className={styles.gGrid}>
                {paged.map((it, i) => {
                  const gi = pageSafe * perPage + i;
                  return (
                    <button
                      key={`${tab}-${gi}`}
                      type="button"
                      className={styles.gItem}
                      onClick={() => selectItem(gi)}
                      title={it.type === 'video' ? 'Video' : 'Foto'}
                    >
                      {it.type === 'video' ? (
                        <>
                          <span className={styles.gVideo} style={it.thumb ? { backgroundImage: `url(${it.thumb})` } : undefined} />
                          <span className={styles.gPlay}><ion-icon name="play" suppressHydrationWarning></ion-icon></span>
                          {it.duracion && <span className={styles.gDur}>{it.duracion}</span>}
                        </>
                      ) : (
                        <SecureImage className={styles.gImg} src={it.src} fill fit="cover" pos={{ x: 0.5, y: 0.5 }} />
                      )}
                      {gi === idx && (
                        <span className={styles.gCheck}>
                          <ion-icon name="checkmark" suppressHydrationWarning></ion-icon>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className={styles.gPager}>
                  <button
                    type="button"
                    className={styles.gPageBtn}
                    disabled={pageSafe <= 0}
                    onClick={() => setPage((p) => Math.max(0, Math.min(totalPages - 1, p) - 1))}
                    aria-label={es ? 'Página anterior' : 'Previous page'}
                  >
                    <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
                  </button>
                  <span className={styles.gPageInfo}>{pageSafe + 1} / {totalPages}</span>
                  <button
                    type="button"
                    className={styles.gPageBtn}
                    disabled={pageSafe >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    aria-label={es ? 'Página siguiente' : 'Next page'}
                  >
                    <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
              )}
            </div>
          )}

          <h3 className={styles.sideTitle}>{t('packs.relacionados')}</h3>
          <div className={styles.stack}>
            {relacionados.map((r) => (
              <div
                key={r.id}
                className={styles.card}
                role="link"
                tabIndex={0}
                onClick={() => goPack(r.public_id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goPack(r.public_id); } }}
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
