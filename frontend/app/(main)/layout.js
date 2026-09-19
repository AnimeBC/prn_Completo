import Footer from '@/_Pages/main/layouts/Footer';
import BottomNav from '@/_Pages/main/layouts/BottomNav';

export default function MainLayout({ children }) {
  return (
    <>
      {children}
      <Footer />
      <BottomNav />
    </>
  );
}
