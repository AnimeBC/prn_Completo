'use client';

import { useEffect, useState } from 'react';
import styles from './compartir.module.css';

export default function CompartirModal({ open, onClose, title = '' }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) {
      setCopied(false);
      setUrl(window.location.href);
    }
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const text = title ? `${title} en PICANTE.pe` : 'Mira esto en PICANTE.pe';
  const links = [
    { label: 'WhatsApp', icon: 'logo-whatsapp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, cls: styles.wa },
    { label: 'Telegram', icon: 'send-outline', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, cls: styles.tg },
    { label: 'Facebook', icon: 'logo-facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, cls: styles.fb },
    { label: 'X', icon: 'logo-twitter', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, cls: styles.x },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // portapapeles no disponible
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Compartir video"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h3 className={styles.title}>Compartir</h3>
          <button className={styles.closeBtn} type="button" aria-label="Cerrar" onClick={onClose}>
            <ion-icon name="close-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
        <div className={styles.grid}>
          {links.map((l) => (
            <a
              key={l.label}
              className={`${styles.opt} ${l.cls}`}
              href={l.href}
              target="_blank"
              rel="nofollow noopener"
            >
              <ion-icon name={l.icon} className={styles.optIcon} suppressHydrationWarning></ion-icon>
              {l.label}
            </a>
          ))}
          <button className={`${styles.opt} ${styles.copy} ${copied ? styles.copied : ''}`} type="button" onClick={copy}>
            <ion-icon name="link-outline" className={styles.optIcon} suppressHydrationWarning></ion-icon>
            {copied ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </div>
      </div>
    </div>
  );
}
