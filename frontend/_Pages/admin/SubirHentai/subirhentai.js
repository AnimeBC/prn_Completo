'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './subirhentai.module.css';
import { API_URL, mediaUrl, authHeaders } from '@/_Extras/Api/api.js';

const API = API_URL;

function resolveImg(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/media/')) return mediaUrl(p);
  return p;
}

const EMPTY = {
  titulo_es: '', titulo_en: '', desc_es: '', desc_en: '',
  canal: 'administrador pikante.pe', tags: '',
};

export default function HentaiAdmin() {
  const [series, setSeries] = useState([]);
  const [selected, setSelected] = useState(null); // { serie, capitulos }
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [capForm, setCapForm] = useState({ numero: '', titulo_es: '', titulo_en: '' });
  const [capBusy, setCapBusy] = useState(false);
  const videoRef = useRef(null);
  const coverRef = useRef(null);

  async function loadSeries() {
    try {
      const r = await fetch(`${API}/api/hentai/admin/list`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo cargar'); return; }
      setSeries(j.data || []);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadSeries(); }, []);

  async function openSerie(id) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo abrir la serie'); return; }
      const cap = Array.isArray(j.capitulos) ? j.capitulos : [];
      setSelected({ serie: j, capitulos: cap });
      setForm({
        titulo_es: j.titulo_es || '',
        titulo_en: j.titulo_en || '',
        desc_es: j.desc_es || '',
        desc_en: j.desc_en || '',
        canal: j.canal || 'administrador pikante.pe',
        tags: (j.tags || []).join(', '),
      });
      setCapForm({ numero: String(cap.length + 1), titulo_es: '', titulo_en: '' });
      setMsg('');
    } catch { setError('No hay conexión con el servidor.'); }
  }

  async function createSerie(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...form, tags: form.tags.split(',') }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo crear la serie'); return; }
      setMsg('Serie creada. Ahora sube la portada y los capítulos.');
      await loadSeries();
      openSerie(j.serie.id);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function saveSerie(e) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${selected.serie.id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...form, tags: form.tags.split(',') }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo guardar'); return; }
      setSelected((s) => ({ ...s, serie: j.serie }));
      setMsg('Serie actualizada.');
      loadSeries();
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function uploadCover(file) {
    if (!selected || !file) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('thumb', file);
      const r = await fetch(`${API}/api/hentai/${selected.serie.id}/cover`, { method: 'POST', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir la portada'); return; }
      setSelected((s) => ({ ...s, serie: j.serie }));
      setMsg('Portada actualizada.');
      loadSeries();
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function addCapitulo(e) {
    e.preventDefault();
    if (!selected) return;
    const file = videoRef.current?.files?.[0];
    if (!file) { setError('Selecciona el video del capítulo'); return; }
    setCapBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('video', file);
      fd.append('numero', capForm.numero || '');
      fd.append('titulo_es', capForm.titulo_es || '');
      fd.append('titulo_en', capForm.titulo_en || '');
      const r = await fetch(`${API}/api/hentai/${selected.serie.id}/capitulos`, { method: 'POST', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir el capítulo'); return; }
      setMsg(`Capítulo ${j.capitulo.numero} subido${j.processing ? ' (procesando calidades en segundo plano)' : ''}.`);
      if (videoRef.current) videoRef.current.value = '';
      setCapForm({ numero: String(Number(capForm.numero || 0) + 1), titulo_es: '', titulo_en: '' });
      openSerie(selected.serie.id);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setCapBusy(false); }
  }

  async function deleteCapitulo(id) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/capitulos/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (r.ok) { setMsg('Capítulo eliminado.'); openSerie(selected.serie.id); }
    } catch { setError('No hay conexión con el servidor.'); }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loading}>
          <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
          Cargando hentai...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
          Hentai (series y capítulos)
        </h2>
        <p className={styles.sub}>Cada serie tiene su portada y sus capítulos; cada capítulo guarda sus calidades.</p>
      </header>

      {error && <p className={styles.msgError}>{error}</p>}
      {msg && <p className={styles.okMsg}>{msg}</p>}

      <div className={styles.cols}>
        {/* ===== Lista de series ===== */}
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Series ({series.length})</h3>
          <div className={styles.serieList}>
            {series.length === 0 && <p className={styles.muted}>Aún no hay series.</p>}
            {series.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.serieItem} ${selected?.serie.id === s.id ? styles.serieActive : ''}`}
                onClick={() => openSerie(s.id)}
              >
                {s.cover || s.thumb
                  ? <img className={styles.serieThumb} src={resolveImg(s.cover || s.thumb)} alt="" />
                  : <span className={styles.serieThumbEmpty}><ion-icon name="images-outline" suppressHydrationWarning></ion-icon></span>}
                <span className={styles.serieInfo}>
                  <span className={styles.serieName}>{s.titulo_es || s.titulo_en}</span>
                  <span className={styles.serieMeta}>{s.capitulos} cap. · {s.canal}</span>
                </span>
              </button>
            ))}
          </div>

          <form className={styles.newForm} onSubmit={createSerie}>
            <h4 className={styles.formTitle}>Nueva serie</h4>
            <input className={styles.input} placeholder="Título ES *" value={form.titulo_es}
              onChange={(e) => setForm({ ...form, titulo_es: e.target.value })} required />
            <input className={styles.input} placeholder="Title EN" value={form.titulo_en}
              onChange={(e) => setForm({ ...form, titulo_en: e.target.value })} />
            <textarea className={styles.textarea} rows={2} placeholder="Descripción ES" value={form.desc_es}
              onChange={(e) => setForm({ ...form, desc_es: e.target.value })} />
            <input className={styles.input} placeholder="Canal / uploader" value={form.canal}
              onChange={(e) => setForm({ ...form, canal: e.target.value })} />
            <input className={styles.input} placeholder="Tags (separadas por coma)" value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
              Crear serie
            </button>
          </form>
        </section>

        {/* ===== Detalle de la serie ===== */}
        <section className={styles.panel}>
          {!selected ? (
            <div className={styles.placeholder}>
              <ion-icon name="albums-outline" suppressHydrationWarning></ion-icon>
              <p>Elige una serie de la izquierda o crea una nueva.</p>
            </div>
          ) : (
            <>
              <div className={styles.coverRow}>
                <div className={styles.coverBox}>
                  {selected.serie.cover || selected.serie.thumb
                    ? <img className={styles.coverImg} src={resolveImg(selected.serie.cover || selected.serie.thumb)} alt="" />
                    : <span className={styles.coverEmpty}><ion-icon name="image-outline" suppressHydrationWarning></ion-icon></span>}
                </div>
                <div className={styles.coverActions}>
                  <h3 className={styles.serieTitle}>{selected.serie.titulo_es || selected.serie.titulo_en}</h3>
                  <input ref={coverRef} type="file" accept="image/*" className={styles.hidden}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCover(f); }} />
                  <button className={styles.ghostBtn} type="button" onClick={() => coverRef.current?.click()} disabled={busy}>
                    <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                    {busy ? 'Subiendo…' : 'Cambiar portada'}
                  </button>
                </div>
              </div>

              <form className={styles.form} onSubmit={saveSerie}>
                <div className={styles.two}>
                  <input className={styles.input} placeholder="Título ES" value={form.titulo_es}
                    onChange={(e) => setForm({ ...form, titulo_es: e.target.value })} />
                  <input className={styles.input} placeholder="Title EN" value={form.titulo_en}
                    onChange={(e) => setForm({ ...form, titulo_en: e.target.value })} />
                </div>
                <textarea className={styles.textarea} rows={2} placeholder="Descripción ES" value={form.desc_es}
                  onChange={(e) => setForm({ ...form, desc_es: e.target.value })} />
                <textarea className={styles.textarea} rows={2} placeholder="Description EN" value={form.desc_en}
                  onChange={(e) => setForm({ ...form, desc_en: e.target.value })} />
                <div className={styles.two}>
                  <input className={styles.input} placeholder="Canal / uploader" value={form.canal}
                    onChange={(e) => setForm({ ...form, canal: e.target.value })} />
                  <input className={styles.input} placeholder="Tags (coma)" value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                </div>
                <button className={styles.primaryBtn} type="submit" disabled={busy}>
                  <ion-icon name="save-outline" suppressHydrationWarning></ion-icon>
                  {busy ? 'Guardando…' : 'Guardar serie'}
                </button>
              </form>

              <form className={styles.form} onSubmit={addCapitulo}>
                <h4 className={styles.formTitle}>Agregar capítulo</h4>
                <div className={styles.two}>
                  <input className={styles.input} type="number" min="1" placeholder="N° capítulo" value={capForm.numero}
                    onChange={(e) => setCapForm({ ...capForm, numero: e.target.value })} />
                  <input className={styles.input} placeholder="Título ES (opcional)" value={capForm.titulo_es}
                    onChange={(e) => setCapForm({ ...capForm, titulo_es: e.target.value })} />
                </div>
                <input className={styles.input} placeholder="Title EN (opcional)" value={capForm.titulo_en}
                  onChange={(e) => setCapForm({ ...capForm, titulo_en: e.target.value })} />
                <input ref={videoRef} className={styles.file} type="file" accept="video/*" />
                <button className={styles.primaryBtn} type="submit" disabled={capBusy}>
                  <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
                  {capBusy ? 'Subiendo…' : 'Subir capítulo'}
                </button>
              </form>

              <div className={styles.capsList}>
                {selected.capitulos.length === 0 ? (
                  <p className={styles.muted}>Sin capítulos todavía.</p>
                ) : selected.capitulos.map((c) => (
                  <div key={c.id} className={styles.capItem}>
                    {c.thumb && <img className={styles.capThumb} src={resolveImg(c.thumb)} alt="" />}
                    <div className={styles.capInfo}>
                      <strong>Cap. {c.numero}{c.titulo_es ? ` · ${c.titulo_es}` : ''}</strong>
                      <span className={styles.capMeta}>{c.duracion || '00:00'} · {c.src ? 'video listo' : 'procesando…'}</span>
                    </div>
                    <button className={styles.dangerBtn} type="button" onClick={() => deleteCapitulo(c.id)}>
                      <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
