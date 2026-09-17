import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import FetichesClient from '@/_Pages/main/Fetiches/fetiches.js';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export const metadata = {
  title: 'Fetiches',
  description: 'Explora videos por fetiche en pikante pe',
  alternates: { canonical: '/fetiches' },
  openGraph: buildOpenGraph({ title: 'Fetiches', description: 'Explora videos por fetiche en pikante pe', url: '/fetiches' }),
  twitter: buildTwitter({ title: 'Fetiches', description: 'Explora videos por fetiche en pikante pe' }),
};

export default function FetichesPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <FetichesClient />
      </div>
    </div>
  );
}
