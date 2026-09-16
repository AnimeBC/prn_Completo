'use client';

import { useEffect, useState } from 'react';
import styles from './reportar.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL } from '@/_Extras/Api/api.js';
import { reportVideo } from '@/_Extras/Interacciones/interactions.js';

const FALLBACK = [
  { slug: 'spam', nombre: 'Spam o publicidad' },
  { slug: 'menores', nombre: 'Contenido con menores de edad' },
  { slug: 'violencia', nombre: 'Violencia o agresión' },
  { slug: 'derechos', nombre: 'Derechos de autor' },
  { slug: 'contenido_ilegal', nombre: 'Contenido ilegal' },
  { slug: 'otro', nombre: 'Otro motivo' },
];

export default function ReportModal({ open, onClose, videoId, onReported, submitFn = null, title = null }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  const [motivos, setMotivos] = useState(FALLBACK);
  const [motivo, setMotivo] = useState('spam');
  const [detalle, setDetalle] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setError('');
    setDetalle('');
    setMotivo('spam');
    let alive = true;
    fetch(`${API_URL}/api/report-motivos`)
      .then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data) && j.data.length) setMotivos(j.data); })
      .catch(() => { /* usa el fallback */ });

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { alive = false; document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    const d = submitFn ? await submitFn(motivo, detalle) : await reportVideo(videoId, motivo, detalle);
    setSending(false);
    if (!d) {
      setError(es ? 'No se pudo enviar el reporte. Intenta de nuevo.' : 'Could not send the report.');
      return;
    }
    setDone(true);
    if (onReported) onReported();
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Cerrar">
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>

        {done ? (
          <div className={styles.done}>
            <span className={styles.doneIcon}>
              <ion-icon name="checkmark" suppressHydrationWarning></ion-icon>
            </span>
            <h3 className={styles.doneTitle}>{es ? 'Reporte enviado' : 'Report sent'}</h3>
            <p className={styles.doneText}>
              {es ? 'Gracias, revisaremos este contenido lo antes posible.' : 'Thanks, we will review this content soon.'}
            </p>
            <button className={styles.primary} type="button" onClick={onClose}>
              {es ? 'Entendido' : 'Got it'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className={styles.head}>
              <span className={styles.headIcon}>
                <ion-icon name="flag-outline" suppressHydrationWarning></ion-icon>
              </span>
              <div>
                <h3 className={styles.title}>{title || (es ? 'Reportar video' : 'Report video')}</h3>
                <p className={styles.sub}>{es ? 'Elige el motivo y lo revisamos.' : 'Pick a reason and we will review it.'}</p>
              </div>
            </div>

            <div className={styles.reasons} role="radiogroup" aria-label={es ? 'Motivo' : 'Reason'}>
              {motivos.map((m) => {
                const active = motivo === m.slug;
                return (
                  <button
                    key={m.slug}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.reason} ${active ? styles.reasonActive : ''}`}
                    onClick={() => setMotivo(m.slug)}
                  >
                    <span className={`${styles.radio} ${active ? styles.radioOn : ''}`}>
                      {active && <span className={styles.radioDot} />}
                    </span>
                    <span className={styles.reasonText}>{m.nombre}</span>
                    {active && (
                      <ion-icon name="checkmark" className={styles.check} suppressHydrationWarning></ion-icon>
                    )}
                  </button>
                );
              })}
            </div>

            <label className={styles.fieldLabel}>{es ? 'Detalles (opcional)' : 'Details (optional)'}</label>
            <textarea
              className={styles.textarea}
              maxLength={1000}
              rows={3}
              placeholder={es ? 'Cuéntanos un poco más…' : 'Tell us a bit more…'}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button className={styles.ghost} type="button" onClick={onClose}>
                {es ? 'Cancelar' : 'Cancel'}
              </button>
              <button className={styles.primary} type="submit" disabled={sending}>
                <ion-icon name={sending ? 'sync-outline' : 'paper-plane-outline'} suppressHydrationWarning></ion-icon>
                {sending ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Enviar reporte' : 'Send report')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
