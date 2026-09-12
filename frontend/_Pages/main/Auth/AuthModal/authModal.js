'use client';

import { useEffect } from 'react';
import styles from './authModal.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const REASONS = {
  like: { es: 'Para votar necesitas iniciar sesión', en: 'Sign in to vote' },
  save: { es: 'Para guardar este video necesitas iniciar sesión', en: 'Sign in to save this video' },
  report: { es: 'Para reportar necesitas iniciar sesión', en: 'Sign in to report' },
  download: { es: 'Para descargar necesitas iniciar sesión', en: 'Sign in to download' },
  default: { es: 'Para interactuar necesitas iniciar sesión', en: 'Sign in to interact' },
};

export default function AuthModal({ open, onClose, reason = 'default' }) {
  const { isDark } = useTheme();
  const { locale } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const es = locale !== 'en';
  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';
  const subtitle = (REASONS[reason] || REASONS.default)[es ? 'es' : 'en'];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Cerrar">
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>

        <img src={logoSrc} alt="PIKANTE PE" className={styles.logo} />

        <h2 className={styles.title}>
          {es ? 'Únete a la comunidad' : 'Join the community'}
        </h2>
        <p className={styles.text}>
          <span className={styles.highlight}>{subtitle}.</span>{' '}
          {es ? 'Crea tu cuenta gratis y disfruta de todo el contenido.' : 'Create your free account and enjoy all the content.'}
        </p>

        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.primary}`} type="button">
            <ion-icon name="log-in-outline" className={styles.btnIcon} suppressHydrationWarning></ion-icon>
            {es ? 'Iniciar sesión' : 'Sign in'}
          </button>
          <button className={`${styles.btn} ${styles.ghost}`} type="button">
            <ion-icon name="person-add-outline" className={styles.btnIcon} suppressHydrationWarning></ion-icon>
            {es ? 'Registrarse' : 'Sign up'}
          </button>
        </div>

        <div className={styles.divider}>{es ? 'o continúa con' : 'or continue with'}</div>

        <button className={styles.google} type="button">
          <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.3l-6.4-5.4C29.3 35 26.8 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.4 5.4C41.9 34.6 44 29.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
          </svg>
          {es ? 'Continuar con Google' : 'Continue with Google'}
        </button>

        <p className={styles.foot}>
          {es ? 'Al continuar aceptas nuestros ' : 'By continuing you accept our '}
          <a href="/contrato.html" target="_blank" rel="noopener">{es ? 'Términos' : 'Terms'}</a>.
        </p>
      </div>
    </div>
  );
}
