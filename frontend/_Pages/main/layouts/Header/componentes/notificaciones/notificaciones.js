'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './notificaciones.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import {
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  responderSolicitud,
} from '@/_Extras/Notificaciones/api.js';

const LOCAL_KEY = 'pkp_notif_leidas';

function leerLocales() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function guardarLocales(ids) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify([...new Set(ids)].slice(-300))); } catch { /* noop */ }
}

function relTime(dateStr, es) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return es ? 'hace un momento' : 'just now';
  if (min < 60) return es ? `hace ${min} min` : `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return es ? `hace ${d} d` : `${d} d ago`;
  return new Date(dateStr).toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'short' });
}

export default function Notificaciones() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [busy, setBusy] = useState(null);
  const wrapRef = useRef(null);

  const key = authed ? userKey : '';

  const load = useCallback(async () => {
    const j = await getNotificaciones(key);
    const locales = leerLocales();
    const data = (j.data || []).map((n) => ({
      ...n,
      leida: !!n.leida || locales.includes(n.id),
    }));
    if (authed) {
      setItems(data);
      setNoLeidas(j.noLeidas || 0);
    } else {
      const pend = data.filter((n) => !n.leida).length;
      setItems(data);
      setNoLeidas(pend);
    }
  }, [key, authed]);

  useEffect(() => { load(); }, [load]);

  // Refresca al abrir, cada 25s y cuando hay cambios en la app.
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('pikantepe:change', onChange);
    window.addEventListener('pkp:me', onChange);
    const iv = setInterval(load, 25000);
    return () => {
      window.removeEventListener('pikantepe:change', onChange);
      window.removeEventListener('pkp:me', onChange);
      clearInterval(iv);
    };
  }, [load]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function abrir() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  async function onItem(n) {
    if (!n.leida) {
      if (authed) await marcarLeida(n.id, key);
      else guardarLocales([...leerLocales(), n.id]);
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      setNoLeidas((c) => Math.max(0, c - 1));
    }
    if (n.url) {
      setOpen(false);
      router.push(n.url);
    }
  }

  async function onTodas() {
    if (!items.length) return;
    if (authed) await marcarTodasLeidas(key);
    else guardarLocales([...leerLocales(), ...items.map((n) => n.id)]);
    setItems((cur) => cur.map((x) => ({ ...x, leida: true })));
    setNoLeidas(0);
  }

  async function onResponder(n, estado) {
    const comunidadId = n.meta?.comunidad_id;
    const solId = n.meta?.sol_id;
    if (!comunidadId || !solId) return;
    setBusy(`${n.id}-${estado}`);
    const ok = await responderSolicitud(comunidadId, solId, key, estado);
    setBusy(null);
    if (ok) {
      setItems((cur) => cur.map((x) => (x.id === n.id
        ? { ...x, titulo: estado === 'aprobado' ? (es ? 'Solicitud aceptada' : 'Request accepted') : (es ? 'Solicitud rechazada' : 'Request rejected'), meta: { ...x.meta, sol_id: null } }
        : x)));
    }
  }

  const badge = noLeidas > 99 ? '99+' : String(noLeidas);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={abrir}
        aria-label={es ? 'Notificaciones' : 'Notifications'}
        aria-expanded={open}
      >
        <ion-icon name={noLeidas > 0 ? 'notifications' : 'notifications-outline'} className={styles.bellIcon} suppressHydrationWarning></ion-icon>
        {noLeidas > 0 && <span className={styles.badge}>{badge}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label={es ? 'Notificaciones' : 'Notifications'}>
          <div className={styles.head}>
            <h3 className={styles.title}>{es ? 'Notificaciones' : 'Notifications'}</h3>
            {noLeidas > 0 && (
              <button type="button" className={styles.markAll} onClick={onTodas}>
                {es ? 'Marcar todas' : 'Mark all'}
              </button>
            )}
          </div>

          <div className={styles.list}>
            {items.length === 0 && (
              <p className={styles.empty}>
                {es ? 'No tienes notificaciones por ahora.' : 'You have no notifications yet.'}
              </p>
            )}
            {items.map((n) => {
              const esSolicitud = n.tipo === 'solicitud' && n.meta?.sol_id;
              return (
                <div key={n.id} className={`${styles.item} ${n.leida ? '' : styles.itemNew}`}>
                  <button type="button" className={styles.itemMain} onClick={() => onItem(n)}>
                    <span className={styles.iconWrap}>
                      {n.actor_avatar
                        ? <img src={mediaUrl(n.actor_avatar)} alt="" className={styles.actor} />
                        : <ion-icon name={n.icono || 'notifications-outline'} className={styles.icon} suppressHydrationWarning></ion-icon>}
                    </span>
                    <span className={styles.body}>
                      {n.tipo === 'admin' && (n.actor_nombre || n.actor_avatar) && (
                        <span className={styles.itemAuthor}>
                          {n.actor_nombre || (es ? 'Administrador' : 'Admin')}
                          <ion-icon name="checkmark-circle" className={styles.verified} suppressHydrationWarning></ion-icon>
                        </span>
                      )}
                      <span className={styles.itemTitle}>{n.titulo}</span>
                      {n.texto && <span className={styles.itemText}>{n.texto}</span>}
                      <span className={styles.itemTime}>{relTime(n.created_at, es)}</span>
                    </span>
                    {!n.leida && <span className={styles.dot} />}
                  </button>

                  {esSolicitud && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.accept}
                        disabled={busy === `${n.id}-aprobado`}
                        onClick={() => onResponder(n, 'aprobado')}
                      >
                        {es ? 'Aceptar' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className={styles.reject}
                        disabled={busy === `${n.id}-rechazado`}
                        onClick={() => onResponder(n, 'rechazado')}
                      >
                        {es ? 'Rechazar' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
