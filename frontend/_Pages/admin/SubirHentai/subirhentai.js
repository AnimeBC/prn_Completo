'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './subirhentai.module.css';
import { API_URL, mediaUrl, authHeaders } from '@/_Extras/Api/api.js';
import { resolveTags, mergeTags, parseTags } from '@/_Extras/Tags/tagsInput.js';

const API = API_URL;
const PER_PAGE = 10;

function resolveImg(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/media/')) return mediaUrl(p);
  return p;
}

const EMPTY = {
  titulo_es: '', titulo_ja: '', titulo_en: '', desc_es: '', desc_en: '',
  canal: 'administrador pikante.pe',
  tipo: '', anio: '', temporada: '', estado: 'En emisión',
};

const TIPOS = ['', 'TV', 'OVA', 'ONA', 'Especial', 'Película'];
const ESTADOS = ['En emisión', 'Finalizado', 'Próximamente', 'En pausa'];
const MODOS = [
  { id: 'sub', label: 'Subtitulado ES', short: 'Sub' },
  { id: 'es', label: 'Español (doblado)', short: 'Esp' },
  { id: 'en', label: 'Inglés (doblado)', short: 'Ing' },
  { id: 'en_sub', label: 'Inglés subtitulado', short: 'Ing.sub' },
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1989 + 1 }, (_, i) => THIS_YEAR + 1 - i);

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

