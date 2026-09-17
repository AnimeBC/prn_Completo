import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import ComunidadClient from '@/_Pages/main/Comunidad/comunidad.js';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export const metadata = {
  title: 'Comunidad',
  description: 'Videos subidos por usuarios reales de la comunidad pikante pe',
  alternates: { canonical: '/comunidad' },
  openGraph: buildOpenGraph({ title: 'Comunidad', description: 'Videos subidos por usuarios reales de la comunidad pikante pe', url: '/comunidad' }),
  twitter: buildTwitter({ title: 'Comunidad', description: 'Videos subidos por usuarios reales de la comunidad pikante pe' }),
};

export default function ComunidadPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <ComunidadClient />
      </div>
    </div>
  );
}
