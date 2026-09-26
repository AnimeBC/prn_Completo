import CrearGrupo from '@/_Pages/main/Comunidad/CrearGrupo/crearGrupo.js';

export const metadata = {
  title: 'Crear grupo',
  description: 'Crea tu propia comunidad o grupo en pikante pe.',
  alternates: { canonical: '/comunidad/crear-grupo' },
  robots: { index: false, follow: false },
};

export default function CrearGrupoPage() {
  return (
    <>
      <CrearGrupo />
    </>
  );
}