function DropZone({ accept, file, onFile, onFiles, multiple = false, icon, label, hint, compact = false }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function collect(dt) {
    if (dt?.files?.length) return Array.from(dt.files);
    if (dt?.items?.length) return Array.from(dt.items).map((it) => it.getAsFile?.()).filter(Boolean);
    return [];
  }

  function handleFiles(files) {
    if (!files.length) return;
    if (multiple && onFiles) onFiles(files);
    else if (files[0] && onFile) onFile(files[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    handleFiles(collect(e.dataTransfer));
  }

  const isVideo = file && (file.type?.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name || ''));

  return (
    <div
      className={`${styles.drop} ${compact ? styles.dropSm : ''} ${drag ? styles.dropOn : ''} ${file ? styles.dropHas : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.hidden}
        onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; handleFiles(files); }}
      />
      {file && url ? (
        isVideo
          ? <video className={styles.dropPreview} src={url} muted playsInline preload="metadata" />
          : <img className={styles.dropPreview} src={url} alt="" />
      ) : (
        <ion-icon name={file ? 'checkmark-circle' : icon} className={styles.dropIcon} suppressHydrationWarning></ion-icon>
      )}
      <span className={styles.dropText}>{file ? file.name : label}</span>
      <span className={styles.dropHint}>{file ? 'Clic o arrastra para cambiar' : hint}</span>
    </div>
  );
}

export default function HentaiAdmin() {
  const [series, setSeries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('series');
  const [listLoading, setListLoading] = useState(false);
  const qRef = useRef('');

  const [editing, setEditing] = useState(null);
  const [modos, setModos] = useState({});
  const [modeTab, setModeTab] = useState('sub');
  const [form, setForm] = useState(EMPTY);
  const [tagsEs, setTagsEs] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [titulosExtras, setTitulosExtras] = useState([]);
  const [newTitulo, setNewTitulo] = useState('');
  const [bulkTitulos, setBulkTitulos] = useState('');
  const [episodes, setEpisodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const editorRef = useRef(null);

  const [capForm, setCapForm] = useState({ numero: '1' });
  const [capBusy, setCapBusy] = useState(false);
  const [capProg, setCapProg] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [editFuenteId, setEditFuenteId] = useState(null);
  const [thumbBusyId, setThumbBusyId] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const shownEpisodes = episodes.filter((c) => (c.fuentes || []).some((f) => f.modo === modeTab));

  useEffect(() => {
    fetch(`${API}/api/hentai/tags`).then((r) => (r.ok ? r.json() : { data: [] })).then((d) => setAllTags(d.data || [])).catch(() => {});
  }, []);

  const loadList = useCallback(async (query, t, p) => {
    qRef.current = query;
    setListLoading(true);
    try {
      const papelera = t === 'papelera' ? '&papelera=true' : '';
      const url = `${API}/api/hentai/admin/list?limit=${PER_PAGE}&page=${p}${papelera}${query ? `&q=${encodeURIComponent(query)}` : ''}&_=${Date.now()}`;
      const r = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      setSeries(j.data || []);
      setTotal(j.total || 0);
      setPage(j.page || p);
    } catch { setSeries([]); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadList('', 'series', 1); }, [loadList]);

  function switchTab(t) {
    setTab(t); setQ(''); qRef.current = ''; setPage(1);
    loadList('', t, 1);
  }
  function go(p) {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
    loadList(qRef.current, tab, next);
  }

  function toggleTag(tag) {
    setTagsEs((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]));
  }
  function addTag() {
    const v = newTag.trim();
    if (v && !tagsEs.includes(v)) setTagsEs([...tagsEs, v]);
    setNewTag('');
  }

  /** Pega una lista (#tag1 #tag2 ...): limpia "#", compara sin mayúsculas,
   *  agrega los nuevos al catálogo y selecciona todos. */
  function addAllTags() {
    const resolved = resolveTags(bulkTags, allTags);
    if (!resolved.length) { setBulkTags(''); return; }
    setAllTags((cat) => mergeTags(cat, resolved));
    setTagsEs((list) => mergeTags(list, resolved));
    setBulkTags('');
  }

  // ===== Títulos extras (títulos alternos en otros idiomas) =====
  function addTitulo() {
    const v = newTitulo.trim();
    if (v) setTitulosExtras((list) => mergeTags(list, [v]));
    setNewTitulo('');
  }
  function addAllTitulos() {
    const parsed = parseTags(bulkTitulos);
    if (!parsed.length) { setBulkTitulos(''); return; }
    setTitulosExtras((list) => mergeTags(list, parsed));
    setBulkTitulos('');
  }
  function removeTitulo(t) {
    setTitulosExtras((list) => list.filter((x) => x !== t));
  }

  function captureMode() {
    return {
      titulo: form.titulo_es, titulo_alt: form.titulo_ja, descripcion: form.desc_es,
      tipo: form.tipo, anio: form.anio, temporada: form.temporada, estado: form.estado, tags: tagsEs,
      titulos_extras: titulosExtras,
    };
  }
  function loadMode(m) {
    const md = modos[m] || {};
    setForm((f) => ({
      ...f,
      titulo_es: md.titulo || '', titulo_ja: md.titulo_alt || '', desc_es: md.descripcion || '',
      tipo: md.tipo || '', anio: md.anio ? String(md.anio) : '', temporada: md.temporada || '',
      estado: md.estado || 'En emisión',
    }));
    setTagsEs(md.tags || []);
    setTitulosExtras(md.titulos_extras || []);
  }
  function selectMode(m) {
    if (m === modeTab) return;
    setModos((prev) => ({ ...prev, [modeTab]: captureMode() }));
    setModeTab(m);
    loadMode(m);
  }

  function newSerie() {
    setEditing(null);
    setModos({});
    setModeTab('sub');
    setForm(EMPTY);
    setTagsEs([]);
    setBulkTags('');
    setTitulosExtras([]);
    setNewTitulo('');
    setBulkTitulos('');
    setEpisodes([]);
    setCapForm({ numero: '1' });
    setEditFuenteId(null);
    setMsg(''); setError('');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function editSerie(id) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo abrir la serie'); return; }
      const cap = Array.isArray(j.capitulos) ? j.capitulos : [];
      const md = j.modos || {};
      setEditing(j);
      setModos(md);
      setEpisodes(cap);
      setModeTab('sub');
      const sub = md.sub || {};
      setForm({
        titulo_es: sub.titulo || '', titulo_ja: sub.titulo_alt || '', titulo_en: j.titulo_en || '',
        desc_es: sub.descripcion || '', desc_en: '',
        canal: j.canal || 'administrador pikante.pe',
        tipo: sub.tipo || '', anio: sub.anio ? String(sub.anio) : '',
        temporada: sub.temporada || '', estado: sub.estado || 'En emisión',
      });
      setTagsEs(sub.tags || []);
      setTitulosExtras(sub.titulos_extras || []);
      setCapForm({ numero: String(cap.length + 1) });
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { setError('No hay conexión con el servidor.'); }
  }

  async function createSerie(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          titulo_es: form.titulo_es, titulo_ja: form.titulo_ja, titulo_en: form.titulo_en,
          desc_es: form.desc_es, desc_en: form.desc_en,
          canal: form.canal, tags: tagsEs.join(', '),
          titulos_extras: titulosExtras.join(', '),
          tipo: form.tipo, anio: form.anio, temporada: form.temporada, estado: form.estado,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo crear la serie'); return; }
      setMsg('Serie creada. Completa cada modo y sube los episodios.');
      await loadList(qRef.current, tab, 1);
      editSerie(j.serie.id);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function saveSerie(e) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${editing.id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          modo: modeTab,
          titulo: form.titulo_es, titulo_alt: form.titulo_ja, descripcion: form.desc_es,
          tags: tagsEs.join(', '), tipo: form.tipo, anio: form.anio, temporada: form.temporada,
          titulos_extras: titulosExtras.join(', '),
          estado: form.estado, canal: form.canal,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo guardar'); return; }
      setEditing((s) => ({ ...(s || {}), canal: j.serie?.canal || s?.canal }));
      setModos((prev) => ({ ...prev, [modeTab]: captureMode() }));
      setMsg(`Modo «${MODOS.find((m) => m.id === modeTab)?.label}» guardado.`);
      loadList(qRef.current, tab, page);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function uploadCover(file) {
    if (!editing || !file) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('thumb', file);
      const r = await fetch(`${API}/api/hentai/${editing.id}/cover`, { method: 'POST', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir la portada'); return; }
      setEditing(j.serie);
      setMsg('Portada actualizada.');
      loadList(qRef.current, tab, page);
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }

  async function refreshEpisodes() {
    if (!editing) return;
    try {
      const r = await fetch(`${API}/api/hentai/${editing.id}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setEditing(j); setEpisodes(Array.isArray(j.capitulos) ? j.capitulos : []); }
    } catch { /* noop */ }
  }

  /** Sube VARIOS videos de golpe: cada uno crea/llena su episodio en el modo actual. */
  async function uploadEpisodes(files) {
    if (!editing || !files?.length) return;
    const arr = Array.from(files);
    const label = MODOS.find((m) => m.id === modeTab)?.label;
    setCapBusy(true); setError(''); setMsg('');
    setCapProg({ done: 0, total: arr.length });
    let next = episodes.reduce((m, e) => Math.max(m, Number(e.numero) || 0), 0) + 1;
    let done = 0;
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append('video', file);
        fd.append('numero', String(next));
        fd.append('modo', modeTab);
        const r = await fetch(`${API}/api/hentai/${editing.id}/capitulos`, { method: 'POST', headers: authHeaders(), body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setError(j.error || `No se pudo subir "${file.name}"`); break; }
        next += 1; done += 1;
        setCapProg({ done, total: arr.length });
      }
      if (done) setMsg(`${done} de ${arr.length} video(s) subido(s) en «${label}».`);
      refreshEpisodes();
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setCapBusy(false); setCapProg(null); }
  }

  /** Cambia la miniatura (thumb) de un video ya subido. */
  async function uploadFuenteThumb(fuenteId, file) {
    if (!file) return;
    setThumbBusyId(fuenteId); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('thumb', file);
      const r = await fetch(`${API}/api/hentai/fuentes/${fuenteId}`, { method: 'PUT', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir la miniatura'); return; }
      setMsg('Miniatura actualizada.');
      setEditFuenteId(null);
      refreshEpisodes();
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setThumbBusyId(null); }
  }

  async function persistOrder(copy) {
    setEpisodes(copy);
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${editing.id}/capitulos/reorder`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ order: copy.map((c) => c.id) }),
      });
      if (r.ok) { setMsg('Orden actualizado.'); refreshEpisodes(); }
      else setError('No se pudo reordenar');
    } catch { setError('No hay conexión con el servidor.'); }
  }

  function persistSubsetOrder(newSubset) {
    const ids = new Set(newSubset.map((e) => e.id));
    const positions = [];
    episodes.forEach((e, i) => { if (ids.has(e.id)) positions.push(i); });
    const result = [...episodes];
    positions.forEach((pos, k) => { result[pos] = newSubset[k]; });
    persistOrder(result);
  }

  function moveEpisode(index, dir) {
    const next = index + dir;
    if (next < 0 || next >= shownEpisodes.length) return;
    const copy = [...shownEpisodes];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    persistSubsetOrder(copy);
  }

  function dropEpisode(to) {
    if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; }
    const copy = [...shownEpisodes];
    const [item] = copy.splice(dragIdx, 1);
    copy.splice(to, 0, item);
    setDragIdx(null);
    persistSubsetOrder(copy);
  }

  async function deleteFuente(fuenteId) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/fuentes/${fuenteId}`, { method: 'DELETE', headers: authHeaders() });
      if (r.ok) { setMsg('Video del modo eliminado.'); refreshEpisodes(); }
    } catch { setError('No hay conexión con el servidor.'); }
  }

  async function trashSerie(id) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (r.ok) { setMsg('Serie movida a la papelera.'); if (editing?.id === id) newSerie(); loadList(qRef.current, tab, page); }
    } catch { setError('No hay conexión con el servidor.'); }
  }

  async function restoreSerie(id) {
    setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/hentai/${id}/restore`, { method: 'POST', headers: authHeaders() });
      if (r.ok) { setMsg('Serie restaurada.'); loadList(qRef.current, tab, page); }
    } catch { setError('No hay conexión con el servidor.'); }
  }

  const metaFields = (
    <>
      <div className={styles.two}>
        <select className={styles.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          {TIPOS.map((tp) => <option key={tp || 'none'} value={tp}>{tp || 'Tipo (TV/OVA…)'}</option>)}
        </select>
        <select className={styles.input} value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })}>
          <option value="">Año</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className={styles.two}>
        <input className={styles.input} placeholder="Temporada (ej: Verano 2026)" value={form.temporada}
          onChange={(e) => setForm({ ...form, temporada: e.target.value })} />
        <select className={styles.input} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
          {ESTADOS.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>
    </>
  );

  const tagsUI = (
    <>
      <div className={styles.tagsHead}>
        <span className={styles.tagsHint}>Tags — clic para agregar o quitar</span>
      </div>
      <div className={styles.tagRow}>
        {allTags.length === 0 && <span className={styles.tagsHint}>Sin tags aún, agrega uno abajo.</span>}
        {allTags.map((t) => (
          <button key={t} type="button" className={`${styles.tagBtn} ${tagsEs.includes(t) ? styles.tagBtnActive : ''}`} onClick={() => toggleTag(t)}>
            {t}
          </button>
        ))}
      </div>
      {tagsEs.length > 0 && (
        <div className={styles.chips}>
          {tagsEs.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
              <button type="button" onClick={() => toggleTag(t)} aria-label="Quitar">×</button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.addRow}>
        <input
          className={`${styles.input} ${styles.addInput}`}
          placeholder="Nuevo tag + Enter"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        />
        <button type="button" className={styles.tagBtn} onClick={addTag}>Agregar tag</button>
      </div>
      {!editing && (
        <div className={styles.bulkTags}>
          <textarea
            className={`${styles.input} ${styles.bulkInput}`}
            placeholder="Pega tu lista de tags: #TikTok #porno #4K ..."
            value={bulkTags}
            onChange={(e) => setBulkTags(e.target.value)}
            rows={2}
          />
          <button type="button" className={styles.tagBtn} onClick={addAllTags}>Agregar todos los tags</button>
        </div>
      )}
    </>
  );

  const titulosExtrasUI = (
    <>
      <div className={styles.tagsHead}>
        <span className={styles.tagsHint}>Títulos extras — otros idiomas (JA, romaji, EN…)</span>
      </div>
      {titulosExtras.length > 0 && (
        <div className={styles.chips}>
          {titulosExtras.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
              <button type="button" onClick={() => removeTitulo(t)} aria-label="Quitar">×</button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.addRow}>
        <input
          className={`${styles.input} ${styles.addInput}`}
          placeholder="Título extra + Enter"
          value={newTitulo}
          onChange={(e) => setNewTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTitulo(); } }}
        />
        <button type="button" className={styles.tagBtn} onClick={addTitulo}>Agregar título</button>
      </div>
      <div className={styles.bulkTags}>
        <textarea
          className={`${styles.input} ${styles.bulkInput}`}
          placeholder="Pega varios títulos (uno por línea o separados por coma)"
          value={bulkTitulos}
          onChange={(e) => setBulkTitulos(e.target.value)}
          rows={2}
        />
        <button type="button" className={styles.tagBtn} onClick={addAllTitulos}>Agregar todos</button>
      </div>
    </>
  );

  const seriesForm = (
    <form className={styles.form} onSubmit={editing ? saveSerie : createSerie}>
      <div className={styles.editorGrid}>
        <div className={styles.fieldsCol}>
          {editing && (
            <p className={styles.modeTag}>
              <ion-icon name="pricetag-outline" suppressHydrationWarning></ion-icon>
              Editando datos del modo: <strong>{MODOS.find((m) => m.id === modeTab)?.label}</strong>
            </p>
          )}
          <div className={styles.two}>
            <input className={styles.input} placeholder="Título (ES / principal) *" value={form.titulo_es}
              onChange={(e) => setForm({ ...form, titulo_es: e.target.value })} required />
            <input className={styles.input} placeholder="Título alterno (JA)" value={form.titulo_ja}
              onChange={(e) => setForm({ ...form, titulo_ja: e.target.value })} />
          </div>
          {titulosExtrasUI}
          <textarea className={styles.textarea} rows={3} placeholder="Descripción" value={form.desc_es}
            onChange={(e) => setForm({ ...form, desc_es: e.target.value })} />
          {!editing && (
            <textarea className={styles.textarea} rows={2} placeholder="Description EN" value={form.desc_en}
              onChange={(e) => setForm({ ...form, desc_en: e.target.value })} />
          )}
          <input className={styles.input} placeholder="Canal / uploader" value={form.canal}
            onChange={(e) => setForm({ ...form, canal: e.target.value })} />
          {metaFields}
          {tagsUI}
        </div>

        <div className={styles.coverCol}>
          <div className={styles.coverBox}>
            {editing && (editing.cover || editing.thumb)
              ? <img className={styles.coverImg} src={resolveImg(editing.cover || editing.thumb)} alt="" />
              : <span className={styles.coverEmpty}><ion-icon name="image-outline" suppressHydrationWarning></ion-icon></span>}
          </div>
          {editing ? (
            <DropZone accept="image/*" icon="image-outline" label="Arrastra la portada" hint="PNG/JPG · compartida por los 4 modos" onFile={uploadCover} />
          ) : (
            <p className={styles.muted}>Crea la serie y luego sube la portada aquí.</p>
          )}
        </div>
      </div>

      <div className={styles.formActions}>
        <button className={styles.primaryBtn} type="submit" disabled={busy}>
          <ion-icon name={busy ? 'sync-outline' : (editing ? 'save-outline' : 'add-outline')} className={busy ? styles.spin : ''} suppressHydrationWarning></ion-icon>
          {busy ? 'Guardando…' : (editing ? `Guardar «${MODOS.find((m) => m.id === modeTab)?.label}»` : 'Crear serie')}
        </button>
        <button className={styles.ghostBtn} type="button" onClick={newSerie}>Limpiar</button>
      </div>
    </form>
  );

  const episodesSection = editing && (
    <div className={styles.episodes}>
      <h4 className={styles.formTitle}>
        <ion-icon name="albums-outline" suppressHydrationWarning></ion-icon>
        Episodios de «{MODOS.find((m) => m.id === modeTab)?.label}» ({shownEpisodes.length})
      </h4>

      <div className={styles.form}>
        <div className={styles.modeNow}>
          <ion-icon name="pricetag-outline" suppressHydrationWarning></ion-icon>
          Subiendo en: <strong>{MODOS.find((m) => m.id === modeTab)?.label}</strong>
        </div>
        <div className={styles.dropField}>
          <span className={styles.dropLabel}>
            <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
            Videos del episodio <em>(puedes soltar varios de golpe)</em>
          </span>
          <DropZone accept="video/*" multiple onFiles={uploadEpisodes} icon="cloud-upload-outline"
            label="Arrastra uno o varios videos aquí"
            hint={`Se suben en modo ${MODOS.find((m) => m.id === modeTab)?.label} · se numeran solos`} />
        </div>
        <p className={styles.muted}>Cada video crea su episodio (el título se genera solo). Reordénalos arrastrando y usa "Editar" en cada uno para ponerle su miniatura.</p>
        {capBusy && (
          <p className={styles.okMsg}>
            <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>{' '}
            Subiendo{capProg ? ` ${capProg.done}/${capProg.total}` : ''}…
          </p>
        )}
      </div>

      <div className={styles.capsList}>
        {shownEpisodes.length === 0 ? (
          <p className={styles.muted}>
            No hay videos en «{MODOS.find((m) => m.id === modeTab)?.label}». Suelta un video arriba para crear el episodio.
          </p>
        ) : shownEpisodes.map((c, i) => {
          const fuente = (c.fuentes || []).find((f) => f.modo === modeTab);
          return (
            <div key={c.id} className={styles.capRow}>
              <div
                className={`${styles.capItem} ${dragIdx === i ? styles.capDragging : ''}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropEpisode(i)}
                onDragEnd={() => setDragIdx(null)}
              >
                <ion-icon name="reorder-three-outline" className={styles.dragHandle} suppressHydrationWarning></ion-icon>
                <div className={styles.orderCol}>
                  <button className={styles.orderBtn} type="button" onClick={() => moveEpisode(i, -1)} disabled={i === 0} aria-label="Subir">
                    <ion-icon name="chevron-up-outline" suppressHydrationWarning></ion-icon>
                  </button>
                  <span className={styles.orderNum}>{i + 1}</span>
                  <button className={styles.orderBtn} type="button" onClick={() => moveEpisode(i, 1)} disabled={i === shownEpisodes.length - 1} aria-label="Bajar">
                    <ion-icon name="chevron-down-outline" suppressHydrationWarning></ion-icon>
                  </button>
                </div>
                {fuente?.thumb && <img className={styles.capThumb} src={resolveImg(fuente.thumb)} alt="" />}
                <div className={styles.capInfo}>
                  <strong>{c.titulo_es || `Capítulo ${c.numero}`}</strong>
                  <span className={styles.capMeta}>
                    {(fuente?.duracion || '00:00')} · {MODOS.find((m) => m.id === modeTab)?.label}
                  </span>
                </div>
                {fuente && (
                  <button className={styles.editBtn} type="button" onClick={() => setEditFuenteId(editFuenteId === fuente.id ? null : fuente.id)} title="Editar miniatura">
                    <ion-icon name={editFuenteId === fuente.id ? 'close-outline' : 'create-outline'} suppressHydrationWarning></ion-icon>
                    {editFuenteId === fuente.id ? 'Cerrar' : 'Editar'}
                  </button>
                )}
                <button className={styles.dangerBtn} type="button" onClick={() => deleteFuente(fuente.id)} title="Quitar este video del modo">
                  <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                </button>
              </div>
              {fuente && editFuenteId === fuente.id && (
                <div className={styles.capEditor}>
                  <span className={styles.dropLabel}>
                    <ion-icon name="image-outline" suppressHydrationWarning></ion-icon>
                    Miniatura del video
                  </span>
                  <DropZone accept="image/*" onFile={(f) => uploadFuenteThumb(fuente.id, f)} icon="image-outline"
                    label="Arrastra la miniatura" hint="PNG/JPG · se guarda solo" compact />
                  {thumbBusyId === fuente.id && (
                    <p className={styles.okMsg}>
                      <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>{' '}
                      Subiendo miniatura…
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
          Hentai (series y episodios)
        </h2>
        <p className={styles.sub}>4 versiones separadas: Subtitulado ES, Español, Inglés e Inglés subtitulado. Cada una con su título, descripción, tags y videos.</p>
      </header>

      {error && <p className={styles.msgError}>{error}</p>}
      {msg && <p className={styles.okMsg}>{msg}</p>}

      <section className={styles.editorCard} ref={editorRef}>
        <div className={styles.editorHead}>
          <h3 className={styles.formTitle}>
            <ion-icon name={editing ? 'create-outline' : 'add-outline'} suppressHydrationWarning></ion-icon>
            {editing ? `Editando: ${editing.titulo_es || editing.titulo_en}` : 'Nueva serie'}
          </h3>
          {editing && (
            <button className={styles.ghostBtn} type="button" onClick={newSerie}>
              <ion-icon name="add-outline" suppressHydrationWarning></ion-icon>
              Nueva serie
            </button>
          )}
        </div>

        {editing && (
          <div className={styles.modeTabs}>
            {MODOS.map((m) => {
              const count = episodes.filter((c) => (c.fuentes || []).some((f) => f.modo === m.id)).length;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.modeTab} ${modeTab === m.id ? styles.modeTabActive : ''}`}
                  onClick={() => selectMode(m.id)}
                >
                  {m.label}
                  <span className={styles.modeCount}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {episodesSection}
        {seriesForm}
      </section>

      <section className={styles.listCard}>
        <div className={styles.listHead}>
          <div className={styles.tabs}>
            <button type="button" className={`${styles.tab} ${tab === 'series' ? styles.tabActive : ''}`} onClick={() => switchTab('series')}>
              <ion-icon name="images-outline" suppressHydrationWarning></ion-icon>
              Series
            </button>
            <button type="button" className={`${styles.tab} ${tab === 'papelera' ? styles.tabActive : ''}`} onClick={() => switchTab('papelera')}>
              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
              Papelera
            </button>
            <span className={styles.count}>{total}</span>
          </div>
          <div className={styles.listActions}>
            <div className={styles.search}>
              <ion-icon name="search-outline" suppressHydrationWarning></ion-icon>
              <input
                placeholder="Buscar serie..."
                value={q}
                onChange={(e) => { setQ(e.target.value); qRef.current = e.target.value; }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadList(qRef.current, tab, 1); } }}
              />
            </div>
            <button className={styles.ghostBtn} type="button" onClick={() => loadList(qRef.current, tab, page)}>
              <ion-icon name="refresh-outline" suppressHydrationWarning></ion-icon>
              Recargar
            </button>
          </div>
        </div>

        {listLoading && series.length === 0 ? (
          <p className={styles.empty}>Cargando series…</p>
        ) : series.length === 0 ? (
          <p className={styles.empty}>{tab === 'papelera' ? 'La papelera está vacía.' : 'No hay series. Crea la primera arriba.'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Portada</th>
                  <th>Títulos</th>
                  <th>Tipo / Año</th>
                  <th>Episodios</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.id} className={`${styles.row} ${editing?.id === s.id ? styles.rowActive : ''}`}>
                    <td>
                      {s.cover || s.thumb
                        ? <img className={styles.thumb} src={resolveImg(s.cover || s.thumb)} alt="" loading="lazy" />
                        : <div className={styles.thumbEmpty}><ion-icon name="images-outline" suppressHydrationWarning></ion-icon></div>}
                    </td>
                    <td className={styles.titleCell}>
                      <div className={styles.vtitle}>{s.titulo_es || s.titulo_en}</div>
                      <div className={styles.vsub}>{s.canal}</div>
                    </td>
                    <td>{s.tipo || '—'} · {s.anio || '—'}</td>
                    <td>{s.capitulos || 0}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {tab === 'series' ? (
                          <>
                            <button className={styles.act} type="button" onClick={() => editSerie(s.id)}>
                              <ion-icon name="create-outline" suppressHydrationWarning></ion-icon>
                              Editar
                            </button>
                            <button className={`${styles.act} ${styles.danger}`} type="button" onClick={() => trashSerie(s.id)}>
                              <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                              Papelera
                            </button>
                          </>
                        ) : (
                          <button className={styles.act} type="button" onClick={() => restoreSerie(s.id)}>
                            <ion-icon name="arrow-undo-outline" suppressHydrationWarning></ion-icon>
                            Restaurar
                          </button>
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
              <button key={p} type="button" className={`${styles.pageBtn} ${p === page ? styles.pageActive : ''}`} onClick={() => go(p)}>
                {p}
              </button>
            ))}
            <button className={styles.pageBtn} type="button" disabled={page >= totalPages} onClick={() => go(page + 1)} aria-label="Siguiente">
              <ion-icon name="chevron-forward-outline" suppressHydrationWarning></ion-icon>
            </button>
            <span className={styles.pagerInfo}>{total} · pág {page}/{totalPages}</span>
          </div>
        )}
      </section>
    </div>
  );
}
