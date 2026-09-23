import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';

export const metadata = {
  title: 'Favoritos',
  description: 'Tus videos guardados en pikante pe.',
  alternates: { canonical: '/favoritos' },
  robots: { index: false, follow: false },
};

export default function FavoritosPage() {
  return (
    <>

      <MisVideos title="Favoritos" endpoint="saved" emptyText="Aún no guardas ningún video." />
    </>
  );
}
