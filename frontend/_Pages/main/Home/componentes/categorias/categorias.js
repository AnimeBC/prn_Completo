'use client';

import { useRouter } from 'next/navigation';
import styles from './categorias.module.css';
import { useContenido } from '@/_Extras/Datos/ContenidoProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

export default function Categorias() {
  const router = useRouter();
  const { t } = useLanguage();
  const { feticheCategorias } = useContenido();
  const cats = feticheCategorias || [];

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>{t('secciones.categorias')}</h2>
          <ion-icon name="grid-outline" className={styles.icon} suppressHydrationWarning></ion-icon>
        </div>
        <div className={styles.actions}>
          <a href="/fetiches" className={styles.verMas}>
            {t('secciones.verMas')}
            <ion-icon name="arrow-forward-outline" className={styles.verMasIcon} suppressHydrationWarning></ion-icon>
          </a>
        </div>
      </div>

      {cats.length === 0 ? (
        <p className={styles.empty}>{t('secciones.sinCategorias')}</p>
      ) : (
        <div className={styles.grid}>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              onClick={() => router.push(`/fetiches?tab=${encodeURIComponent(c)}`)}
            >
              <ion-icon name="pricetag-outline" className={styles.chipIcon} suppressHydrationWarning></ion-icon>
              {c}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
