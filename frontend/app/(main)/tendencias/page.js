import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import TendenciasClient from '@/_Pages/main/Tendencias/tendencias.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Tendencias',
  description: 'Lo más visto de la plataforma: ranking de tendencias en pikante pe',
  alternates: { canonical: '/tendencias' },
};

export default function TendenciasPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <TendenciasClient />
      </div>
    </div>
  );
}
