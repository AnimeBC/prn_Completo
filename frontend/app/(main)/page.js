import HomeClient from '@/_Pages/main/Home/home.js';

export const metadata = {
  title: 'Inicio',
  description:
    'Bienvenido a pikante pe: tendencias, packs populares, comunidad y lives en directo.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return (
    <>
      <HomeClient />
    </>
  );
}
