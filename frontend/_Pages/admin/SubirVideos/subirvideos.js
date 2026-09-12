'use client';

import { useEffect, useState } from 'react';
import styles from './subirvideos.module.css';
import ListaVideos from './lista.js';
import { API_URL, authHeaders, mediaUrl } from '@/_Extras/Api/api.js';

const API = API_URL;

function fmt(sec) {
  if (!sec || Number.isNaN(sec)) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sizeLabel(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

const VIDEO_RE = /\.(mp4|mov|webm|mkv|avi)$/i;
const IMG_RE = /\.(png|jpe?g|webp|avif)$/i;
const MAX_MB = 6144; // debe coincidir con MAX_VIDEO_MB del backend

export default function SubirVideos() {
  const [allTags, setAllTags] = useState([]);
  const [cats, setCats] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [desc, setDesc] = useState('');
  const [descEn, setDescEn] = useState('');
  const [duration, setDuration] = useState('00:00');
  const [isFetiche, setIsFetiche] = useState(false);
  const [feticheCat, setFeticheCat] = useState('');
  const [isTendencia, setIsTendencia] = useState(false);
  const [tagsEs, setTagsEs] = useState([]);
  const [tagsEn, setTagsEn] = useState([]);
  const [newTagEs, setNewTagEs] = useState('');
  const [newTagEn, setNewTagEn] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [thumbPreview, setThumbPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);

  const editing = editingId !== null;

  useEffect(() => {
    fetch(`${API}/api/tags`).then((r) => (r.ok ? r.json() : { data: [] })).then((d) => setAllTags(d.data || [])).catch(() => {});
    fetch(`${API}/api/fetiche-categorias`).then((r) => (r.ok ? r.json() : { data: [] })).then((d) => setCats(d.data || [])).catch(() => {});
  }, []);

  function resetForm() {
    setEditingId(null);
    setTitle(''); setTitleEn(''); setDesc(''); setDescEn('');
    setDuration('00:00');
    setIsFetiche(false); setFeticheCat(''); setIsTendencia(false);
    setTagsEs([]); setTagsEn([]); setNewTagEs(''); setNewTagEn('');
    setVideoFile(null); setThumbFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setVideoPreview(''); setThumbPreview('');
    setFormKey((k) => k + 1);
    setMsg(null);
  }

  /** Llamado desde la lista al pulsar "Editar" */
  function handleEdit(v) {
    setEditingId(v.id);
    setTitle(v.titulo_es || '');
    setTitleEn(v.titulo_en || '');
    setDesc(v.desc_es || '');
    setDescEn(v.desc_en || '');
    setDuration(v.duracion || '00:00');
    setIsFetiche(!!v.is_fetiche);
    setFeticheCat(v.fetiche_categoria || '');
    setIsTendencia(!!v.is_tendencia);
    setTagsEs(v.tags || []);
    setTagsEn([]);
    setNewTagEs(''); setNewTagEn('');
    setVideoFile(null); setThumbFile(null);
    if (videoPreview && videoPreview.startsWith('blob:')) URL.revokeObjectURL(videoPreview);
    if (thumbPreview && thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
    setVideoPreview(v.src ? mediaUrl(v.src) : '');
    setThumbPreview(v.thumb ? mediaUrl(v.thumb) : '');
    setMsg(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleTag(list, setList, tag) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  function setVideoFromFile(file) {
    if (file && file.size > MAX_MB * 1024 * 1024) {
      setMsg({ type: 'err', text: `El video pesa ${sizeLabel(file.size)} y el máximo es ${(MAX_MB / 1024).toFixed(0)} GB.` });
      return;
    }
    setVideoFile(file || null);
    if (videoPreview && videoPreview.startsWith('blob:')) URL.revokeObjectURL(videoPreview);
    if (!file) { setVideoPreview(''); return; }
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = () => { if (!Number.isNaN(v.duration)) setDuration(fmt(v.duration)); };
  }

  function setThumbFromFile(file) {
    setThumbFile(file || null);
    if (thumbPreview && thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(file ? URL.createObjectURL(file) : '');
  }

  function pickVideo(e) { setVideoFromFile(e.target.files?.[0] || null); }
  function pickThumb(e) { setThumbFromFile(e.target.files?.[0] || null); }

  /* ---------- drag & drop ---------- */
  const [dragVideo, setDragVideo] = useState(false);
  const [dragThumb, setDragThumb] = useState(false);

  function dropVideo(e) {
    e.preventDefault();
    setDragVideo(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/') || VIDEO_RE.test(file.name)) {
      setVideoFromFile(file);
      setMsg(null);
    } else {
      setMsg({ type: 'err', text: 'Suelta un archivo de video (mp4/mov/webm/mkv).' });
    }
  }

  function dropThumb(e) {
    e.preventDefault();
    setDragThumb(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/') || IMG_RE.test(file.name)) {
      setThumbFromFile(file);
      setMsg(null);
    } else {
      setMsg({ type: 'err', text: 'Suelta una imagen (png/jpg/webp).' });
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) { setMsg({ type: 'err', text: 'El título ES es obligatorio.' }); return; }
    if (!editing && !videoFile) { setMsg({ type: 'err', text: 'Selecciona el archivo de video.' }); return; }

    setLoading(true);
    try {
      if (editing) {
        // 1) metadata
        const r = await fetch(`${API}/api/videos/${editingId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            title, titleEn, desc, descEn, duration,
            isFetiche, feticheCategoria: feticheCat, isTendencia,
            tags: tagsEs.join(', '), tagsEn: (tagsEn.length ? tagsEn : tagsEs).join(', '),
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'No se pudo guardar');

        // 2) archivos (si se eligieron)
        let processing = false;
        if (videoFile || thumbFile) {
          const fd = new FormData();
          if (videoFile) fd.append('video', videoFile);
          if (thumbFile) fd.append('thumb', thumbFile);
          const rm = await fetch(`${API}/api/videos/${editingId}/media`, {
            method: 'POST',
            headers: authHeaders(),
            body: fd,
          });
          const jm = await rm.json().catch(() => ({}));
          if (!rm.ok) throw new Error(jm.error || 'No se pudieron guardar los archivos');
          processing = !!jm.processing;
        }
        setMsg({
          type: 'ok',
          text: processing
            ? `Video #${editingId} actualizado. Generando calidades en segundo plano…`
            : `Video #${editingId} actualizado.`,
        });
        setListRefresh((k) => k + 1);
        resetForm();
      } else {
        const fd = new FormData();
        fd.append('video', videoFile);
        if (thumbFile) fd.append('thumb', thumbFile);
        fd.append('title', title);
        fd.append('titleEn', titleEn);
        fd.append('desc', desc);
        fd.append('descEn', descEn);
        fd.append('duration', duration || '00:00');
        fd.append('isFetiche', isFetiche ? 'true' : 'false');
        fd.append('feticheCategoria', feticheCat);
        fd.append('isTendencia', isTendencia ? 'true' : 'false');
        fd.append('tags', tagsEs.join(', '));
        fd.append('tagsEn', (tagsEn.length ? tagsEn : tagsEs).join(', '));

        const res = await fetch(`${API}/api/videos/upload`, {
          method: 'POST',
          headers: { Authorization: authHeaders().Authorization },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo subir el video');
        setMsg({
          type: 'ok',
          text: data.processing
            ? `Video #${data.video?.id ?? ''} guardado. Generando calidades (1080p→360p) en segundo plano…`
            : `Video creado correctamente (#${data.video?.id ?? ''}).`,
        });
        setListRefresh((k) => k + 1);
        resetForm();
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>{editing ? `Editar video #${editingId}` : 'Subir video'}</h2>
        <p className={styles.sub}>
          {editing
            ? 'Modifica los datos y/o reemplaza el video o la portada.'
            : 'Sube videos con portada, duración, tags en ES/EN y marca fetiche o tendencia.'}
        </p>
      </div>

      <div className={`${styles.card} ${editing ? styles.cardEditing : ''}`}>
        <form
          key={formKey}
          className={styles.form}
          onSubmit={onSubmit}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
        >
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Título ES *</label>
              <input className={styles.input} placeholder="Título en español" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Title EN</label>
              <input className={styles.input} placeholder="Title in English (opcional)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Descripción ES</label>
              <textarea className={styles.textarea} placeholder="Descripción en español" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Description EN</label>
              <textarea className={styles.textarea} placeholder="Description in English" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Canal</label>
              <span className={styles.canalBadge}>
                <ion-icon name="checkmark-circle" suppressHydrationWarning></ion-icon>
                administrador pikante.pe
              </span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Duración</label>
              <div className={styles.durationWrap}>
                <input className={`${styles.input} ${styles.durationReadonly}`} placeholder="00:00" value={duration} readOnly tabIndex={-1} />
                <span className={styles.autoTag}>Auto</span>
              </div>
            </div>
          </div>

          <div className={styles.flagsRow}>
            <label className={styles.switch}>
              <input type="checkbox" checked={isFetiche} onChange={(e) => setIsFetiche(e.target.checked)} />
              <span className={styles.track}><span className={styles.knob} /></span>
              Es fetiche
            </label>

            <div className={styles.catInline}>
              <span className={styles.catLabel}>Categoría</span>
              <select className={styles.select} value={feticheCat} disabled={!isFetiche} onChange={(e) => setFeticheCat(e.target.value)}>
                <option value="">— Sin categoría —</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <label className={styles.switch}>
              <input type="checkbox" checked={isTendencia} onChange={(e) => setIsTendencia(e.target.checked)} />
              <span className={styles.track}><span className={styles.knob} /></span>
              Tendencia
            </label>
          </div>

          <div>
            <div className={styles.tagsHead}>
              <span className={styles.tagsHint}>Tags ES — clic para agregar</span>
            </div>
            <div className={styles.tagRow}>
              {allTags.length === 0 && <span className={styles.tagsHint}>Sin tags aún, agrega uno nuevo abajo.</span>}
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.tagBtn} ${tagsEs.includes(t) ? styles.tagBtnActive : ''}`}
                  onClick={() => toggleTag(tagsEs, setTagsEs, t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tagsEs.length > 0 && (
              <div className={styles.chips}>
                {tagsEs.map((t) => (
                  <span key={t} className={styles.chip}>
                    {t}
                    <button type="button" onClick={() => toggleTag(tagsEs, setTagsEs, t)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.addRow}>
              <input className={`${styles.input} ${styles.addInput}`} placeholder="Nuevo tag ES + Enter" value={newTagEs}
                onChange={(e) => setNewTagEs(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newTagEs.trim(); if (v && !tagsEs.includes(v)) setTagsEs([...tagsEs, v]); setNewTagEs(''); } }} />
              <button type="button" className={styles.tagBtn} onClick={() => { const v = newTagEs.trim(); if (v && !tagsEs.includes(v)) setTagsEs([...tagsEs, v]); setNewTagEs(''); }}>Agregar tag</button>
            </div>
          </div>

          <div>
            <div className={styles.tagsHead}>
              <span className={styles.tagsHint}>Tags EN — opcional (si vacío usa los ES)</span>
            </div>
            {tagsEn.length > 0 && (
              <div className={styles.chips}>
                {tagsEn.map((t) => (
                  <span key={t} className={styles.chip}>
                    {t}
                    <button type="button" onClick={() => toggleTag(tagsEn, setTagsEn, t)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.addRow}>
              <input className={`${styles.input} ${styles.addInput}`} placeholder="New EN tag + Enter" value={newTagEn}
                onChange={(e) => setNewTagEn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newTagEn.trim(); if (v && !tagsEn.includes(v)) setTagsEn([...tagsEn, v]); setNewTagEn(''); } }} />
              <button type="button" className={styles.tagBtn} onClick={() => { const v = newTagEn.trim(); if (v && !tagsEn.includes(v)) setTagsEn([...tagsEn, v]); setNewTagEn(''); }}>Agregar tag EN</button>
            </div>
          </div>

          <div className={styles.files}>
            <div
              className={`${styles.fileBox} ${videoFile ? styles.filled : ''} ${dragVideo ? styles.dropActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragVideo(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragVideo(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragVideo(false); }}
              onDrop={dropVideo}
            >
              <span className={styles.fileLabel}>Video {editing ? '· reemplazará el actual' : '*'}</span>
              <div className={styles.preview}>
                {videoPreview
                  ? <video className={styles.previewVideo} src={videoPreview} controls muted playsInline />
                  : (
                    <span className={styles.previewEmpty}>
                      <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
                      {dragVideo ? 'Suelta el video' : 'Arrastra el video aquí'}
                    </span>
                  )}
              </div>
              <input className={styles.fileInput} type="file" accept="video/*" onChange={pickVideo} required={!editing} />
              {videoFile && <span className={styles.fileMeta}>{videoFile.name} · {sizeLabel(videoFile.size)}</span>}
            </div>

            <div
              className={`${styles.fileBox} ${thumbFile ? styles.filled : ''} ${dragThumb ? styles.dropActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragThumb(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragThumb(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragThumb(false); }}
              onDrop={dropThumb}
            >
              <span className={styles.fileLabel}>Portada / Thumb {editing ? '· reemplazará la actual' : ''}</span>
              <div className={styles.preview}>
                {thumbPreview
                  ? <img className={styles.previewImg} src={thumbPreview} alt="preview" />
                  : (
                    <span className={styles.previewEmpty}>
                      <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                      {dragThumb ? 'Suelta la imagen' : 'Arrastra la portada aquí'}
                    </span>
                  )}
              </div>
              <input className={styles.fileInput} type="file" accept="image/*" onChange={pickThumb} />
              {thumbFile && <span className={styles.fileMeta}>{thumbFile.name} · {sizeLabel(thumbFile.size)}</span>}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.submit} type="submit" disabled={loading}>
              <ion-icon name={loading ? 'sync-outline' : editing ? 'save-outline' : 'cloud-upload-outline'} suppressHydrationWarning></ion-icon>
              {loading ? 'Guardando…' : editing ? 'Guardar cambios' : 'Subir video'}
            </button>
            <button className={styles.reset} type="button" onClick={resetForm}>
              {editing ? 'Cancelar edición' : 'Limpiar'}
            </button>
            {msg && <span className={`${styles.msg} ${msg.type === 'ok' ? styles.msgOk : styles.msgErr}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      <ListaVideos onEdit={handleEdit} refreshKey={listRefresh} />
    </section>
  );
}
