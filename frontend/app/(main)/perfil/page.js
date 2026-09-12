import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PerfilClient from '@/_Pages/main/Perfil/perfil.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Mi Perfil',
  description:
    'Administra tu perfil, tus videos guardados, tus me gusta y tus suscripciones en pikante pe.',
  alternates: { canonical: '/perfil' },
  robots: { index: false, follow: false },
};

export default function PerfilPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <PerfilClient />
      </div>
    </div>
  );
}
