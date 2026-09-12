'use client';

import styles from './anuncio.module.css';

export default function Anuncio({ formato = 'Leaderboard 728x90', id = 'adsterra-slot', alto = false }) {
  return (
    <div className={styles.wrapper} data-ad-slot={id}>
      <span className={styles.label}>ANUNCIO</span>
      <div className={`${styles.box} ${alto ? styles.boxAlto : ''}`}>
        <ion-icon name="megaphone-outline" className={styles.icon} suppressHydrationWarning></ion-icon>
        <p className={styles.text}>Espacio publicitario {formato}</p>
        <span className={styles.sub}>Adsterra • se reemplaza con el script real</span>
      </div>
    </div>
  );
}
