'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './panel.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';

const NAV = [
  { href: '/admin', label: 'Panel', icon: 'speedometer-outline' },
  { href: '/admin/subirvideos', label: 'Subir video', icon: 'videocam-outline' },
  { href: '/admin/subirhentai', label: 'Subir hentai', icon: 'images-outline' },
  { href: '/admin/comunidad', label: 'Controlar comunidad', icon: 'people-outline' },
  { href: '/admin/redes', label: 'Redes sociales', icon: 'share-social-outline' },
  { href: '/admin/configuracion', label: 'Configuración', icon: 'settings-outline' },
];

export default function PanelLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('pkp_admin_token') || sessionStorage.getItem('pkp_admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    try {
      const raw = localStorage.getItem('pkp_admin') || sessionStorage.getItem('pkp_admin');
      if (raw) setAdmin(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [router]);

  // cierra el menú al cambiar de página
  useEffect(() => { setOpen(false); }, [pathname]);

  function logout() {
    localStorage.removeItem('pkp_admin_token');
    localStorage.removeItem('pkp_admin');
    sessionStorage.removeItem('pkp_admin_token');
    sessionStorage.removeItem('pkp_admin');
    router.replace('/admin/login');
  }

  const logoSrc = isDark ? '/logo.png' : '/logo_oscuro.png';

  if (!ready) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          className={styles.menuBtn}
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
        >
          <ion-icon name={open ? 'close-outline' : 'menu-outline'} suppressHydrationWarning></ion-icon>
        </button>
        <img src={logoSrc} alt="PIKANTE PE" className={styles.logo} />
        <div className={styles.headText}>
          <h1 className={styles.title}>Panel de administración</h1>
          <p className={styles.sub}>Hola {admin?.nombre || admin?.usuario || 'admin'} · rol {admin?.rol || 'admin'}</p>
        </div>
        <div className={styles.spacer} />
        <span className={styles.status}>
          <span className={styles.dot} aria-hidden="true" />
          Sistema en línea
        </span>
        <button className={styles.logout} type="button" onClick={logout}>
          <ion-icon name="log-out-outline" suppressHydrationWarning></ion-icon>
          Salir
        </button>
      </header>

      <nav className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="Secciones del panel">
        <span className={styles.navLabel}>Gestión</span>
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`${styles.item} ${active ? styles.itemActive : ''}`}
            >
              <ion-icon name={n.icon} className={styles.icon} suppressHydrationWarning></ion-icon>
              {n.label}
            </Link>
          );
        })}
        <div className={styles.sideFoot}>
          PIKANTE PE · v2.0<br />PostgreSQL + Redis
        </div>
      </nav>

      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <main className={styles.main}>{children}</main>
    </div>
  );
}
