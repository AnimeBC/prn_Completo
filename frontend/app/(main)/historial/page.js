import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Historial',
  description: 'Los videos que has visto en pikante pe.',
  alternates: { canonical: '/historial' },
  robots: { index: false, follow: false },
};

export default function HistorialPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <MisVideos title="Historial" endpoint="history" emptyText="Todavía no has visto ningún video." />
      </div>
    </div>
  );
}
