import MisVideos from '@/_Pages/main/MisVideos/misVideos.js';

export const metadata = {
  title: 'Me gusta',
  description: 'Los videos que te gustaron en pikante pe.',
  alternates: { canonical: '/me-gusta' },
  robots: { index: false, follow: false },
};

export default function MeGustaPage() {
  return (
    <>

      <MisVideos endpoint="likes" />
    </>
  );
}
