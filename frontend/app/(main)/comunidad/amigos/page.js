import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import AmigosClient from '@/_Pages/main/Comunidad/Amigos';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const T = 'Amigos';
const D = 'Tus amigos en pikante pe: búscalos, chatea y descubre personas nuevas.';

export const metadata = {
  title: T,
  description: D,
  alternates: { canonical: '/comunidad/amigos' },
  openGraph: buildOpenGraph({ title: T, description: D, url: '/comunidad/amigos' }),
  twitter: buildTwitter({ title: T, description: D }),
};

export default function AmigosPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <AmigosClient />
      </div>
    </div>
  );
}
