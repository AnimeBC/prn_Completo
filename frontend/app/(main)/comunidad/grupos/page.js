import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import GruposClient from '@/_Pages/main/Comunidad/Grupos';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Comunidades',
  description: 'Todas las comunidades de pikante pe: grupos públicos y privados.',
  alternates: { canonical: '/comunidad/grupos' },
};

export default function GruposPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <GruposClient />
      </div>
    </div>
  );
}
