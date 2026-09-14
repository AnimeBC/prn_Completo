import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import TodosVideosClient from '@/_Pages/main/TodosVideos/todosvideos.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Todos los videos',
  description: 'Explora todos los videos de pikante pe sin categorías.',
  alternates: { canonical: '/videos' },
};

// Nunca cachear esta página (se servía un HTML/RSC viejo desde el navegador).
export const dynamic = 'force-dynamic';

export default function VideosPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <TodosVideosClient />
      </div>
    </div>
  );
}
