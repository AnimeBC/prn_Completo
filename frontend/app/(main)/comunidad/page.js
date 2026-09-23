import ComunidadClient from '@/_Pages/main/Comunidad/comunidad.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export const metadata = {
  title: 'Comunidad',
  description: 'Videos subidos por usuarios reales de la comunidad pikante pe',
  alternates: { canonical: '/comunidad' },
  openGraph: buildOpenGraph({ title: 'Comunidad', description: 'Videos subidos por usuarios reales de la comunidad pikante pe', url: '/comunidad' }),
  twitter: buildTwitter({ title: 'Comunidad', description: 'Videos subidos por usuarios reales de la comunidad pikante pe' }),
};

export default function ComunidadPage() {
  return (
    <>

      <ComunidadClient />
    </>
  );
}
