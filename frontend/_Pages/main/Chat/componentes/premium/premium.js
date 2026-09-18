'use client';

import { useEffect } from 'react';
import styles from './premium.module.css';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const PLANES = [
  {
    id: 'basico',
    nombre: 'Básico',
    precio: '2.5',
    tag: null,
    features: [
      'Envía archivos de hasta 500 MB',
      '1 comunidad propia',
      'Stickers básicos',
      'Soporte por correo',
    ],
  },
  {
    id: 'medio',
    nombre: 'Medio',
    precio: '20',
    tag: null,
    features: [
      'Todo lo del plan Básico',
      'Archivos de hasta 5 GB',
      'Hasta 3 comunidades',
      'Stickers y GIFs',
      'Sin anuncios en el chat',
    ],
  },
  {
    id: 'premium',
    nombre: 'Premium',
    precio: '25',
    tag: 'Recomendado',
    destacado: true,
    features: [
      'Todo lo del plan Medio',
      'Almacenamiento casi ilimitado',
      'Sube tus propios stickers y GIFs',
      'Crea varias comunidades a la vez',
      'Insignia Premium en tu perfil',
      'Prioridad en soporte',
    ],
  },
];

export default function Premium({ open, onClose }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}>
          <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
        </button>

        <div className={styles.head}>
          <span className={styles.crown}><ion-icon name="diamond-outline" suppressHydrationWarning></ion-icon></span>
          <h2 className={styles.title}>{es ? 'Hazte Premium' : 'Go Premium'}</h2>
          <p className={styles.sub}>
            {es
              ? 'Desbloquea stickers, GIFs, más almacenamiento y varias comunidades a la vez.'
              : 'Unlock stickers, GIFs, more storage and multiple communities at once.'}
          </p>
        </div>

        <div className={styles.plans}>
          {PLANES.map((p) => (
            <div key={p.id} className={`${styles.plan} ${p.destacado ? styles.planHot : ''}`}>
              {p.tag && <span className={styles.tag}>{p.tag}</span>}
              <h3 className={styles.planName}>{p.nombre}</h3>
              <div className={styles.price}>
                <span className={styles.cur}>$</span>
                <span className={styles.amount}>{p.precio}</span>
                <span className={styles.per}>{es ? '/mes' : '/mo'}</span>
              </div>
              <ul className={styles.features}>
                {p.features.map((f) => (
                  <li key={f}>
                    <ion-icon name="checkmark-circle" suppressHydrationWarning></ion-icon>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${styles.buy} ${p.destacado ? styles.buyHot : ''}`}
                onClick={() => { /* Próximamente: pasarela de pago */ }}
              >
                {es ? 'Comprar' : 'Buy'} {p.nombre}
              </button>
            </div>
          ))}
        </div>

        <p className={styles.note}>
          {es ? 'Los pagos estarán disponibles próximamente.' : 'Payments will be available soon.'}
        </p>
      </div>
    </div>
  );
}
