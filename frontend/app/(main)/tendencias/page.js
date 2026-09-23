import TendenciasClient from '@/_Pages/main/Tendencias/tendencias.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export const metadata = {
  title: 'Tendencias',
  description: 'Lo más visto de la plataforma: ranking de tendencias en pikante pe',
  alternates: { canonical: '/tendencias' },
  openGraph: buildOpenGraph({
    title: 'Tendencias',
    description: 'Lo más visto de la plataforma: ranking de tendencias en pikante pe',
    url: '/tendencias',
  }),
  twitter: buildTwitter({
    title: 'Tendencias',
    description: 'Lo más visto de la plataforma: ranking de tendencias en pikante pe',
  }),
};

export default function TendenciasPage() {
  return (
    <>

      <TendenciasClient />
    </>
  );
}
