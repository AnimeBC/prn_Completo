import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Me gusta',
  description: 'Los videos que te gustaron en pikante pe.',
  alternates: { canonical: '/me-gusta' },
  robots: { index: false, follow: false },
};

export default function MeGustaPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <MisVideos title="Me gusta" endpoint="likes" emptyText="Aún no le diste me gusta a nada." />
      </div>
    </div>
  );
}
