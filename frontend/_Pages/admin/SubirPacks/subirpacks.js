'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import sv from '@/_Pages/admin/SubirVideos/subirvideos.module.css';
import ls from '@/_Pages/admin/SubirVideos/lista.module.css';
import sp from './subirpacks.module.css';
import { API_URL, authHeaders, mediaUrl } from '@/_Extras/Api/api.js';

const API = API_URL;
const VIDEO_RE = /\.(mp4|mov|webm|mkv|avi)$/i;
const IMG_RE = /\.(png|jpe?g|webp|avif)$/i;
const PER_PAGE = 20;

function sizeLabel(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export default function SubirPacks() {
  const [allTags, setAllTags] = useState([]);

  const [titleEs, setTitleEs] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descEs, setDescEs] = useState('');
  const [descEn, setDescEn] = useState('');
  const [uploader, setUploader] = useState('administrador pikante.pe');
  const [precio, setPrecio] = useState('S/ 0.00');
  const [tagsEs, setTagsEs] = useState([]);
  const [tagsEn, setTagsEn] = useState([]);
  const [newTagEs, setNewTagEs] = useState('');
  const [newTagEn, setNewTagEn] = useState('');

  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState('');
  const [videoFiles, setVideoFiles] = useState([]);   // File[]
  const [imageFiles, setImageFiles] = useState([]);   // { file, url }[]
  const [drag, setDrag] = useState(false);

  const allInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);

  // lista
  const [packs, setPacks] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('packs');
  const qRef = useRef('');
  const firstRun = useRef(true);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  useEffect(() => {
    fetch(`${API}/api/tags`).then((r) => (r.ok ? r.json() : { data: [] })).then((d) => setAllTags(d.data || [])).catch(() => {});
  }, []);

  const loadPacks = useCallback(async (query = '', t = 'packs', p = 1) => {
    qRef.current = query;
    try {
      const papelera = t === 'papelera' ? '&papelera=true' : '';
      const url = `${API}/api/packs?limit=${PER_PAGE}&page=${p}&_=${Date.now()}${papelera}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      setPacks(j.data || []);
      setTotal(j.total || (j.data || []).length);
      setPage(j.page || p);
    } catch {
      setPacks([]);
    }
  }, []);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; loadPacks('', 'packs', 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listRefresh > 0) { setPage(1); loadPacks(qRef.current, tab, 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRefresh]);

  function resetForm() {
    setTitleEs(''); setTitleEn(''); setDescEs(''); setDescEn('');
    setUploader('administrador pikante.pe'); setPrecio('S/ 0.00');
    setTagsEs([]); setTagsEn([]); setNewTagEs(''); setNewTagEn('');
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(null); setThumbPreview('');
    imageFiles.forEach((x) => URL.revokeObjectURL(x.url));
    setVideoFiles([]); setImageFiles([]);
    setFormKey((k) => k + 1);
    setMsg(null);
  }

  function toggleTag(list, setList, tag) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  function setThumb(file) {
    setThumbFile(file || null);
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(file ? URL.createObjectURL(file) : '');
  }

  /** Clasifica y agrega archivos sueltos (varios de golpe: fotos y videos). */
  function addFiles(list) {
    const arr = Array.from(list || []);
    if (!arr.length) return;
    const vids = arr.filter((f) => f.type.startsWith('video/') || VIDEO_RE.test(f.name));
    const imgs = arr.filter((f) => f.type.startsWith('image/') || IMG_RE.test(f.name));
    if (!vids.length && !imgs.length) {
      setMsg({ type: 'err', text: 'Suelta imágenes o videos.' });
      return;
    }

    const vKeys = new Set(videoFiles.map((f) => `${f.name}_${f.size}`));
    const newVids = vids.filter((f) => !vKeys.has(`${f.name}_${f.size}`));

    const iKeys = new Set(imageFiles.map((x) => `${x.file.name}_${x.file.size}`));
    const newImgs = imgs
      .filter((f) => !iKeys.has(`${f.name}_${f.size}`))
      .map((f) => ({ file: f, url: URL.createObjectURL(f) }));

    if (newVids.length) setVideoFiles((cur) => [...cur, ...newVids]);
    if (newImgs.length) {
      setImageFiles((cur) => [...cur, ...newImgs]);
      if (!thumbFile) setThumb(newImgs[0].file); // primera imagen = portada
    }
    setMsg(null);
  }

  function pickAll(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function removeImage(url) {
    const item = imageFiles.find((x) => x.url === url);
    if (item) URL.revokeObjectURL(item.url);
    const next = imageFiles.filter((x) => x.url !== url);
    setImageFiles(next);
    if (item && thumbFile === item.file) setThumb(next[0]?.file || null);
  }

  function removeVideo(key) {
    setVideoFiles((cur) => cur.filter((f) => `${f.name}_${f.size}` !== key));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (!titleEs.trim()) { setMsg({ type: 'err', text: 'El título ES es obligatorio.' }); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('titleEs', titleEs);
      fd.append('titleEn', titleEn || titleEs);
      fd.append('descEs', descEs);
      fd.append('descEn', descEn || descEs);
      fd.append('uploader', uploader);
      fd.append('precio', precio);
      fd.append('tags', [...tagsEs, ...tagsEn].join(', '));
      if (thumbFile) fd.append('thumb', thumbFile);
      videoFiles.forEach((f) => fd.append('videos', f));
      imageFiles.forEach((x) => fd.append('images', x.file));

      const res = await fetch(`${API}/api/packs/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el pack');

      setMsg({
        type: 'ok',
        text: data.processing
          ? `Pack #${data.pack?.id ?? ''} guardado. Generando calidades de los videos en segundo plano…`
          : `Pack creado correctamente (#${data.pack?.id ?? ''}).`,
      });
      setListRefresh((k) => k + 1);
      resetForm();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function doAction(kind, p) {
    try {
      if (kind === 'restore') {
        await fetch(`${API}/api/packs/${p.public_id}/restore`, { method: 'POST', headers: authHeaders() });
      } else if (kind === 'trash') {
        await fetch(`${API}/api/packs/${p.public_id}`, { method: 'DELETE', headers: authHeaders() });
      } else if (kind === 'permanent') {
        await fetch(`${API}/api/packs/${p.public_id}/permanent`, { method: 'DELETE', headers: authHeaders() });
      }
      loadPacks(qRef.current, tab, page);
    } catch (err) {
      alert(err.message);
    }
  }

  function switchTab(t) {
    setTab(t);
    setQ('');
    qRef.current = '';
    setPage(1);
    loadPacks('', t, 1);
  }

  function go(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    loadPacks(qRef.current, tab, next);
  }

  return (
    <section className={sv.wrap}>
      <div className={sv.head}>
        <h2 className={sv.h2}>Agregar pack</h2>
        <p className={sv.sub}>
          Sube un pack con portada, varios videos e imágenes en ES/EN. Los archivos se guardan
          ordenados en <b>media_completa/packs/pack_&lt;nombre&gt;_##/</b> (thumb, videos, imagenes).
        </p>
      </div>

      <div className={sv.card}>
        <form key={formKey} className={sv.form} onSubmit={onSubmit}>
          <div className={sv.grid2}>
            <div className={sv.field}>
              <label className={sv.label}>Título ES *</label>
              <input className={sv.input} placeholder="Título en español" value={titleEs} onChange={(e) => setTitleEs(e.target.value)} required />
            </div>
            <div className={sv.field}>
              <label className={sv.label}>Title EN</label>
              <input className={sv.input} placeholder="Title in English (opcional)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
          </div>

          <div className={sv.grid2}>
            <div className={sv.field}>
              <label className={sv.label}>Descripción ES</label>
              <textarea className={sv.textarea} placeholder="Descripción en español" value={descEs} onChange={(e) => setDescEs(e.target.value)} />
            </div>
            <div className={sv.field}>
              <label className={sv.label}>Description EN</label>
              <textarea className={sv.textarea} placeholder="Description in English" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            </div>
          </div>

          <div className={sv.grid2}>
            <div className={sv.field}>
              <label className={sv.label}>Uploader / Persona</label>
              <input className={sv.input} value={uploader} onChange={(e) => setUploader(e.target.value)} />
            </div>
            <div className={sv.field}>
              <label className={sv.label}>Precio</label>
              <input className={sv.input} value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </div>
          </div>

          <div className={sv.field}>
            <label className={sv.label}>Link de descarga</label>
            <span className={sv.tagsHint}>
              Se genera automáticamente con la URL del pack: <b>https://www.pikantepe.com/packs/&lt;id&gt;</b>
            </span>
          </div>

          <div>
            <div className={sv.tagsHead}><span className={sv.tagsHint}>Tags ES — clic para agregar</span></div>
            <div className={sv.tagRow}>
              {allTags.map((t) => (
                <button key={t} type="button" className={`${sv.tagBtn} ${tagsEs.includes(t) ? sv.tagBtnActive : ''}`} onClick={() => toggleTag(tagsEs, setTagsEs, t)}>
                  {t}
                </button>
              ))}
            </div>
            {tagsEs.length > 0 && (
              <div className={sv.chips}>
                {tagsEs.map((t) => (
                  <span key={t} className={sv.chip}>{t}<button type="button" onClick={() => toggleTag(tagsEs, setTagsEs, t)}>×</button></span>
                ))}
              </div>
            )}
            <div className={sv.addRow}>
              <input className={`${sv.input} ${sv.addInput}`} placeholder="Nuevo tag ES + Enter" value={newTagEs}
                onChange={(e) => setNewTagEs(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newTagEs.trim(); if (v && !tagsEs.includes(v)) setTagsEs([...tagsEs, v]); setNewTagEs(''); } }} />
              <button type="button" className={sv.tagBtn} onClick={() => { const v = newTagEs.trim(); if (v && !tagsEs.includes(v)) setTagsEs([...tagsEs, v]); setNewTagEs(''); }}>Agregar tag</button>
            </div>
          </div>

          <div>
            <div className={sv.tagsHead}><span className={sv.tagsHint}>Tags EN — opcional (si vacío usa los ES)</span></div>
            {tagsEn.length > 0 && (
              <div className={sv.chips}>
                {tagsEn.map((t) => (
                  <span key={t} className={sv.chip}>{t}<button type="button" onClick={() => toggleTag(tagsEn, setTagsEn, t)}>×</button></span>
                ))}
              </div>
            )}
            <div className={sv.addRow}>
              <input className={`${sv.input} ${sv.addInput}`} placeholder="New EN tag + Enter" value={newTagEn}
                onChange={(e) => setNewTagEn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newTagEn.trim(); if (v && !tagsEn.includes(v)) setTagsEn([...tagsEn, v]); setNewTagEn(''); } }} />
              <button type="button" className={sv.tagBtn} onClick={() => { const v = newTagEn.trim(); if (v && !tagsEn.includes(v)) setTagsEn([...tagsEn, v]); setNewTagEn(''); }}>Agregar tag EN</button>
            </div>
          </div>

          <div className={sp.filesWrap}>
            <div
              className={`${sp.dropzone} ${drag ? sp.dropActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer?.files); }}
            >
              <ion-icon name="cloud-upload-outline" suppressHydrationWarning></ion-icon>
              <strong>Arrastra aquí todas las fotos y videos</strong>
              <span>O haz clic para seleccionarlos. Se clasifican solos y la primera imagen será la portada.</span>
              <input ref={allInputRef} className={sp.dropInput} type="file" accept="image/*,video/*" multiple onChange={pickAll} />
            </div>

            {(imageFiles.length > 0 || videoFiles.length > 0) && (
              <div className={sp.summary}>
                <ion-icon name="checkmark-circle" suppressHydrationWarning></ion-icon>
                {imageFiles.length} imagen(es) · {videoFiles.length} video(s)
              </div>
            )}

            {thumbPreview && (
              <div className={sp.coverBox}>
                <span className={sv.fileLabel}>Portada (haz clic en una imagen para cambiarla)</span>
                <img className={sp.coverImg} src={thumbPreview} alt="portada" />
              </div>
            )}

            {imageFiles.length > 0 && (
              <div className={sp.section}>
                <span className={sv.fileLabel}>Imágenes / Fotos ({imageFiles.length})</span>
                <div className={sp.grid}>
                  {imageFiles.map((x) => (
                    <div key={x.url} className={`${sp.thumb} ${thumbFile === x.file ? sp.cover : ''}`}>
                      <img className={sp.thumbImg} src={x.url} alt="" onClick={() => setThumb(x.file)} />
                      {thumbFile === x.file && <span className={sp.coverBadge}>Portada</span>}
                      <button type="button" className={sp.removeBtn} onClick={() => removeImage(x.url)} aria-label="Quitar">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {videoFiles.length > 0 && (
              <div className={sp.section}>
                <span className={sv.fileLabel}>Videos ({videoFiles.length})</span>
                <ul className={sp.videoList}>
                  {videoFiles.map((f) => (
                    <li key={`${f.name}_${f.size}`} className={sp.videoItem}>
                      <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
                      <span className={sp.videoName}>{f.name}</span>
                      <span className={sp.videoSize}>{sizeLabel(f.size)}</span>
                      <button type="button" className={sp.removeBtnInline} onClick={() => removeVideo(`${f.name}_${f.size}`)} aria-label="Quitar">×</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className={sv.actions}>
            <button className={sv.submit} type="submit" disabled={loading}>
              <ion-icon name={loading ? 'sync-outline' : 'cube-outline'} suppressHydrationWarning></ion-icon>
              {loading ? 'Subiendo…' : 'Subir pack'}
            </button>
            <button className={sv.reset} type="button" onClick={resetForm}>Limpiar</button>
            {msg && <span className={`${sv.msg} ${msg.type === 'ok' ? sv.msgOk : sv.msgErr}`}>{msg.text}</span>}
          </div>
        </form>
      </div>

      {/* ===== Lista de packs ===== */}
      <div className={ls.card}>
        <div className={ls.head}>
          <div className={ls.headLeft}>
            <div className={ls.tabs}>
              <button type="button" className={`${ls.tab} ${tab === 'packs' ? ls.tabActive : ''}`} onClick={() => switchTab('packs')}>
                <ion-icon name="cube-outline" suppressHydrationWarning></ion-icon> Packs
              </button>
              <button type="button" className={`${ls.tab} ${tab === 'papelera' ? ls.tabActive : ''}`} onClick={() => switchTab('papelera')}>
                <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon> Papelera
              </button>
            </div>
            <span className={ls.count}>{total}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className={ls.search}>
              <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
              <input placeholder="Buscar pack..." value={q}
                onChange={(e) => { setQ(e.target.value); qRef.current = e.target.value; }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadPacks(qRef.current, tab, 1); } }} />
            </div>
            <button className={ls.refresh} type="button" onClick={() => loadPacks(qRef.current, tab, page)}>
              <ion-icon name="refresh-outline" suppressHydrationWarning></ion-icon> Recargar
            </button>
          </div>
        </div>

        {packs.length === 0 ? (
          <p className={ls.empty}>{tab === 'papelera' ? 'La papelera está vacía.' : 'No hay packs todavía. Sube el primero arriba.'}</p>
        ) : (
          <div className={ls.tableWrap}>
            <table className={ls.table}>
              <thead>
                <tr>
                  <th>Portada</th>
                  <th>Título</th>
                  <th>Contenido</th>
                  <th>Stats</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id} className={ls.row}>
                    <td>
                      {p.thumb
                        ? <img className={ls.thumb} src={mediaUrl(p.thumb)} alt="" loading="lazy" />
                        : <div className={ls.thumbEmpty}><ion-icon name="image-outline" suppressHydrationWarning></ion-icon></div>}
                    </td>
                    <td className={ls.titleCell}>
                      <div className={ls.vtitle}>{p.titulo_es || p.titulo}</div>
                      <div className={ls.vpath}>{p.titulo_en || ''}</div>
                    </td>
                    <td>{p.fotos || 0} fotos · {p.videos || 0} videos</td>
                    <td>
                      <ion-icon name="thumbs-up-outline" suppressHydrationWarning></ion-icon> {p.likes || 0} ·{' '}
                      <ion-icon name="download-outline" suppressHydrationWarning></ion-icon> {p.descargas || 0} ·{' '}
                      <ion-icon name="eye-outline" suppressHydrationWarning></ion-icon> {p.vistas || 0}
                    </td>
                    <td>
                      <div className={ls.actions}>
                        {tab === 'packs' ? (
                          <button className={`${ls.act} ${ls.danger}`} type="button" onClick={() => doAction('trash', p)}>
                            <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon> Papelera
                          </button>
                        ) : (
                          <>
                            <button className={ls.act} type="button" onClick={() => doAction('restore', p)}>
                              <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon> Restaurar
                            </button>
                            <button className={`${ls.act} ${ls.danger}`} type="button" onClick={() => { if (confirm('¿Eliminar definitivamente el pack y sus archivos?')) doAction('permanent', p); }}>
                              <ion-icon name="close-circle-outline" suppressHydrationWarning></ion-icon> Eliminar
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
          <div className={ls.pager}>
            <button className={ls.pageBtn} type="button" disabled={page <= 1} onClick={() => go(page - 1)}>
              <ion-icon name="chevron-back-outline" suppressHydrationWarning></ion-icon>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" className={`${ls.pageBtn} ${p === page ? ls.pageActive : ''}`} onClick={() => go(p)}>{p}</button>
            ))}
            <button className={ls.pageBtn} type="button" disabled={page >= totalPages} onClick={() => go(page + 1)}>
              <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
            </button>
            <span className={ls.pagerInfo}>{total} · pág {page}/{totalPages}</span>
          </div>
        )}
      </div>
    </section>
  );
}
