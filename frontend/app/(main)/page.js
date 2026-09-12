import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import HomeClient from '@/_Pages/main/Home/home.js';
import styles from './page.module.css';

export const metadata = {
  title: 'Inicio',
  description:
    'Bienvenido a pikante pe: tendencias, packs populares, comunidad y lives en directo.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return (
    <div className={styles.layout}>
      <div className={styles.pageBg} aria-hidden="true">
        <svg className={`${styles.waves} ${styles.wavesTop}`} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveGradTop" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#E11D48" stopOpacity="0" />
              <stop offset="0.3" stopColor="#E11D48" stopOpacity="0.18" />
              <stop offset="0.6" stopColor="#E11D48" stopOpacity="0.45" />
              <stop offset="1" stopColor="#F20D16" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#waveGradTop)" strokeWidth="1">
            <path d="M0,100 C180,160 360,40 540,100 S900,160 1080,100 S1350,40 1440,80" opacity="0.4" />
            <path d="M0,75 C200,135 380,15 560,75 S920,135 1100,75 S1360,15 1440,55" opacity="0.28" />
            <path d="M0,50 C220,110 400,-10 580,50 S940,110 1120,50 S1370,-10 1440,30" opacity="0.18" />
          </g>
        </svg>
        <svg className={`${styles.waves} ${styles.wavesBottom}`} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#F20D16" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#E11D48" stopOpacity="0.55" />
              <stop offset="0.75" stopColor="#E11D48" stopOpacity="0.2" />
              <stop offset="1" stopColor="#E11D48" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#waveGrad)" strokeWidth="1">
            <path d="M0,200 C180,140 360,260 540,200 S900,140 1080,200 S1350,260 1440,220" opacity="0.55" />
            <path d="M0,225 C200,165 380,285 560,225 S920,165 1100,225 S1360,285 1440,245" opacity="0.38" />
            <path d="M0,250 C220,190 400,310 580,250 S940,190 1120,250 S1370,310 1440,270" opacity="0.26" />
            <path d="M0,275 C240,215 420,320 600,275 S960,215 1140,275 S1380,320 1440,295" opacity="0.16" />
            <path d="M0,175 C160,120 340,230 520,175 S880,120 1060,175 S1340,230 1440,195" opacity="0.3" />
          </g>
        </svg>
      </div>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <HomeClient />
      </div>
    </div>
  );
}
