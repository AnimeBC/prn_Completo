'use client';

import styles from './headerLateralIzquierdo.module.css';
import { useSidebar } from '@/app/sidebarContext.js';
import { useRouter, usePathname } from 'next/navigation';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';

const sectionPrincipal = [
  { icon: 'home-outline', label: 'nav.inicio', href: '/' },
  { icon: 'play-circle-outline', label: 'nav.reels', href: '/reels', variant: 'reels', tagKey: 'nav.sugerido' },
  { icon: 'radio-outline', label: 'nav.enVivo', href: '/en-vivo', variant: 'live', tagKey: 'nav.enVivoTag' },
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

const categorias = [
  { icon: 'star-outline', label: 'Amateur', href: '/categorias/amateur' },
  { icon: 'briefcase-outline', label: 'MILF', href: '/categorias/milf' },
  { icon: 'earth-outline', label: 'Latina', href: '/categorias/latina' },
];

// Rutas habilitadas al publicar; el resto muestra modal de mantenimiento.
const ENABLED_ROUTES = ['/', '/videos', '/tendencias', '/fetiches', '/packs', '/comunidad', '/hentai'];

export default function HeaderLateralIzquierdo() {
  const { isOpen, close, openMaint } = useSidebar();
  const { t } = useLanguage();
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

  function handleVerTodas() {
    openMaint();
  }

  function renderItem(item) {
    const active = isActive(item.href);
    const variantClass =
      item.variant === 'reels' ? styles.promoReels : item.variant === 'live' ? styles.promoLive : '';
    const promoClass = item.variant ? styles.promoItem : '';
    return (
      <div
        key={item.label}
        role="link"
        tabIndex={0}
        aria-current={active ? 'page' : undefined}
        className={`${styles.navItem} ${promoClass} ${variantClass} ${active ? `${styles.navItemActive} ${styles.promoActive}` : ''}`}
        onClick={() => handleNavigate(item.href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleNavigate(item.href);
          }
        }}
      >
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

        <nav className={styles.nav}>
          <span className={styles.sectionLabel}>{t('nav.categorias')}</span>
          {categorias.map(renderItem)}
          <button
            className={styles.moreBtn}
            type="button"
            onClick={handleVerTodas}
          >
            <ion-icon name="grid-outline" className={styles.moreIcon} suppressHydrationWarning></ion-icon>
            <span>{t('nav.verTodas')}</span>
          </button>
        </nav>
      </aside>
      {isOpen && <div className={styles.overlay} onClick={close}></div>}
    </>
  );
}
