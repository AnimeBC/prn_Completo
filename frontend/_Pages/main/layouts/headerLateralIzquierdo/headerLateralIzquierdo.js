'use client';

import Link from 'next/link';
import styles from './headerLateralIzquierdo.module.css';
import { useSidebar } from '@/app/sidebarContext.js';
import { useRouter, usePathname } from 'next/navigation';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';

const sectionPrincipal = [
  { icon: 'home-outline', label: 'nav.inicio', href: '/' },
  { icon: 'play-circle-outline', label: 'nav.reels', href: '/reels', variant: 'reels', tagKey: 'nav.sugerido' },
  { icon: 'dice-outline', label: 'nav.enVivo', href: '/en-vivo', variant: 'live', tagKey: 'nav.enVivoTag' },
  { icon: 'film-outline', label: 'nav.todosVideos', href: '/videos' },
  { icon: 'sparkles-outline', label: 'nav.hentai', href: '/hentai' },
  { icon: 'trending-up-outline', label: 'nav.tendencias', href: '/tendencias' },
  { icon: 'flame-outline', label: 'nav.fetiches', href: '/fetiches' },
  { icon: 'cube-outline', label: 'nav.packs', href: '/packs' },
  { icon: 'people-outline', label: 'nav.comunidad', href: '/comunidad' },
];

const tusGuardados = [
  { icon: 'heart-outline', label: 'nav.favoritos', href: '/favoritos' },
  { icon: 'time-outline', label: 'nav.historial', href: '/historial' },
  { icon: 'thumbs-up-outline', label: 'nav.meGusta', href: '/me-gusta' },
];

// Rutas habilitadas al publicar; el resto muestra modal de mantenimiento.
const ENABLED_ROUTES = ['/', '/videos', '/tendencias', '/fetiches', '/packs', '/comunidad', '/hentai', '/favoritos', '/historial', '/me-gusta', '/perfil'];

export default function HeaderLateralIzquierdo() {
  const { isOpen, close, openMaint } = useSidebar();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  function handleNavigate(href) {
    if (!ENABLED_ROUTES.includes(href)) {
      openMaint();
      return;
    }
    close();
    if (pathname !== href) {
      router.push(href);
    }
  }

  function renderItem(item) {
    const active = isActive(item.href);
    const variantClass =
      item.variant === 'reels' ? styles.promoReels : item.variant === 'live' ? styles.promoLive : '';
    const promoClass = item.variant ? styles.promoItem : '';
    const className = `${styles.navItem} ${promoClass} ${variantClass} ${active ? `${styles.navItemActive} ${styles.promoActive}` : ''}`;
    const inner = (
      <>
        <ion-icon name={item.icon} className={styles.navIcon} suppressHydrationWarning></ion-icon>
        <span>{item.label.startsWith('nav.') ? t(item.label) : item.label}</span>
        {item.tagKey && (
          <span className={`${styles.promoTag} ${item.variant === 'live' ? styles.promoTagLive : ''}`}>
            {item.variant === 'live' && <span className={styles.liveDot} />}
            {item.variant === 'reels' && (
              <ion-icon name="flame-outline" className={styles.promoTagIcon} suppressHydrationWarning></ion-icon>
            )}
            {t(item.tagKey)}
          </span>
        )}
      </>
    );
    // Habilitadas: <Next/Link> -> prefetch automatico (Next 16) y navegacion
    // instantanea. Deshabilitadas (reels/en-vivo): siguen con modal de
    // mantenimiento.
    if (ENABLED_ROUTES.includes(item.href)) {
      return (
        <Link
          key={item.label}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={className}
          onClick={close}
        >
          {inner}
        </Link>
      );
    }
    return (
      <div
        key={item.label}
        role="link"
        tabIndex={0}
        aria-current={active ? 'page' : undefined}
        className={className}
        onClick={() => handleNavigate(item.href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleNavigate(item.href);
          }
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <>
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        <nav className={styles.nav}>
          <span className={styles.sectionLabel}>{t('nav.seccionPrincipal')}</span>
          {sectionPrincipal.map(renderItem)}
        </nav>

        <nav className={styles.nav}>
          <span className={styles.sectionLabel}>{t('nav.tusGuardados')}</span>
          {tusGuardados.map(renderItem)}
        </nav>

        <nav className={`${styles.nav} ${styles.themeSection}`}>
          <span className={styles.sectionLabel}>{es ? 'Apariencia' : 'Appearance'}</span>
          <div
            role="button"
            tabIndex={0}
            className={styles.navItem}
            onClick={toggleTheme}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
              }
            }}
          >
            <ion-icon
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              className={styles.navIcon}
              suppressHydrationWarning
            ></ion-icon>
            <span>{isDark ? (es ? 'Modo claro' : 'Light mode') : (es ? 'Modo oscuro' : 'Dark mode')}</span>
          </div>
        </nav>
      </aside>
      {isOpen && <div className={styles.overlay} onClick={close}></div>}
    </>
  );
}
