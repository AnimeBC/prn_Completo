import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PacksClient from '@/_Pages/main/Packs/packs.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Packs populares',
  description: 'Descarga los packs más populares de pikante pe',
  alternates: { canonical: '/packs' },
};

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
