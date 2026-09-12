import AdminLogin from '@/_Pages/admin/Login/login.js';

export const metadata = {
  title: 'Acceso administrador',
  description: 'Panel de administración de pikante pe.',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLogin />;
}
