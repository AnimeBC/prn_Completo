'use client';

import { useEffect } from 'react';
import styles from './restringido.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Restringido({ open, onClose, onVerPlanes, limiteMb = 200 }) {
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
        <span className={styles.icon}><ion-icon name="lock-closed-outline" suppressHydrationWarning></ion-icon></span>
        <h3 className={styles.title}>{es ? 'Subida restringida' : 'Upload restricted'}</h3>
        <p className={styles.text}>
          {es
            ? `Tu cuenta permite archivos de hasta ${limiteMb} MB. El archivo es más grande, así que no se envió.`
            : `Your account allows files up to ${limiteMb} MB. This file is bigger, so it was not sent.`}
        </p>
        <p className={styles.sub}>
          {es ? 'Mejora tu plan para subir archivos más grandes.' : 'Upgrade your plan to upload bigger files.'}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>{es ? 'Entendido' : 'Got it'}</button>
          <button type="button" className={styles.primary} onClick={() => { onClose(); if (onVerPlanes) onVerPlanes(); }}>
            <ion-icon name="diamond-outline" suppressHydrationWarning></ion-icon>
            {es ? 'Ver planes' : 'See plans'}
          </button>
        </div>
      </div>
    </div>
  );
}
