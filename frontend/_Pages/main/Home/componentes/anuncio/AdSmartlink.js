'use client';

import styles from './anuncio.module.css';

export default function AdSmartlink({ href, title = 'Contenido recomendado', text = 'Descubre más aquí' }) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>ANUNCIO</span>
      <a
        className={styles.smartLink}
        href={href}
        target="_blank"
        rel="sponsored nofollow noopener"
      >
        <ion-icon name="flame-outline" className={styles.smartIcon} suppressHydrationWarning></ion-icon>
        <span className={styles.smartTexts}>
          <span className={styles.smartTitle}>{title}</span>
          <span className={styles.smartText}>{text}</span>
        </span>
        <ion-icon name="arrow-forward-outline" className={styles.smartArrow} suppressHydrationWarning></ion-icon>
      </a>
    </div>
  );
}
