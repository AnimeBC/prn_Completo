import Footer from '@/_Pages/main/layouts/Footer';

export default function MainLayout({ children }) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
