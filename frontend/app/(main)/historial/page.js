import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';

export const metadata = {
  title: 'Historial',
  description: 'Los videos que has visto en pikante pe.',
  alternates: { canonical: '/historial' },
  robots: { index: false, follow: false },
};

export default function HistorialPage() {
  return (
    <>

      <MisVideos endpoint="history" />
    </>
  );
}
