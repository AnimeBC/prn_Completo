import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import PackDescargar from '@/_Pages/main/Packs/componentes/descargar';
import styles from '@/app/(main)/page.module.css';
import { apiGet } from '@/_Extras/Datos/server.js';

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
  const titulo = pack
    ? (lang === 'en' ? (pack.titulo_en || pack.titulo_es) : (pack.titulo_es || pack.titulo_en))
    : `Pack`;
  return {
    title: `${lang === 'en' ? 'Downloads' : 'Descargas'} — ${titulo}`,
    robots: { index: false, follow: false },
    alternates: { canonical: `/packs/${pack?.public_id || publicId}/descargar` },
  };
}

export default async function PackDescargarPage({ params }) {
  const { publicId } = await params;
  const pid = await resolvePublicId(publicId);
  if (pid && pid !== String(publicId)) redirect(`/packs/${pid}/descargar`);

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <PackDescargar packId={publicId} />
      </div>
    </div>
  );
}
