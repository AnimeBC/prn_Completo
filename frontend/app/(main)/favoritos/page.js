import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Favoritos',
  description: 'Tus videos guardados en pikante pe.',
  alternates: { canonical: '/favoritos' },
  robots: { index: false, follow: false },
};

export default function FavoritosPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <MisVideos title="Favoritos" endpoint="saved" emptyText="Aún no guardas ningún video." />
      </div>
    </div>
  );
}
