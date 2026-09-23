import GruposClient from '@/_Pages/main/Comunidad/Grupos';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const T = 'Comunidades';
const D = 'Todas las comunidades de pikante pe: grupos públicos y privados.';

export const metadata = {
  title: T,
  description: D,
  alternates: { canonical: '/comunidad/grupos' },
  openGraph: buildOpenGraph({ title: T, description: D, url: '/comunidad/grupos' }),
  twitter: buildTwitter({ title: T, description: D }),
};

export default function GruposPage() {
  return (
    <>

      <GruposClient />
    </>
  );
}
