import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import HentaiClient from '@/_Pages/main/Hentai/hentai.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Hentai',
  description: 'Todos los animes hentai de pikante pe',
  alternates: { canonical: '/hentai' },
};

export default function HentaiPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <HentaiClient />
      </div>
    </div>
  );
}
