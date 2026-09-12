import { cookies } from 'next/headers';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PackDetalle from '@/_Pages/main/Packs/componentes/detalle';
import styles from '@/app/(main)/page.module.css';
import { apiGet } from '@/_Extras/Datos/server.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const lang = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'es';
  const pack = await apiGet(`/api/packs/${id}`);
  if (!pack || !pack.id) return { title: lang === 'en' ? 'Pack not found' : 'Pack no encontrado' };

  const titulo = lang === 'en'
    ? (pack.titulo_en || pack.titulo_es || pack.titulo)
    : (pack.titulo_es || pack.titulo_en || pack.titulo);
  const desc = lang === 'en' ? (pack.desc_en || pack.desc_es) : (pack.desc_es || pack.desc_en);
  const base = lang === 'en'
    ? `${pack.fotos} photos • ${pack.videos} videos by ${pack.uploader}`
    : `${pack.fotos} fotos • ${pack.videos} videos de ${pack.uploader}`;
  const description = (desc ? `${desc} ` : '') + base;

  return {
    title: titulo,
    description,
    alternates: { canonical: `/packs/${id}` },
    openGraph: {
      title: `${titulo} | pikante pe`,
      description,
      images: pack.thumb ? [pack.thumb] : undefined,
    },
  };
}

export default async function PackPage({ params }) {
  const { id } = await params;

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <PackDetalle packId={id} />
      </div>
    </div>
  );
}
