'use client';
import { useEffect, useState } from 'react';
import styles from './AgeGate.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const KEY = 'pikante_age_verified';

export default function AgeGate(){
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(()=>{
    setMounted(true);
    try{
      const v = localStorage.getItem(KEY);
      if(v !== '1') setOpen(true);
    }catch{ setOpen(true); }
  },[]);

  useEffect(()=>{
    if(!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return ()=>{ document.body.style.overflow = prev; };
  },[open]);

  if(!mounted || !open) return null;

  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';

  function confirm(){
    try{ localStorage.setItem(KEY, '1'); }catch{}
    setOpen(false);
  }
  function deny(){
    window.location.href = 'https://www.google.com';
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Verificación de edad">
      <div className={styles.card}>
        <span className={styles.topAccent} aria-hidden="true" />
        <span className={styles.grid} aria-hidden="true" />

        <div className={styles.head}>
          <div className={styles.logoWrap}>
            <span className={styles.logoGlow} aria-hidden="true" />
            <img src={logoSrc} alt="PIKANTE PE" className={styles.logo} />
          </div>
          <h2 className={styles.title}>{t('ageGate.titulo')}</h2>
        </div>

        <div className={styles.body}>
          <p className={styles.text}>{t('ageGate.texto')}</p>

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.ghost}`} type="button" onClick={deny}>
              <ion-icon name="close-circle-outline" className={styles.btnIcon} suppressHydrationWarning></ion-icon>
              {t('ageGate.no')}
            </button>
            <button className={`${styles.btn} ${styles.primary}`} type="button" onClick={confirm} autoFocus>
              <ion-icon name="shield-checkmark-outline" className={styles.btnIcon} suppressHydrationWarning></ion-icon>
              {t('ageGate.si')}
            </button>
          </div>

          <p className={styles.foot}>
            <ion-icon name="lock-closed-outline" className={styles.footIcon} suppressHydrationWarning></ion-icon>
            {t('ageGate.foot')}
          </p>
        </div>
      </div>
    </div>
  );
}
