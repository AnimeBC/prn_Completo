import AdminHome from '@/_Pages/admin/Home/home.js';

export const metadata = {
  title: 'Panel de administración',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminHome />;
}
