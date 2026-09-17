import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PackDetalle from '@/_Pages/main/Packs/componentes/detalle';
import styles from '@/app/(main)/page.module.css';
import { apiGet } from '@/_Extras/Datos/server.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

/** Si llega un id numérico viejo, resuélvelo a su public_id. */
async function resolvePublicId(id) {
  const key = String(id || '');
  if (!/^\d+$/.test(key)) return key;
  const legacy = await apiGet(`/api/packs/legacy/${key}`);
  return legacy?.public_id || '';
}

export async function generateMetadata({ params }) {
  const { publicId } = await params;
  const lang = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'es';
  const pid = await resolvePublicId(publicId);
  const pack = pid ? await apiGet(`/api/packs/${pid}`) : null;
  if (!pack || !pack.public_id) return { title: lang === 'en' ? 'Pack not found' : 'Pack no encontrado' };

  const titulo = lang === 'en'
    ? (pack.titulo_en || pack.titulo_es || pack.titulo)
    : (pack.titulo_es || pack.titulo_en || pack.titulo);
  const base = lang === 'en'
    ? `${pack.fotos} photos • ${pack.videos} videos by ${pack.uploader}`
    : `${pack.fotos} fotos • ${pack.videos} videos de ${pack.uploader}`;

  return {
    title: titulo,
    description: base,
    alternates: { canonical: `/packs/${pack.public_id}` },
    openGraph: buildOpenGraph({
      title: titulo,
      description: base,
      url: `/packs/${pack.public_id}`,
      image: pack.thumb,
      imageAlt: titulo,
      type: 'website',
    }),
    twitter: buildTwitter({ title: titulo, description: base, image: pack.thumb }),
  };
}

export default async function PackPage({ params }) {
  const { publicId } = await params;
  const pid = await resolvePublicId(publicId);
  if (pid && pid !== String(publicId)) redirect(`/packs/${pid}`);

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <PackDetalle packId={publicId} />
      </div>
    </div>
  );
}
