'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './redes.module.css';
import { API_URL, authHeaders } from '@/_Extras/Api/api.js';

const ICONOS = [
  'megaphone-outline', 'notifications-outline', 'sparkles-outline', 'gift-outline',
  'star-outline', 'flame-outline', 'heart-outline', 'rocket-outline',
  'information-circle-outline', 'alert-circle-outline', 'videocam-outline', 'pricetag-outline',
];

function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + new Date(dateStr).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminRedes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ titulo: '', texto: '', url: '', icono: 'megaphone-outline' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/notificaciones/admin`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      setItems(j.data || []);
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function crear(e) {
    e.preventDefault();
    setMsg(''); setError('');
    if (!form.titulo.trim()) { setError('El título es obligatorio.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/notificaciones/admin`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'No se pudo publicar'); return; }
      setMsg('Notificación publicada. Todos los usuarios e invitados la verán.');
      setForm({ titulo: '', texto: '', url: '', icono: form.icono });
      load();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setSaving(false);
    }
  }

  async function borrar(id) {
    setMsg(''); setError('');
    try {
      const r = await fetch(`${API_URL}/api/notificaciones/admin/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) { setError('No se pudo eliminar'); return; }
      setItems((cur) => cur.filter((x) => x.id !== id));
      setMsg('Notificación eliminada.');
    } catch {
      setError('No hay conexión con el servidor.');
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>Notificaciones</h2>
        <p className={styles.sub}>
          Publica avisos oficiales. Los usuarios con cuenta verán además sus solicitudes, etiquetas,
          likes y reacciones; los invitados verán solo estos avisos del administrador.
        </p>
      </div>

      <form className={styles.panel} onSubmit={crear}>
        <h3 className={styles.panelTitle}>Nueva notificación</h3>

        <label className={styles.label}>Título</label>
        <input
          className={styles.input}
          value={form.titulo}
          maxLength={160}
          placeholder="Ej: ¡Nuevo pack disponible!"
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
        />

        <label className={styles.label}>Texto (opcional)</label>
        <textarea
          className={styles.textarea}
          value={form.texto}
          maxLength={500}
          rows={3}
          placeholder="Detalle corto del aviso"
          onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
        />

        <label className={styles.label}>Enlace (opcional)</label>
        <input
          className={styles.input}
          value={form.url}
          maxLength={300}
          placeholder="/videos, /packs, https://..."
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
        />

        <label className={styles.label}>Ícono</label>
        <div className={styles.icons}>
          {ICONOS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={`${styles.iconBtn} ${form.icono === ic ? styles.iconActive : ''}`}
              onClick={() => setForm((f) => ({ ...f, icono: ic }))}
              title={ic}
            >
              <ion-icon name={ic} suppressHydrationWarning></ion-icon>
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {msg && <p className={styles.ok}>{msg}</p>}

        <button className={styles.primary} type="submit" disabled={saving}>
          <ion-icon name={saving ? 'sync-outline' : 'paper-plane-outline'} suppressHydrationWarning></ion-icon>
          {saving ? 'Publicando…' : 'Publicar aviso'}
        </button>
      </form>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Avisos publicados ({items.length})</h3>
        {loading ? (
          <p className={styles.muted}>Cargando…</p>
        ) : items.length === 0 ? (
          <p className={styles.muted}>Todavía no has publicado avisos.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((n) => (
              <li key={n.id} className={styles.row}>
                <span className={styles.rowIcon}>
                  <ion-icon name={n.icono || 'megaphone-outline'} suppressHydrationWarning></ion-icon>
                </span>
                <div className={styles.rowBody}>
                  <strong className={styles.rowTitle}>{n.titulo}</strong>
                  {n.texto && <span className={styles.rowText}>{n.texto}</span>}
                  <span className={styles.rowMeta}>
                    {fmt(n.created_at)}{n.url ? ` · ${n.url}` : ''}
                  </span>
                </div>
                <button className={styles.danger} type="button" onClick={() => borrar(n.id)} title="Eliminar">
                  <ion-icon name="trash-outline" suppressHydrationWarning></ion-icon>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
