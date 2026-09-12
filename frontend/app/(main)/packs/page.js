import { cookies } from 'next/headers';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PacksClient from '@/_Pages/main/Packs/packs.js';
import styles from '@/app/(main)/page.module.css';

export async function generateMetadata() {
  const lang = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'es';
  return {
    title: lang === 'en' ? 'Popular packs' : 'Packs populares',
    description: lang === 'en'
      ? 'Download the most popular packs on pikante pe'
      : 'Descarga los packs más populares de pikante pe',
    alternates: { canonical: '/packs' },
  };
}

export default function PacksPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <PacksClient />
      </div>
    </div>
  );
}
