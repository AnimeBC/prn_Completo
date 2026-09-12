'use client';

import { useEffect, useState } from 'react';
import styles from './descarga.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function DescargaModal({ open, onClose, paso1, paso2, directo, titulo = 'Descargar' }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.dlOverlay} onClick={onClose}>
      <div
        className={styles.dlCard}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dlHead}>
          <h3 className={styles.dlTitle}>{titulo}</h3>
          <button className={styles.dlClose} type="button" aria-label="Close" onClick={onClose}>
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
            <a
              className={styles.dlStepBtn}
              href={step >= 3 ? directo : undefined}
              target="_blank"
              rel="nofollow noopener"
              aria-disabled={step < 3}
              onClick={(e) => {
                if (step < 3) e.preventDefault();
              }}
              style={step < 3 ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            >
              <ion-icon name="download-outline" className={styles.dlCheck} suppressHydrationWarning></ion-icon>
              {t('descarga.descargarArchivo')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
