'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './lista.module.css';
import { API_URL, authHeaders, mediaUrl } from '@/_Extras/Api/api.js';

const API = API_URL;
const PER_PAGE = 20;

function pageWindow(current, total) {
  const out = [];
  const span = 2;
  let start = Math.max(1, current - span);
  let end = Math.min(total, current + span);
  if (end - start < span * 2) {
    if (start === 1) end = Math.min(total, start + span * 2);
    else start = Math.max(1, end - span * 2);
  }
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

export default function ListaVideos({ onEdit, refreshKey = 0 }) {
  const [videos, setVideos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('videos'); // videos | papelera
  const [loading, setLoading] = useState(false);
  const [confirmData, setConfirmData] = useState(null); // { kind, video }
  const qRef = useRef('');
  const firstRun = useRef(true);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const load = useCallback(async (query = '', t = 'videos', p = 1) => {
    qRef.current = query;
    setLoading(true);
    try {
      const papelera = t === 'papelera' ? '&papelera=true' : '';
      const url = `${API}/api/videos?limit=${PER_PAGE}&page=${p}&_=${Date.now()}${papelera}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      setVideos(j.data || []);
      setTotal(j.total || (j.data || []).length);
      setPage(j.page || p);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // recarga por tab / cambios realtime / after create-edit
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; load('', tab, 1); }
    const onChange = () => load(qRef.current, tab, page);
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  useEffect(() => {
    if (refreshKey > 0) { setPage(1); load(qRef.current, tab, 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function switchTab(t) {
    setTab(t);
    setQ('');
    qRef.current = '';
    setPage(1);
    load('', t, 1);
  }

  function go(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    load(qRef.current, tab, next);
  }

  async function doAction(kind, v) {
    try {
      if (kind === 'restore') {
        const r = await fetch(`${API}/api/videos/${v.id}/restore`, { method: 'POST', headers: authHeaders() });
        if (!r.ok) throw new Error('No se pudo restaurar');
      } else if (kind === 'trash') {
        const r = await fetch(`${API}/api/videos/${v.id}`, { method: 'DELETE', headers: authHeaders() });
        if (!r.ok) throw new Error('No se pudo mover a la papelera');
      } else if (kind === 'permanent') {
        const r = await fetch(`${API}/api/videos/${v.id}/permanent`, { method: 'DELETE', headers: authHeaders() });
        if (!r.ok) throw new Error('No se pudo eliminar definitivamente');
      }
      setConfirmData(null);
      load(qRef.current, tab, page);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'videos' ? styles.tabActive : ''}`}
              onClick={() => switchTab('videos')}
            >
              <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
              Videos
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'papelera' ? styles.tabActive : ''}`}
              onClick={() => switchTab('papelera')}
            >
              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              Papelera
            </button>
          </div>
          <span className={styles.count}>{total}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className={styles.search}>
            <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
            <input
              placeholder="Buscar video..."
              value={q}
              onChange={(e) => { setQ(e.target.value); qRef.current = e.target.value; }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(qRef.current, tab, 1); } }}
            />
          </div>
          <button className={styles.refresh} type="button" onClick={() => load(qRef.current, tab, page)}>
            <ion-icon name="refresh-outline" suppressHydrationWarning></ion-icon>
            Recargar
          </button>
        </div>
      </div>

      {loading && videos.length === 0 ? (
        <p className={styles.empty}>Cargando videos…</p>
      ) : videos.length === 0 ? (
        <p className={styles.empty}>
          {tab === 'papelera' ? 'La papelera está vacía.' : 'No hay videos todavía. Sube el primero arriba.'}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Portada</th>
                <th>Título</th>
                <th>Duración</th>
                <th>Etiquetas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className={styles.row}>
                  <td>
                    {v.thumb
                      ? <img className={styles.thumb} src={mediaUrl(v.thumb)} alt="" loading="lazy" />
                      : <div className={styles.thumbEmpty}><ion-icon name="image-outline" suppressHydrationWarning></ion-icon></div>}
                  </td>
                  <td className={styles.titleCell}>
                    <div className={styles.vtitle}>{v.titulo_es}</div>
                    <div className={styles.vpath}>{v.src || 'sin archivo'}</div>
                  </td>
                  <td>{v.duracion || '00:00'}</td>
                  <td>
                    {v.is_fetiche && <span className={`${styles.badge} ${styles.badgeFetiche}`}>{v.fetiche_categoria || 'Fetiche'}</span>}
                    {v.is_tendencia && <span className={`${styles.badge} ${styles.badgeTend}`}>Tendencia</span>}
                    {(v.tags || []).slice(0, 4).map((t) => <span key={t} className={styles.badge}>{t}</span>)}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {tab === 'videos' ? (
                        <>
                          <button className={styles.act} type="button" onClick={() => onEdit && onEdit(v)}>
                            <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
                            Editar
                          </button>
                          <button className={`${styles.act} ${styles.danger}`} type="button" onClick={() => setConfirmData({ kind: 'trash', video: v })}>
                            <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                            Papelera
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={styles.act} type="button" onClick={() => doAction('restore', v)}>
                            <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                            Restaurar
                          </button>
                          <button className={`${styles.act} ${styles.danger}`} type="button" onClick={() => setConfirmData({ kind: 'permanent', video: v })}>
                            <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon>
                            Eliminar definitivo
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pager}>
          <button className={styles.pageBtn} type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Anterior">
            <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
          </button>
          {pageWindow(page, totalPages).map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.pageBtn} ${p === page ? styles.pageActive : ''}`}
              onClick={() => go(p)}
            >
              {p}
            </button>
          ))}
          <button className={styles.pageBtn} type="button" disabled={page >= totalPages} onClick={() => go(page + 1)} aria-label="Siguiente">
            <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
          </button>
          <span className={styles.pagerInfo}>{total} · pág {page}/{totalPages}</span>
        </div>
      )}

      {/* ===== Modal confirmar ===== */}
      {confirmData && (
        <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) setConfirmData(null); }}>
          <div className={styles.confirm}>
            <span className={`${styles.confirmIcon} ${confirmData.kind === 'permanent' ? styles.confirmDanger : ''}`}>
              <ion-icon name={confirmData.kind === 'permanent' ? 'alert-circle-outline' : 'trash-outline'} suppressHydrationWarning></ion-icon>
            </span>
            <h3 className={styles.confirmTitle}>
              {confirmData.kind === 'permanent' ? '¿Eliminar definitivamente?' : '¿Mover a la papelera?'}
            </h3>
            <p className={styles.confirmText}>
              <b>{confirmData.video.titulo_es}</b><br />
              {confirmData.kind === 'permanent'
                ? 'Se borrará el video y su portada para siempre. Esta acción no se puede deshacer.'
                : 'Se ocultará del frontend. Podrás restaurarlo luego desde la Papelera.'}
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.cancel} type="button" onClick={() => setConfirmData(null)}>Cancelar</button>
              <button className={styles.dangerBtn} type="button" onClick={() => doAction(confirmData.kind, confirmData.video)}>
                {confirmData.kind === 'permanent' ? 'Eliminar definitivamente' : 'Mover a papelera'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
