'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import styles from './header.module.css';
import { useTheme } from '@/_Extras/CambiodeColor/ThemeProvider.js';
import { useSidebar } from '@/app/sidebarContext.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL, mediaUrl } from '@/_Extras/Api/api.js';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { videoUrl } from '@/_Extras/Datos/urls.js';
import { abrirCanal } from '@/_Extras/Canales/canal.js';
import Notificaciones from '@/_Pages/main/layouts/Header/componentes/notificaciones';
import Mensajes from '@/_Pages/main/layouts/Header/componentes/mensajes';
import { useCall } from '@/_Extras/Llamadas/CallProvider.js';

const filters = [
  { value: 'recientes', label: 'filtros.recientes' },
  { value: 'vistos', label: 'filtros.vistos' },
  { value: 'likes', label: 'filtros.likes' },
  { value: 'hd', label: 'HD' },
  { value: '4k', label: '4K' },
];

export default function Header() {
  const { isDark, toggleTheme } = useTheme();
  const { isOpen, toggle: toggleSidebar, openMaint } = useSidebar();
  const { t, locale } = useLanguage();
  const es = locale !== 'en';
  const { iniciar: iniciarLlamada, iniciarGrupo, enCualquierLlamada, avisar } = useCall();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  const { user: me, authed, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const profileRef = useRef(null);
  const initial = (me?.nombre || me?.email || '?').trim().charAt(0).toUpperCase();

  // Header de chat (celular): se muestra al entrar a una conversación.
  const [isMobile, setIsMobile] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.__pkpChatInfo) setChatInfo(window.__pkpChatInfo);
    const onChat = (e) => setChatInfo(e?.detail || null);
    window.addEventListener('pkp:chatopen', onChat);
    return () => window.removeEventListener('pkp:chatopen', onChat);
  }, []);

  function volverDelChat() {
    window.dispatchEvent(new CustomEvent('pkp:chatback'));
  }

  // Información del chat (celular): grupo -> pestaña de información del grupo;
  // DM -> canal REAL resuelto por user_key (evita 404 por nombre visible).
  async function irAlCanal() {
    if (chatInfo?.tipo === 'grupo' && chatInfo?.grupo_id) {
      router.push(`/comunidad/grupo/${chatInfo.grupo_id}?tab=informacion`);
      return;
    }
    if (chatInfo?.canal_slug) {
      router.push(`/canal/${chatInfo.canal_slug}`);
      return;
    }
    if (chatInfo?.tipo === 'dm' && chatInfo?.user_key) {
      await abrirCanal(router, chatInfo.user_key, chatInfo.nombre);
      return;
    }
    openMaint();
  }

  // Llamada / videollamada desde el header de chat en celular.
  function llamarDesdeHeader(tipoLlamada) {
    if (enCualquierLlamada) {
      avisar(es ? 'Ya estas en una llamada' : 'You are already in a call');
      return;
    }
    if (chatInfo?.tipo === 'dm' && chatInfo?.user_key) {
      iniciarLlamada(chatInfo.user_key, tipoLlamada, { nombre: chatInfo.nombre, avatar: chatInfo.avatar });
      return;
    }
    if (chatInfo?.tipo === 'grupo' && chatInfo?.grupo_id) {
      iniciarGrupo(chatInfo.grupo_id, tipoLlamada, { nombre: chatInfo.nombre, avatar: chatInfo.avatar });
      return;
    }
    avisar(es ? 'No se pudo iniciar la llamada' : 'Could not start the call');
  }

  // Cierra el menú del perfil al hacer clic fuera o cambiar de página
  useEffect(() => {
    function onDoc(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push('/');
  }

  function handleProfileClick() {
    router.push('/perfil');
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Búsqueda en vivo contra la base de datos (debounce)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_URL}/api/videos?q=${encodeURIComponent(q)}&limit=8`);
        const j = await r.json();
        setResults(j.data || []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  function handleSearch() {
    const q = query.trim();
    if (q) router.push(`/videos?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setShowResults(false);
  }

  function goTo(item) {
    setSearchOpen(false);
    setShowResults(false);
    router.push(videoUrl(item));
  }

  function renderResults() {
    if (!query.trim() || query.trim().length < 2) return null;
    if (searching && results.length === 0) {
      return <div className={styles.results}><p className={styles.resultEmpty}>Buscando…</p></div>;
    }
    if (results.length === 0) {
      return <div className={styles.results}><p className={styles.resultEmpty}>Sin resultados para “{query.trim()}”.</p></div>;
    }
    return (
      <div className={styles.results}>
        {results.map((v) => (
          <button key={v.id} className={styles.resultItem} type="button" onClick={() => goTo(v)}>
            <span className={styles.resultThumbWrap}>
              {v.thumb
                ? <img className={styles.resultThumb} src={mediaUrl(v.thumb)} alt="" loading="lazy" />
                : <span className={styles.resultThumbEmpty}><ion-icon name="image-outline" suppressHydrationWarning></ion-icon></span>}
            </span>
            <span className={styles.resultInfo}>
              <span className={styles.resultTitle}>{v.titulo_es}</span>
              <span className={styles.resultMeta}>
                {v.canal} · {v.duracion || '00:00'}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (isMobile && chatInfo && chatInfo.open) {
    return (
      <header className={styles.chatHeader}>
        <button type="button" className={styles.chatHeadBtn} onClick={volverDelChat} aria-label={es ? 'Volver' : 'Back'}>
          <ion-icon name="arrow-back-outline" suppressHydrationWarning></ion-icon>
        </button>
        <div
          className={styles.chatHeadUser}
          role="button"
          tabIndex={0}
          onClick={irAlCanal}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irAlCanal(); } }}
        >
          <span className={styles.chatHeadAvatar}>
            {chatInfo.avatar
              ? <img src={mediaUrl(chatInfo.avatar)} alt="" />
              : <span className={styles.chatHeadInitial}>{String(chatInfo.nombre || '?').trim().charAt(0).toUpperCase()}</span>}
          </span>
          <span className={styles.chatHeadName}>{chatInfo.nombre}</span>
        </div>
        <div className={styles.chatHeadActions}>
          <button type="button" className={styles.chatHeadBtn} onClick={() => llamarDesdeHeader('audio')} disabled={enCualquierLlamada} aria-label={es ? 'Llamada de voz' : 'Voice call'} title={es ? 'Llamada de voz' : 'Voice call'}>
            <ion-icon name="call-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.chatHeadBtn} onClick={() => llamarDesdeHeader('video')} disabled={enCualquierLlamada} aria-label={es ? 'Videollamada' : 'Video call'} title={es ? 'Videollamada' : 'Video call'}>
            <ion-icon name="videocam-outline" suppressHydrationWarning></ion-icon>
          </button>
          <button type="button" className={styles.chatHeadBtn} onClick={irAlCanal} aria-label={es ? 'Información' : 'Info'}>
            <ion-icon name="information-circle-outline" suppressHydrationWarning></ion-icon>
          </button>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className={styles.headerContainer} ref={searchRef}>
        <button
          className={styles.hamburger}
          onClick={toggleSidebar}
          aria-label={isOpen ? t('header.cerrarMenu') : t('header.abrirMenu')}
          type="button"
        >
          <ion-icon name={isOpen ? 'close-outline' : 'menu-outline'} suppressHydrationWarning></ion-icon>
        </button>

        <div className={styles.searchIconOnly}>
          <ion-icon name="search-outline" onClick={() => setSearchOpen(true)} style={{ cursor: 'pointer' }} suppressHydrationWarning></ion-icon>
        </div>

        <div className={styles.searchWrapper}>
          <input
            type="text"
            placeholder={t('header.buscar')}
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <ion-icon name="search-outline" className={styles.searchIcon} suppressHydrationWarning></ion-icon>
          {showResults && renderResults()}
        </div>

        <div
          className={styles.logoSection}
          onClick={() => router.push('/')}
          onMouseEnter={() => router.prefetch('/')}
        >
          <img
            src={isDark ? '/logo.png' : '/logo_oscuro.png'}
            alt="Picante"
            className={styles.logoIcon}
          />
        </div>

        <div className={styles.actionsContainer}>
          <Notificaciones />

          {/* Movil: los Chats viven en la navegacion inferior; el hueco del
              messenger se usa para "Conoce Gente" (Omegle) con texto claro. */}
          {isMobile ? (
            <button
              type="button"
              className={styles.meetBtn}
              onClick={openMaint}
              aria-label={`${t('nav.enVivo')} · ${es ? 'pronto' : 'soon'}`}
              title={`${t('nav.enVivo')} · ${es ? 'pronto' : 'soon'}`}
            >
              <ion-icon name="dice-outline" suppressHydrationWarning></ion-icon>
              {/* Pildora corta (1 palabra): el nombre completo vive en el lateral. */}
              <span className={styles.meetBtnLabel}>{t('nav.enVivoShort') || t('nav.enVivo')}</span>
            </button>
          ) : (
            <Mensajes />
          )}

          <div className={styles.divider}></div>

          <button
            className={styles.themeButton}
            onClick={toggleTheme}
            aria-label={t('header.tema')}
            type="button"
          >
            <ion-icon name={isDark ? 'sunny-outline' : 'moon-outline'} className={styles.themeIcon} suppressHydrationWarning></ion-icon>
          </button>

          <div className={styles.divider}></div>

          <div className={styles.profileWrap} ref={profileRef}>
            <button
              type="button"
              className={`${styles.profileMenu} ${menuOpen ? styles.profileMenuOpen : ''}`}
              onClick={() => (authed ? setMenuOpen((o) => !o) : handleProfileClick())}
              aria-haspopup={authed ? 'menu' : undefined}
              aria-expanded={authed ? menuOpen : undefined}
            >
              {authed ? (
                <>
                  {me.avatar
                    ? <img src={mediaUrl(me.avatar)} alt="" className={styles.profileAvatar} />
                    : <span className={styles.profileInitial}>{initial}</span>}
                  <span className={styles.profileLabel}>{me.nombre || t('header.miPerfil')}</span>
                  <ion-icon name="chevron-down-outline" className={styles.profileChevron} suppressHydrationWarning></ion-icon>
                </>
              ) : (
                <>
                  <ion-icon name="person-circle-outline" className={styles.profileIcon} suppressHydrationWarning></ion-icon>
                  <span className={styles.profileLabel}>{t('header.miPerfil')}</span>
                  <ion-icon name="chevron-down-outline" className={styles.profileChevron} suppressHydrationWarning></ion-icon>
                </>
              )}
            </button>

            {authed && menuOpen && (
              <div className={styles.profileDropdown} role="menu">
                <div className={styles.profileHead}>
                  {me.avatar
                    ? <img src={mediaUrl(me.avatar)} alt="" className={styles.profileHeadAvatar} />
                    : <span className={styles.profileInitial}>{initial}</span>}
                  <div className={styles.profileHeadInfo}>
                    <strong className={styles.profileHeadName}>{me.nombre || (es ? 'Usuario' : 'User')}</strong>
                    <span className={styles.profileHeadMail}>{me.email || ''}</span>
                  </div>
                </div>

                <div className={styles.profileSep} />

                <button className={styles.profileItem} type="button" role="menuitem" onMouseEnter={() => router.prefetch('/perfil')} onClick={() => { setMenuOpen(false); router.push('/perfil'); }}>
                  <ion-icon name="person-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Mi Perfil' : 'My Profile'}
                </button>
                <button className={styles.profileItem} type="button" role="menuitem" onMouseEnter={() => router.prefetch('/favoritos')} onClick={() => { setMenuOpen(false); router.push('/favoritos'); }}>
                  <ion-icon name="bookmark-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Guardados' : 'Saved'}
                </button>
                <button className={styles.profileItem} type="button" role="menuitem" onMouseEnter={() => router.prefetch('/me-gusta')} onClick={() => { setMenuOpen(false); router.push('/me-gusta'); }}>
                  <ion-icon name="thumbs-up-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Me gusta' : 'Likes'}
                </button>
                <button className={styles.profileItem} type="button" role="menuitem" onMouseEnter={() => router.prefetch('/historial')} onClick={() => { setMenuOpen(false); router.push('/historial'); }}>
                  <ion-icon name="time-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Historial' : 'History'}
                </button>

                <div className={styles.profileSep} />

                <button className={`${styles.profileItem} ${styles.profileItemDanger}`} type="button" role="menuitem" onClick={handleLogout}>
                  <ion-icon name="log-out-outline" suppressHydrationWarning></ion-icon>
                  {es ? 'Cerrar sesión' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className={styles.searchDropdown}>
          <div className={styles.searchDropdownInner}>
            <div className={styles.searchDropdownInput}>
              <ion-icon name="search-outline" className={styles.searchDropdownIcon} suppressHydrationWarning></ion-icon>
              <input
                type="text"
                placeholder={t('header.buscarCorto')}
                className={styles.searchDropdownInputField}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className={styles.searchDropdownBtn} onClick={handleSearch} type="button">
                {t('header.buscarBtn')}
              </button>
            </div>
            <div className={styles.searchFilters}>
              {filters.map((f) => (
                <button key={f.value} className={styles.filterChip} type="button">{t(f.label)}</button>
              ))}
            </div>
            {renderResults()}
          </div>
        </div>
      )}
    </>
  );
}
