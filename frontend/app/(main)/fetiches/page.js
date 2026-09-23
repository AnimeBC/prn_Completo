import FetichesClient from '@/_Pages/main/Fetiches/fetiches.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

export const metadata = {
  title: 'Fetiches',
  description: 'Explora videos por fetiche en pikante pe',
  alternates: { canonical: '/fetiches' },
  openGraph: buildOpenGraph({ title: 'Fetiches', description: 'Explora videos por fetiche en pikante pe', url: '/fetiches' }),
  twitter: buildTwitter({ title: 'Fetiches', description: 'Explora videos por fetiche en pikante pe' }),
};

export default function FetichesPage() {
  return (
    <>

      <FetichesClient />
    </>
  );
}
