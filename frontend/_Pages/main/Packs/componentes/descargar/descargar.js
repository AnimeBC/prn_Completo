'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './descargar.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { getUserKey } from '@/_Extras/Interacciones/interactions.js';
import AdBanner from '@/_Pages/main/Home/componentes/anuncio/AdBanner.js';
import AdNative from '@/_Pages/main/Home/componentes/anuncio/AdNative.js';

function fmtBytes(b) {
  const n = Number(b) || 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 ** 3)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 ** 2)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
function fmtSpeed(bps) {
  if (!bps) return '';
  return `${fmtBytes(bps)}/s`;
}
function fmtEta(sec) {
  if (!sec || !Number.isFinite(sec)) return '';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
function extOf(url) {
  const clean = String(url).split('?')[0];
  const m = clean.match(/\.([a-z0-9]{2,4})$/i);
  return m ? `.${m[1]}` : '';
}

function tokenStorageKey(userKey, packId) {
  return `pkp_pktt_${userKey}_${packId}`;
}

/* ---------- Descargador flotante (tipo Drive) ---------- */
function useDownloads() {
  const [items, setItems] = useState([]);
  const controllers = useRef({});

  const update = (id, patch) =>
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id) => setItems((cur) => cur.filter((x) => x.id !== id));

  async function start(url, name) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ctrl = new AbortController();
    controllers.current[id] = ctrl;
    setItems((cur) => [{ id, name, total: 0, loaded: 0, status: 'downloading', speed: 0, eta: 0 }, ...cur]);

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        update(id, { status: 'error' });
        setTimeout(() => remove(id), 6000);
        return { ok: false, status: res.status };
      }
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let loaded = 0;
      const started = Date.now();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        const elapsed = (Date.now() - started) / 1000;
        const speed = elapsed > 0 ? loaded / elapsed : 0;
        const eta = total && speed > 0 ? (total - loaded) / speed : 0;
        update(id, { loaded, total, speed, eta });
      }

      const blob = new Blob(chunks);
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);

      update(id, { status: 'done', loaded: total || loaded, speed: 0, eta: 0 });
      setTimeout(() => remove(id), 4000);
      return { ok: true };
    } catch (err) {
      if (err?.name === 'AbortError') {
        update(id, { status: 'cancelled' });
        setTimeout(() => remove(id), 2500);
        return { ok: false, aborted: true };
      }
      update(id, { status: 'error' });
      setTimeout(() => remove(id), 6000);
      return { ok: false, status: 0 };
    } finally {
      delete controllers.current[id];
    }
  }

  function cancel(id) {
    controllers.current[id]?.abort();
    remove(id);
  }

  return { items, start, cancel };
}

