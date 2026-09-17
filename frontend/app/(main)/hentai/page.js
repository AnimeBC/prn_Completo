import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import HentaiClient from '@/_Pages/main/Hentai/hentai.js';
import styles from '@/app/(main)/page.module.css';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const OG_TITLE = 'Hentai';
const OG_DESC = 'Todos los animes hentai de pikante pe: subtitulado, español, inglés y más.';

export const metadata = {
  title: OG_TITLE,
  description: OG_DESC,
  alternates: { canonical: '/hentai' },
  openGraph: buildOpenGraph({ title: OG_TITLE, description: OG_DESC, url: '/hentai' }),
  twitter: buildTwitter({ title: OG_TITLE, description: OG_DESC }),
};

export default function HentaiPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <HentaiClient />
      </div>
    </div>
  );
}
