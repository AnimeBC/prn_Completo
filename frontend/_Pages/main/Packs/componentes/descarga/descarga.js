'use client';

import { useEffect, useState } from 'react';
import styles from './descarga.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

function fmtBytes(b) {
  const n = Number(b) || 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 ** 3)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 ** 2)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export default function DescargaModal({
  open,
  onClose,
  paso1,
  paso2,
  directo,
  titulo,
  onDownload,
  downloadFile = false,
  downloadName = '',
}) {
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const tituloDl = titulo || t('descarga.titulo');
  const [step, setStep] = useState(1);

  // ¿El destino es un archivo descargable (videos) o una página (packs)?
  const isFile = downloadFile || /\/api\/|\/media\//.test(String(directo || ''));

  const [status, setStatus] = useState('idle'); // idle | downloading | done | error
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (open) {
      setStep(1);
      setStatus('idle');
      setProgress(0);
      setLoaded(0);
      setTotal(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleDownload() {
    if (step < 3 || status === 'downloading') return;
    if (onDownload) onDownload();
    if (!directo || directo === '#') {
      setStatus('error');
      return;
    }

    setStatus('downloading');
    setProgress(0);
    setLoaded(0);
    setTotal(0);

    const started = Date.now();
    try {
      const res = await fetch(directo);
      if (!res.ok) throw new Error('http');
      const size = Number(res.headers.get('content-length')) || 0;
      setTotal(size);

      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        setLoaded(got);
        setProgress(size ? Math.round((got / size) * 100) : 0);
      }

      // deja ver la barra aunque el archivo sea pequeño/rápido
      const elapsed = Date.now() - started;
      if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));

      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName || String(directo).split('?')[0].split('/').pop() || 'archivo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (!open) return null;

  return (
    <div className={styles.dlOverlay} onClick={onClose}>
      <div
        className={styles.dlCard}
        role="dialog"
        aria-modal="true"
        aria-label={tituloDl}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dlHead}>
          <h3 className={styles.dlTitle}>{tituloDl}</h3>
          <button className={styles.dlClose} type="button" aria-label={t('descarga.cerrar')} onClick={onClose}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>

        <div className={`${styles.dlStep} ${step > 1 ? styles.dlStepDone : ''}`}>
          <span className={styles.dlNum}>{step > 1 ? <ion-icon name="checkmark-sharp" suppressHydrationWarning></ion-icon> : '1'}</span>
          <div className={styles.dlStepBody}>
            <p className={styles.dlStepTitle}>{t('descarga.paso1t')}</p>
            <p className={styles.dlStepText}>{t('descarga.paso1d')}</p>
            <p className={styles.dlHint}>
              <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
              {t('descarga.hint1')}
            </p>
            <a
              className={styles.dlStepBtn}
              href={paso1}
              target="_blank"
              rel="sponsored nofollow noopener"
              onClick={() => setStep((s) => Math.max(s, 2))}
            >
              {t('descarga.abrir1')}
              <ion-icon name="open-outline" className={styles.dlCheck} suppressHydrationWarning></ion-icon>
            </a>
          </div>
        </div>

        <div className={`${styles.dlStep} ${step < 2 ? styles.dlStepLocked : ''} ${step > 2 ? styles.dlStepDone : ''}`}>
          <span className={styles.dlNum}>{step > 2 ? <ion-icon name="checkmark-sharp" suppressHydrationWarning></ion-icon> : '2'}</span>
          <div className={styles.dlStepBody}>
            <p className={styles.dlStepTitle}>{t('descarga.paso2t')}</p>
            <p className={styles.dlStepText}>{t('descarga.paso2d')}</p>
            <p className={styles.dlHint}>
              <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
              {t('descarga.hint2')}
            </p>
            <a
              className={styles.dlStepBtn}
              href={step >= 2 ? paso2 : undefined}
              target="_blank"
              rel="sponsored nofollow noopener"
              aria-disabled={step < 2}
              onClick={(e) => {
                if (step < 2) {
                  e.preventDefault();
                  return;
                }
                setStep(3);
              }}
              style={step < 2 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            >
              {t('descarga.abrir2')}
              <ion-icon name="open-outline" className={styles.dlCheck} suppressHydrationWarning></ion-icon>
            </a>
          </div>
        </div>

        <div className={`${styles.dlStep} ${step < 3 ? styles.dlStepLocked : ''} ${styles.dlStepDone}`}>
          <span className={styles.dlNum}>{step >= 3 ? <ion-icon name="checkmark-sharp" suppressHydrationWarning></ion-icon> : '3'}</span>
          <div className={styles.dlStepBody}>
            <p className={styles.dlStepTitle}>{t('descarga.paso3t')}</p>
            <p className={styles.dlStepText}>{t('descarga.paso3d')}</p>

            {isFile ? (
              <>
                <button
                  className={styles.dlStepBtn}
                  type="button"
                  disabled={step < 3 || status === 'downloading'}
                  onClick={handleDownload}
                  style={step < 3 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                >
                  <ion-icon
                    name={status === 'downloading' ? 'sync-outline' : 'download-outline'}
                    className={styles.dlCheck}
                    suppressHydrationWarning
                  ></ion-icon>
                  {status === 'downloading'
                    ? (es ? 'Descargando…' : 'Downloading…')
                    : t('descarga.descargarArchivo')}
                </button>

                {status !== 'idle' && (
                  <div className={styles.dlProgressWrap}>
                    <div className={styles.dlProgress}>
                      <div className={styles.dlProgressFill} style={{ width: `${progress}%` }} />
                    </div>
                    <span className={styles.dlProgressText}>
                      {status === 'downloading' && (
                        `${progress}%${total ? ` · ${fmtBytes(loaded)} / ${fmtBytes(total)}` : (loaded ? ` · ${fmtBytes(loaded)}` : '')}`
                      )}
                      {status === 'done' && (
                        <>
                          <ion-icon name="checkmark-circle" className={styles.dlProgressOk} suppressHydrationWarning></ion-icon>
                          {es ? 'Descarga completa' : 'Download complete'}
                        </>
                      )}
                      {status === 'error' && (es ? 'Error al descargar. Intenta de nuevo.' : 'Download error. Try again.')}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <a
                className={styles.dlStepBtn}
                href={step >= 3 ? directo : undefined}
                target="_blank"
                rel="nofollow noopener"
                aria-disabled={step < 3}
                onClick={(e) => {
                  if (step < 3) {
                    e.preventDefault();
                    return;
                  }
                  if (onDownload) onDownload();
                }}
                style={step < 3 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
              >
                <ion-icon name="download-outline" className={styles.dlCheck} suppressHydrationWarning></ion-icon>
                {t('descarga.descargarArchivo')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