function ProgressRing({ pct, status }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  const color = status === 'done' ? '#22c55e' : status === 'error' ? '#ef4444' : 'var(--primary, #F20D16)';
  return (
    <svg className={styles.ring} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} className={styles.ringTrack} />
      <circle
        cx="22" cy="22" r={r}
        className={styles.ringBar}
        style={{ stroke: color, strokeDasharray: c, strokeDashoffset: off }}
      />
      <text x="22" y="26" textAnchor="middle" className={styles.ringText}>
        {status === 'done' ? '✓' : status === 'error' ? '!' : status === 'cancelled' ? '×' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}

export default function PackDescargar({ packId }) {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { items: downloads, start, cancel } = useDownloads();

  const tokenRef = useRef('');

  // Pide (o reutiliza) un token de descarga válido. Se guarda en localStorage
  // para reutilizarlo entre visitas; si expiró, el backend entrega uno nuevo.
  async function ensureToken(force = false) {
    if (!force && tokenRef.current) return tokenRef.current;
    const userKey = getUserKey();
    let current = '';
    try { current = localStorage.getItem(tokenStorageKey(userKey, packId)) || ''; } catch { /* noop */ }
    try {
      const r = await fetch(`${API_URL}/api/packs/${packId}/download-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey, current }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.token) {
        tokenRef.current = j.token;
        try { localStorage.setItem(tokenStorageKey(userKey, packId), j.token); } catch { /* noop */ }
        return j.token;
      }
    } catch { /* sin conexión */ }
    return '';
  }

  // Descarga con token; si expira (401), pide uno nuevo y reintenta una vez.
  async function download(baseUrl, name) {
    let tok = await ensureToken();
    if (!tok) return;
    const build = (tk) => `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${encodeURIComponent(tk)}`;
    let res = await start(build(tok), name);
    if (res && !res.ok && res.status === 401) {
      try { localStorage.removeItem(tokenStorageKey(getUserKey(), packId)); } catch { /* noop */ }
      tok = await ensureToken(true);
      if (tok) await start(build(tok), name);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${API_URL}/api/packs/${packId}/files`)
      .then((r) => r.json())
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setError(es ? 'No se pudo cargar el pack.' : 'Could not load the pack.'); })
      .finally(() => { if (alive) setLoading(false); });
    ensureToken();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId, es]);

  const pack = data?.pack || {};
  const fotos = data?.fotos || [];
  const videos = data?.videos || [];
  const title = (es ? (pack.titulo_es || pack.title) : (pack.titulo_en || pack.title)) || `Pack #${packId}`;
  const zipName = `pikantepe-${pack.slug || packId}`;

  const zipBase = (tipo) =>
    `${API_URL}/api/packs/${packId}/zip/${tipo}?userKey=${encodeURIComponent(getUserKey())}`;
  const fileBase = (u) =>
    `${API_URL}/api/packs/${packId}/file?u=${encodeURIComponent(u)}&userKey=${encodeURIComponent(getUserKey())}`;

  return (
    <main className={styles.main}>
      <div className={styles.layout2col}>
        <div className={styles.feed}>
          <Link className={styles.back} href={`/packs/${packId}`}>
            <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
            {t('packs.volver')}
          </Link>

          <header className={styles.head}>
            <div className={styles.cover}>
              {pack.thumb
                ? <img src={mediaUrl(pack.thumb)} alt="" loading="lazy" />
                : <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>}
            </div>
            <div className={styles.headInfo}>
              <span className={styles.badge}>{t('packs.badge')}</span>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.meta}>
                {pack.uploader} · {fotos.length} {t('packs.fotos')} · {videos.length} {t('packs.videos')}
              </p>

              {(fotos.length > 0 || videos.length > 0) && (
                <div className={styles.zipBlock}>
                  <div className={styles.zipActions}>
                    <button className={styles.zipBtn} type="button" onClick={() => download(zipBase('all'), `${zipName}-completo.zip`)}>
                      <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
                      {es
                        ? `Descargar TODO en ZIP (${fotos.length} fotos + ${videos.length} videos)`
                        : `Download ALL as ZIP (${fotos.length} photos + ${videos.length} videos)`}
                    </button>
                    {fotos.length > 0 && (
                      <button className={styles.zipAlt} type="button" onClick={() => download(zipBase('fotos'), `${zipName}-fotos.zip`)}>
                        <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
                        {es ? `Solo FOTOS en ZIP (${fotos.length})` : `PHOTOS only as ZIP (${fotos.length})`}
                      </button>
                    )}
                    {videos.length > 0 && (
                      <button className={styles.zipAlt} type="button" onClick={() => download(zipBase('videos'), `${zipName}-videos.zip`)}>
                        <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                        {es ? `Solo VIDEOS en ZIP (${videos.length})` : `VIDEOS only as ZIP (${videos.length})`}
                      </button>
                    )}
                  </div>
                  <p className={styles.zipHint}>
                    <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
                    {es
                      ? 'Cada botón descarga un archivo .ZIP. "Solo fotos" baja únicamente las fotos; "Solo videos" baja únicamente los videos.'
                      : 'Each button downloads a .ZIP file. "Photos only" downloads just the photos; "Videos only" downloads just the videos.'}
                  </p>
                </div>
              )}
            </div>
          </header>

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />

          {loading && <p className={styles.empty}>{es ? 'Cargando archivos…' : 'Loading files…'}</p>}
          {error && <p className={styles.empty}>{error}</p>}

          {!loading && !error && fotos.length === 0 && videos.length === 0 && (
            <p className={styles.empty}>{t('packs.sinArchivos')}</p>
          )}

          {videos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                {t('packs.videos')} <span className={styles.count}>({videos.length})</span>
              </h2>
              <div className={styles.list}>
                {videos.map((v, i) => {
                  const name = `video_${String(i + 1).padStart(2, '0')}${extOf(v.src) || '.mp4'}`;
                  return (
                    <div key={v.id} className={styles.row}>
                      <div className={styles.thumb}>
                        {v.thumb
                          ? <img src={mediaUrl(v.thumb)} alt="" loading="lazy" />
                          : <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>}
                        <span className={styles.dur}>{v.duracion || '00:00'}</span>
                      </div>
                      <div className={styles.rowInfo}>
                        <span className={styles.rowName}>Video {String(i + 1).padStart(2, '0')}</span>
                        <div className={styles.variants}>
                          {(v.variants.length ? v.variants : [{ label: 'video', url: v.src }]).map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              className={styles.variant}
                              onClick={() => download(fileBase(q.url), `video_${String(i + 1).padStart(2, '0')}_${q.label}${extOf(q.url) || '.mp4'}`)}
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button className={styles.dlBtnBig} type="button" onClick={() => download(fileBase(v.src), name)}>
                        <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
                        {t('packs.descargar')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {fotos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
                {t('packs.fotos')} <span className={styles.count}>({fotos.length})</span>
              </h2>
              <div className={styles.list}>
                {fotos.map((f, i) => {
                  const name = `foto_${String(i + 1).padStart(2, '0')}${extOf(f.src) || '.jpg'}`;
                  return (
                    <div key={f.id} className={styles.row}>
                      <div className={`${styles.thumb} ${styles.photoThumb}`}>
                        <img src={mediaUrl(f.thumb)} alt="" loading="lazy" />
                      </div>
                      <div className={styles.rowInfo}>
                        <span className={styles.rowName}>{es ? `Foto ${String(i + 1).padStart(2, '0')}` : `Photo ${String(i + 1).padStart(2, '0')}`}</span>
                      </div>
                      <button className={styles.dlBtnBig} type="button" onClick={() => download(fileBase(f.src), name)}>
                        <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
                        {t('packs.descargar')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <AdBanner
            adKey="e483940fff110a871ea3ba9b07dd3259"
            width={728}
            height={90}
            src="https://www.highrevenueformat.com/e483940fff110a871ea3ba9b07dd3259/invoke.js"
          />
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

      {/* ===== Descargador flotante ===== */}
      {downloads.length > 0 && (
        <div className={styles.dock}>
          {downloads.map((d) => {
            const pct = d.total ? (d.loaded / d.total) * 100 : (d.status === 'done' ? 100 : 0);
            const done = d.status === 'done';
            return (
              <div key={d.id} className={styles.dockItem}>
                <ProgressRing pct={pct} status={d.status} />
                <div className={styles.dockInfo}>
                  <span className={styles.dockName}>{d.name}</span>
                  <span className={styles.dockSub}>
                    {done
                      ? (es ? 'Completado' : 'Done')
                      : d.status === 'error'
                        ? (es ? 'Error al descargar' : 'Download error')
                        : d.status === 'cancelled'
                          ? (es ? 'Cancelado' : 'Cancelled')
                          : `${fmtBytes(d.loaded)}${d.total ? ` / ${fmtBytes(d.total)}` : ''} · ${fmtSpeed(d.speed)}${d.eta ? ` · ${fmtEta(d.eta)}` : ''}`}
                  </span>
                </div>
                <button className={styles.dockClose} type="button" onClick={() => cancel(d.id)} aria-label="Cancelar">
                  <ion-icon name={done ? 'checkmark-outline' : 'close-outline'} suppressHydrationWarning></ion-icon>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
