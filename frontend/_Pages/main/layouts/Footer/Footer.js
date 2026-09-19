'use client';

import { usePathname } from 'next/navigation';
import styles from './footer.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Footer() {
  const pathname = usePathname();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const year = new Date().getFullYear();

  // En Comunidad, Chats y Notificaciones el footer estorba: se oculta.
  if (pathname && (
    pathname.startsWith('/comunidad')
    || pathname.startsWith('/chat')
    || pathname.startsWith('/notificaciones')
  )) return null;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <div className={styles.brandRow}>
            <span className={styles.brand}>pikantepe.com</span>
            <span className={styles.badge}>+18</span>
          </div>
          <p className={styles.notice}>
            {es
              ? 'Todos los videos son traídos de terceros. ¡Disfruta!'
              : 'All videos are brought from third parties. Enjoy!'}
          </p>
        </div>

        <nav className={styles.nav} aria-label="Legal">
          <a className={styles.link} href="/legal#terminos">
            {es ? 'Términos' : 'Terms'}
          </a>
          <a className={styles.link} href="/legal#privacidad">
            {es ? 'Privacidad' : 'Privacy'}
          </a>
          <a className={styles.link} href="/legal#cookies">
            Cookies
          </a>
          <a className={styles.link} href="/legal#dmca">
            DMCA
          </a>
          <a className={styles.link} href="/legal#aviso">
            {es ? '+18 · No CP' : '+18 · No CSAM'}
          </a>
          <a className={styles.link} href="mailto:pikantepe.com@gmail.com">
            pikantepe.com@gmail.com
          </a>
        </nav>
      </div>

      <div className={styles.bottom}>
        <span>© {year} pikantepe.com</span>
        <span className={styles.sep} aria-hidden="true">·</span>
        <span>{es ? 'Todos los derechos reservados.' : 'All rights reserved.'}</span>
      </div>
    </footer>
  );
}
