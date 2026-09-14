'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './miperfil.module.css';
import { API_URL, mediaUrl, authHeaders } from '@/_Extras/Api/api.js';
import ImageCropModal from '@/_Extras/Imagen/ImageCropModal.js';

const API = API_URL;

function resolveImg(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/media/')) return mediaUrl(p);
  return p;
}

function parsePos(s, fallback = 50) {
  const m = String(s || '').match(/(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%/);
  if (!m) return { x: fallback, y: fallback };
  return { x: Math.max(0, Math.min(100, parseFloat(m[1]))), y: Math.max(0, Math.min(100, parseFloat(m[2]))) };
}

const fmtPos = (p) => `${Math.round(p.x)}% ${Math.round(p.y)}%`;

export default function MiPerfil() {
  const [channel, setChannel] = useState(null);
  const [form, setForm] = useState({ descripcion: '', pais: '' });
  const [bannerPos, setBannerPos] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerDrag, setBannerDrag] = useState(false);

  const avatarFileRef = useRef(null);
  const bannerFileRef = useRef(null);
  const bannerElRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/channels/mine`, { headers: authHeaders() });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setError(j.error || 'No se pudo cargar tu perfil'); return; }
        setChannel(j.channel);
        setForm({ descripcion: j.channel?.descripcion || '', pais: j.channel?.pais || '' });
        setBannerPos(parsePos(j.channel?.banner_pos));
      } catch {
        setError('No hay conexión con el servidor.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function uploadAvatar(blob) {
    if (!blob) return;
    setAvatarBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      const r = await fetch(`${API}/api/channels/mine/avatar`, { method: 'POST', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir el avatar'); return; }
      setChannel((c) => ({ ...c, avatar: j.avatar }));
      setMsg('Foto guardada.');
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setAvatarBusy(false); }
  }

  async function uploadBanner(file) {
    if (!file) return;
    if (!(file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif)$/i.test(file.name || ''))) {
      setError('Solo imágenes (JPG/PNG/WebP).'); return;
    }
    if (file.size > 8 * 1024 * 1024) { setError('La portada no debe pasar de 8 MB.'); return; }
    setBannerBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('banner', file);
      const r = await fetch(`${API}/api/channels/mine/banner`, { method: 'POST', headers: authHeaders(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo subir la portada'); return; }
      setChannel((c) => ({ ...c, banner: j.banner }));
      setBannerPos({ x: 50, y: 50 });
      setMsg('Portada guardada. Arrástrala para encuadrarla.');
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setBannerBusy(false); }
  }

  function startDrag(e) {
    const el = bannerElRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: bannerPos.x, baseY: bannerPos.y, w: rect.width, h: rect.height };
    setDragging(true);
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function moveDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.w) * 100;
    const dy = ((e.clientY - d.startY) / d.h) * 100;
    setBannerPos({ x: Math.max(0, Math.min(100, d.baseX - dx)), y: Math.max(0, Math.min(100, d.baseY - dy)) });
  }
  function endDrag(e) {
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* noop */ }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      const r = await fetch(`${API}/api/channels/mine`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          descripcion: form.descripcion,
          pais: form.pais,
          banner_pos: fmtPos(bannerPos),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo guardar'); return; }
      setChannel(j.channel);
      setMsg('Perfil actualizado.');
    } catch { setError('No hay conexión con el servidor.'); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loading}>
          <ion-icon name="sync-outline" className={styles.spin} suppressHydrationWarning></ion-icon>
          Cargando perfil...
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>
          <ion-icon name="alert-circle-outline" suppressHydrationWarning></ion-icon>
          <p>{error || 'No tienes un canal asignado.'}</p>
        </div>
      </div>
    );
  }

  const avatar = resolveImg(channel.avatar);
  const banner = resolveImg(channel.banner);
  const initial = String(channel.nombre || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <ion-icon name="person-circle-outline" suppressHydrationWarning></ion-icon>
            Mi perfil de canal
          </h2>
          <p className={styles.sub}>Tu foto se ajusta en un recuadro y la portada se arrastra para encuadrarla. Todo se guarda en media_completa.</p>
        </div>
        <a className={styles.viewBtn} href={`/canal/${channel.slug}`} target="_blank" rel="noopener">
          <ion-icon name="eye-outline" suppressHydrationWarning></ion-icon>
          Ver perfil público
        </a>
      </header>

      <input
        ref={bannerFileRef}
        type="file"
        accept="image/*"
        className={styles.hidden}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadBanner(f); }}
      />

      <ImageCropModal
        open={!!cropFile}
        file={cropFile}
        shape="circle"
        title="Ajusta la foto del canal"
        subtitle="Arrastra y usa el zoom para encuadrarla."
        onCancel={() => setCropFile(null)}
        onSave={(blob) => { setCropFile(null); uploadAvatar(blob); }}
      />

      {/* Portada */}
      <div
        ref={bannerElRef}
        className={`${styles.banner} ${dragging ? styles.grabbing : ''} ${bannerDrag ? styles.dragOn : ''}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragOver={(e) => { e.preventDefault(); setBannerDrag(true); }}
        onDragEnter={(e) => { e.preventDefault(); setBannerDrag(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setBannerDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setBannerDrag(false); uploadBanner(e.dataTransfer?.files?.[0]); }}
        style={{
          ...(banner ? { backgroundImage: `url(${banner})` } : {}),
          backgroundPosition: fmtPos(bannerPos),
        }}
      >
        <span className={styles.bannerShade} />
        <button
          type="button"
          className={styles.bannerBtn}
          onClick={(e) => { e.stopPropagation(); bannerFileRef.current?.click(); }}
        >
          <ion-icon name={bannerBusy ? 'sync-outline' : 'image-outline'} className={bannerBusy ? styles.spin : ''} suppressHydrationWarning></ion-icon>
          {bannerBusy ? 'Subiendo…' : (banner ? 'Cambiar portada' : 'Subir portada')}
        </button>
      </div>

      {/* Avatar + datos */}
      <div className={styles.headRow}>
        <div className={styles.avatarCol}>
          <div className={styles.avatarWrap}>
            {avatar
              ? <img className={styles.avatar} src={avatar} alt="" draggable={false} />
              : <span className={styles.avatarInitial}>{initial}</span>}
          </div>
          <button type="button" className={styles.avatarBtn} onClick={() => avatarFileRef.current?.click()}>
            <ion-icon name={avatarBusy ? 'sync-outline' : 'camera-outline'} className={avatarBusy ? styles.spin : ''} suppressHydrationWarning></ion-icon>
            {avatarBusy ? 'Subiendo…' : 'Cambiar foto'}
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className={styles.hidden}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropFile(f); }}
          />
        </div>

        <div className={styles.identity}>
          <label className={styles.field}>
            <span className={styles.label}>Nombre del canal</span>
            <input className={styles.input} value={channel.nombre} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Usuario</span>
            <input className={styles.input} value={`@${channel.slug}`} readOnly />
          </label>
        </div>
      </div>

      <form className={styles.form} onSubmit={save}>
        <label className={styles.field}>
          <span className={styles.label}>Descripción / bio</span>
          <textarea
            className={styles.textarea}
            maxLength={2000}
            rows={4}
            placeholder="Cuenta a tus seguidores quién eres y qué subes..."
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />
        </label>

        <div className={styles.twoCols}>
          <label className={styles.field}>
            <span className={styles.label}>País / ubicación</span>
            <input
              className={styles.input}
              maxLength={80}
              placeholder="Ej: Perú"
              value={form.pais}
              onChange={(e) => setForm({ ...form, pais: e.target.value })}
            />
          </label>
          <div className={styles.statsInline}>
            <div className={styles.stat}><span>{Number(channel.seguidores || 0).toLocaleString('es-PE')}</span><small>Suscriptores</small></div>
            <div className={styles.stat}><span>{Number(channel.videos || 0).toLocaleString('es-PE')}</span><small>Videos</small></div>
            <div className={styles.stat}><span>{Number(channel.vistas || 0).toLocaleString('es-PE')}</span><small>Vistas</small></div>
          </div>
        </div>

        {error && <p className={styles.msgError}>{error}</p>}
        {msg && <p className={styles.okMsg}>{msg}</p>}

        <button className={styles.saveBtn} type="submit" disabled={saving}>
          <ion-icon name={saving ? 'sync-outline' : 'save-outline'} className={saving ? styles.spin : ''} suppressHydrationWarning></ion-icon>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
