'use client';

import styles from './footer.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Footer() {
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const year = new Date().getFullYear();

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
          <a className={styles.link} href="/contrato.html" target="_blank" rel="noopener">
            {es ? 'Términos' : 'Terms'}
          </a>
          <a className={styles.link} href="/contrato.html" target="_blank" rel="noopener">
            {es ? 'Privacidad' : 'Privacy'}
          </a>
          <a className={styles.link} href="/contrato.html" target="_blank" rel="noopener">
            Cookies
          </a>
          <a className={styles.link} href="/contrato.html" target="_blank" rel="noopener">
            DMCA
          </a>
          <a className={styles.link} href="mailto:admin@pikantepe.com">
            admin@pikantepe.com
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
