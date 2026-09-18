'use client';

import { useEffect } from 'react';
import styles from './mantenimiento.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Mantenimiento({ open, onClose }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        <span className={styles.icon}><ion-icon name="construct-outline" suppressHydrationWarning></ion-icon></span>
        <h3 className={styles.title}>{es ? 'Grupos en mantenimiento' : 'Groups under maintenance'}</h3>
        <p className={styles.text}>
          {es ? 'Estamos mejorando los grupos. Vuelve pronto.' : 'We are improving groups. Come back soon.'}
        </p>
        <button type="button" className={styles.btn} onClick={onClose}>{es ? 'Entendido' : 'Got it'}</button>
      </div>
    </div>
  );
}
