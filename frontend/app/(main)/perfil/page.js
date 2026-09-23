import PerfilClient from '@/_Pages/main/Perfil/perfil.js';

export const metadata = {
  title: 'Mi Perfil',
  description:
    'Administra tu perfil, tus videos guardados, tus me gusta y tus suscripciones en pikante pe.',
  alternates: { canonical: '/perfil' },
  robots: { index: false, follow: false },
};

export default function PerfilPage() {
  return (
    <>

      <PerfilClient />
    </>
  );
}
