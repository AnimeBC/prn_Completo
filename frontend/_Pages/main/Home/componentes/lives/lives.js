'use client';

import styles from './lives.module.css';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

/**
 * Sección de portada: promoción de "Match con alguien". El botón abre la
 * página de la sección (/match); por ahora es un placeholder con título.
 */
export default function MatchPromo() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <section className={styles.section}>
      <div className={styles.matchCard}>
        <span className={styles.matchIconWrap}>
          <ion-icon name="dice-outline" className={styles.matchIcon} suppressHydrationWarning></ion-icon>
        </span>
        <div className={styles.matchTexts}>
          <div className={styles.matchTitleRow}>
            <h2 className={styles.matchTitle}>{t('secciones.matchTitulo')}</h2>
            <span className={styles.matchBadge}>{t('nav.enVivoTag')}</span>
          </div>
          <p className={styles.matchText}>{t('secciones.matchTexto')}</p>
        </div>
        <button
          type="button"
          className={styles.matchBtn}
          onClick={() => router.push('/match')}
          onMouseEnter={() => router.prefetch('/match')}
        >
          <ion-icon name="sparkles-outline" suppressHydrationWarning></ion-icon>
          {t('secciones.matchBtn')}
        </button>
      </div>
    </section>
  );
}
