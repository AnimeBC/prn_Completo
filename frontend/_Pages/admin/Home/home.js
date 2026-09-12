'use client';

import { useEffect, useState } from 'react';
import styles from './home.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AdminHome() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('pkp_admin_token') || sessionStorage.getItem('pkp_admin_token');
    if (!token) return;

    const loadStats = () => {
      fetch(`${API}/api/stats`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStats(d))
        .catch(() => {});
    };
    loadStats();

    const onChange = () => loadStats();
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, []);

  return (
    <section className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h2 className={styles.h2}>Resumen general</h2>
          <p className={styles.sub}>Estado actual de la plataforma en tiempo real</p>
        </div>
        <span className={styles.live}>
          <span className={styles.liveDot} aria-hidden="true" />
          Realtime
        </span>
      </div>

      <div className={styles.grid}>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>{stats?.videos ?? '—'}</p>
          <p className={styles.l}>Videos</p>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="images-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>{stats?.hentai ?? '—'}</p>
          <p className={styles.l}>Hentai</p>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="cube-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>{stats?.packs ?? '—'}</p>
          <p className={styles.l}>Packs</p>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="people-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>{stats?.community ?? '—'}</p>
          <p className={styles.l}>Comunidad</p>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="radio-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>{stats?.lives ?? '—'}</p>
          <p className={styles.l}>Lives</p>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}><ion-icon name="cash-outline" suppressHydrationWarning></ion-icon></span>
          <p className={styles.n}>S/ {stats?.aportes_total ?? '—'}</p>
          <p className={styles.l}>Aportes</p>
        </div>
      </div>

      <div className={styles.noteCard}>
        <ion-icon name="information-circle-outline" className={styles.noteIcon} suppressHydrationWarning></ion-icon>
        <p>Módulos de gestión en construcción. Sistema conectado a PostgreSQL y Redis (realtime).</p>
      </div>
    </section>
  );
}
