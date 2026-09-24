import MatchContent from '@/_Pages/main/Match/match.js';

export const metadata = {
  title: 'Match con alguien',
  description: 'Conecta al azar con alguien de la comunidad en videollamada privada, estilo ruleta.',
  alternates: { canonical: '/match' },
  robots: { index: false, follow: false },
};

export default function MatchPage() {
  return (
    <>

      <MatchContent />
    </>
  );
}
