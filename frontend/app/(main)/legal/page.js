import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import LegalContent from '@/_Pages/main/Legal/legal.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Aviso legal',
  description:
    'Términos de uso, política de privacidad, cookies, DMCA y normas de contenido para adultos de pikantepe.com.',
  alternates: { canonical: '/legal' },
};

export default function LegalPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <LegalContent />
      </div>
    </div>
  );
}
