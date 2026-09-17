import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import TodosVideosClient from '@/_Pages/main/TodosVideos/todosvideos.js';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const OG_TITLE = 'Todos los videos';
const OG_DESC = 'Explora todos los videos de pikante pe sin categorías.';

export const metadata = {
  title: OG_TITLE,
  description: OG_DESC,
  alternates: { canonical: '/videos' },
  openGraph: buildOpenGraph({ title: OG_TITLE, description: OG_DESC, url: '/videos' }),
  twitter: buildTwitter({ title: OG_TITLE, description: OG_DESC }),
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
