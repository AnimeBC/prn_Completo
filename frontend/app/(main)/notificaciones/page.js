import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import NotificacionesPage from '@/_Pages/main/Notificaciones/NotificacionesPage.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Notificaciones',
  description: 'Tus notificaciones en pikante pe',
  alternates: { canonical: '/notificaciones' },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <NotificacionesPage />
      </div>
    </div>
  );
}
