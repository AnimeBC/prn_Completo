'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import styles from './bottomNav.module.css';
import { useSidebar } from '@/app/sidebarContext.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

// Rutas habilitadas; el resto muestra el modal de mantenimiento.
const ENABLED = ['/', '/videos', '/tendencias', '/fetiches', '/packs', '/comunidad', '/hentai', '/favoritos', '/historial', '/me-gusta', '/perfil', '/reels', '/chat'];

// Navegacion tipo app movil: Inicio, Reels, Comunidad (centro destacado),
// Chats, Perfil. Las categorias de videos viven en el menu lateral.
const ITEMS = [
  { href: '/', icon: 'home-outline', label: ['Inicio', 'Home'] },
  { href: '/reels', icon: 'play-circle-outline', label: ['Reels', 'Reels'] },
  { href: '/comunidad', icon: 'people-outline', label: ['Comunidad', 'Community'], center: true },
  { href: '/chat', icon: 'chatbubbles-outline', label: ['Chats', 'Chats'] },
  { href: '/perfil', icon: 'person-outline', label: ['Perfil', 'Profile'] },
];

/** Barra de navegación inferior (solo celular). */
export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLanguage();
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

  // Badge de no leidos del item CHATS (grupos + mensajes directos).
  const { userKey, authed } = useAuth();
  const [unread, setUnread] = useState(0);

  const cargarNoLeidos = useCallback(async () => {
    if (!authed || !userKey) { setUnread(0); return; }
    try {
      const [g, d] = await Promise.all([
        apiComunidad.chats(userKey),
        apiComunidad.dmChats(userKey),
      ]);
      const total = [...(g && g.data) || [], ...(d && d.data) || []]
        .reduce((s, c) => s + (c.no_leidos || 0), 0);
      setUnread(total);
    } catch { /* sin red: conserva el ultimo valor */ }
  }, [authed, userKey]);

  useEffect(() => { cargarNoLeidos(); }, [cargarNoLeidos]);

  // Tiempo real (Redis -> SSE): cada mensaje/chat refresca el contador.
  useEffect(() => {
    if (!authed) return undefined;
    let t = null;
    const onChange = (e) => {
      const tipo = String(e?.detail?.type || '');
      if (!tipo.startsWith('comunidad_')) return;
      if (t) clearTimeout(t);
      t = setTimeout(cargarNoLeidos, 500);
    };
    window.addEventListener('pikantepe:change', onChange);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('pikantepe:change', onChange);
    };
  }, [authed, cargarNoLeidos]);

  if (pathname && pathname.startsWith('/chat') && chatOpen) return null;

  function isActive(href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  function go(href) {
    // Reels: aun no esta listo -> muestra el modal de mantenimiento.
    if (href === '/reels') { openMaint(); return; }
    if (!ENABLED.includes(href)) { openMaint(); return; }
    if (pathname !== href) router.push(href);
  }

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.nav} aria-label={es ? 'Navegacion' : 'Navigation'}>
        {ITEMS.map((it) => {
          const active = isActive(it.href);
          const cls = `${styles.item} ${active ? styles.itemActive : ''} ${it.center ? styles.itemCenter : ''}`;
          const aria = active ? 'page' : undefined;
          const inner = (
            <>
              <span className={styles.iconWrap}>
                <ion-icon name={it.icon} className={styles.icon} suppressHydrationWarning></ion-icon>
                {it.href === '/chat' && unread > 0 && (
                  <span className={styles.badge} aria-label={`${unread} ${es ? 'sin leer' : 'unread'}`}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span className={styles.label}>{es ? it.label[0] : it.label[1]}</span>
            </>
          );
          // Habilitadas: <Next/Link> con prefetch automatico (Next 16).
          // Reels: sigue en boton -> modal de mantenimiento.
          if (it.href !== '/reels' && ENABLED.includes(it.href)) {
            return (
              <Link key={it.href} href={it.href} className={cls} aria-current={aria}>
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={it.href}
              type="button"
              className={cls}
              aria-current={aria}
              onClick={() => go(it.href)}
            >
              {inner}
            </button>
          );
        })}
      </nav>
    </>
  );
}
