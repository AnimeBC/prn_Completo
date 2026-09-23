import NotificacionesPage from '@/_Pages/main/Notificaciones/NotificacionesPage.js';

export const metadata = {
  title: 'Notificaciones',
  description: 'Tus notificaciones en pikante pe',
  alternates: { canonical: '/notificaciones' },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <>

      <NotificacionesPage />
    </>
  );
}
