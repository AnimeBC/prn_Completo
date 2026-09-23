import LegalContent from '@/_Pages/main/Legal/legal.js';

export const metadata = {
  title: 'Aviso legal',
  description:
    'Términos de uso, política de privacidad, cookies, DMCA y normas de contenido para adultos de pikantepe.com.',
  alternates: { canonical: '/legal' },
};

export default function LegalPage() {
  return (
    <>

      <LegalContent />
    </>
  );
}
