import Placeholder from '@/_Pages/admin/Placeholder';

export const metadata = { title: 'Configuración del sistema', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Placeholder
      title="Configuración del sistema"
      icon="settings-outline"
      description="Ajustes generales, idiomas, anuncios, dominio y seguridad del sistema."
    />
  );
}
