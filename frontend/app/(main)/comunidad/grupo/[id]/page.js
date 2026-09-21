import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import GrupoDetalle from '@/_Pages/main/Comunidad/GrupoDetalle';
import styles from '@/app/(main)/page.module.css';
import { apiGet, mediaUrl } from '@/_Extras/Datos/server.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const getGrupo = async (id) => {
  const r = await apiGet(`/api/comunidad/grupos/${encodeURIComponent(id)}`);
  return r?.grupo || null;
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  const g = await getGrupo(id);
  if (!g) return { title: 'Comunidad' };
  const desc = (g.descripcion || 'Comunidad de pikante pe').slice(0, 160);
  const image = g.banner ? mediaUrl(g.banner) : (g.avatar ? mediaUrl(g.avatar) : undefined);
  return {
    title: g.nombre,
    description: desc,
    alternates: { canonical: `/comunidad/grupo/${id}` },
    openGraph: buildOpenGraph({ title: g.nombre, description: desc, url: `/comunidad/grupo/${id}`, image, imageAlt: g.nombre, type: 'website' }),
    twitter: buildTwitter({ title: g.nombre, description: desc, image }),
  };
}

export default async function GrupoPage({ params }) {
  const { id } = await params;
  const grupo = await getGrupo(id);

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <GrupoDetalle id={id} initialGrupo={grupo} />
      </div>
    </div>
  );
}
