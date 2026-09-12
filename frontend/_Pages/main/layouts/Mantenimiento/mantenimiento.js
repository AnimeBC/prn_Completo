'use client';

import { useEffect } from 'react';
import styles from './mantenimiento.module.css';
import { useSidebar } from '@/app/sidebarContext.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function MantenimientoModal() {
  const { maintOpen, closeMaint } = useSidebar();
  const { t } = useLanguage();

  useEffect(() => {
    if (!maintOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') closeMaint();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maintOpen, closeMaint]);

  if (!maintOpen) return null;

  return (
    <div className={styles.overlay} onClick={closeMaint}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={t('mantenimiento.titulo')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.iconWrap}>
          <ion-icon name="construct-outline" className={styles.icon} suppressHydrationWarning></ion-icon>
        </div>
        <h3 className={styles.title}>{t('mantenimiento.titulo')}</h3>
        <p className={styles.text}>
          {t('mantenimiento.texto')}
        </p>
        <button className={styles.btn} type="button" onClick={closeMaint}>
          {t('mantenimiento.entendido')}
        </button>
      </div>
    </div>
  );
}
