import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PackDetalle from '@/_Pages/main/Packs/componentes/detalle';
import styles from '@/app/(main)/page.module.css';
import { apiGet } from '@/_Extras/Datos/server.js';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const pack = await apiGet(`/api/packs/${id}`);
  if (!pack || !pack.id) return { title: 'Pack no encontrado' };
  const description = `${pack.fotos} fotos • ${pack.videos} videos de ${pack.uploader}`;
  return {
    title: pack.titulo,
    description: `Descarga ${pack.titulo}: ${description} en pikante pe`,
    alternates: { canonical: `/packs/${id}` },
    openGraph: { title: `${pack.titulo} | pikante pe`, description },
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
