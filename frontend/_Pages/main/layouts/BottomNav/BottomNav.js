'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import styles from './bottomNav.module.css';
import { useSidebar } from '@/app/sidebarContext.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

// Rutas habilitadas; el resto muestra el modal de mantenimiento.
const ENABLED = ['/', '/videos', '/tendencias', '/fetiches', '/packs', '/comunidad', '/hentai', '/favoritos', '/historial', '/me-gusta', '/perfil'];

const ITEMS = [
  { href: '/videos', icon: 'film-outline', key: 'nav.todosVideos' },
  { href: '/hentai', icon: 'sparkles-outline', key: 'nav.hentai' },
  { href: '/en-vivo', icon: 'radio-outline', key: 'nav.enVivo', center: true },
  { href: '/reels', icon: 'play-circle-outline', key: 'nav.reels' },
  { href: '/perfil', icon: 'person-outline', key: null },
];

/** Barra de navegación inferior (solo celular). */
export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { openMaint } = useSidebar();
  const [chatOpen, setChatOpen] = useState(() => (
    typeof window !== 'undefined' ? !!window.__pkpChatOpen : false
  ));

  // Dentro de un chat no se muestra la barra; en la lista de chats sí.
  useEffect(() => {
    const onChat = (e) => setChatOpen(!!(e && e.detail && e.detail.open));
    window.addEventListener('pkp:chatopen', onChat);
    return () => window.removeEventListener('pkp:chatopen', onChat);
  }, []);

  if (pathname && pathname.startsWith('/chat') && chatOpen) return null;

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  function go(href) {
    if (!ENABLED.includes(href)) { openMaint(); return; }
    if (pathname !== href) router.push(href);
  }

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.nav} aria-label={es ? 'Navegacion' : 'Navigation'}>
        {ITEMS.map((it) => {
          const active = isActive(it.href);
          return (
            <button
              key={it.href}
              type="button"
              className={`${styles.item} ${active ? styles.itemActive : ''} ${it.center ? styles.itemCenter : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => go(it.href)}
            >
              <span className={styles.iconWrap}>
                <ion-icon name={it.icon} className={styles.icon} suppressHydrationWarning></ion-icon>
              </span>
              <span className={styles.label}>{it.key ? t(it.key) : (es ? 'Perfil' : 'Profile')}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
