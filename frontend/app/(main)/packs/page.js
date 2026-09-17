import { cookies } from 'next/headers';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PacksClient from '@/_Pages/main/Packs/packs.js';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export async function generateMetadata() {
  const lang = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'es';
  const title = lang === 'en' ? 'Popular packs' : 'Packs populares';
  const description = lang === 'en'
    ? 'Download the most popular packs on pikante pe'
    : 'Descarga los packs más populares de pikante pe';
  return {
    title,
    description,
    alternates: { canonical: '/packs' },
    openGraph: buildOpenGraph({ title, description, url: '/packs' }),
    twitter: buildTwitter({ title, description }),
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
