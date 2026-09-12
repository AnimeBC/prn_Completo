import Placeholder from '@/_Pages/admin/Placeholder';

export const metadata = { title: 'Controlar comunidad', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Placeholder
      title="Controlar comunidad"
      icon="people-outline"
      description="Modera las subidas de la comunidad, revisa reportes y gestiona comentarios."
    />
  );
}
