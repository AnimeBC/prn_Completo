import styles from './layout.module.css';

export const metadata = {
  title: {
    default: 'Panel de administración | pikante pe',
    template: '%s | Admin pikante pe',
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({ children }) {
  return (
    <div className={styles.adminShell}>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
