'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import styles from './pwa.module.css';

const PwaContext = createContext({ canInstall: false, promptInstall: () => {} });

export function PwaProvider({ children }) {
  const [deferred, setDeferred] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Registra el Service Worker (necesario para ser instalable)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // Captura el evento de instalación (Android/Chrome/Edge)
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    };
    const onInstalled = () => { setCanInstall(false); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setCanInstall(false);
  }

  return (
    <PwaContext.Provider value={{ canInstall, promptInstall }}>
      {children}
      {canInstall && !dismissed && (
        <button className={styles.installBtn} type="button" onClick={promptInstall} title="Instalar aplicación">
          <ion-icon name="download-outline" suppressHydrationWarning></ion-icon>
          Instalar app
        </button>
      )}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  return useContext(PwaContext);
}

export default PwaProvider;
