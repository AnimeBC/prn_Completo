'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './notificacionesPage.module.css';
import { useAuth } from '@/_Extras/Auth/AuthProvider.js';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { mediaUrl } from '@/_Extras/Api/api.js';
import {
  getNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  responderSolicitud,
} from '@/_Extras/Notificaciones/api.js';
import { apiComunidad } from '@/_Extras/Comunidad/api.js';

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

/**
 * Responder/reaccionar en un grupo abre el chat de frente (/chat?conv=),
 * aunque la notificacion vieja guarde la url de la comunidad.
 */
function irADestino(n) {
  if ((n.tipo === 'respuesta' || n.tipo === 'reaccion') && typeof n.url === 'string' && n.url.startsWith('/comunidad?grupo=')) {
    return `/chat?conv=${encodeURIComponent(n.url.slice('/comunidad?grupo='.length))}`;
  }
  return n.url;
}

/** Página completa de notificaciones (celular). */
export default function NotificacionesPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const { userKey, authed } = useAuth();

  const [items, setItems] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const key = authed ? userKey : '';

  const load = useCallback(async () => {
    const j = await getNotificaciones(key);
    const locales = leerLocales();
    const data = (j.data || []).map((n) => ({ ...n, leida: !!n.leida || locales.includes(n.id) }));
    setItems(data);
    if (authed) setNoLeidas(j.noLeidas || 0);
    else setNoLeidas(data.filter((n) => !n.leida).length);
    setLoading(false);
  }, [key, authed]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('pikantepe:change', onChange);
    window.addEventListener('pkp:me', onChange);
    return () => {
      window.removeEventListener('pikantepe:change', onChange);
      window.removeEventListener('pkp:me', onChange);
    };
  }, [load]);

  async function onItem(n) {
    if (!n.leida) {
      if (authed) await marcarLeida(n.id, key);
      else guardarLocales([...leerLocales(), n.id]);
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      setNoLeidas((c) => Math.max(0, c - 1));
    }
    // Las notificaciones de amistad llevan al perfil del otro (o al chat).
    if (n.tipo === 'amistad' && (n.meta?.de || n.actor_key)) {
      irAPerfil(n.meta?.de || n.actor_key);
      return;
    }
    if (n.url) router.push(irADestino(n) || '/chat');
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
        ? {
            ...x,
            titulo: estado === 'aprobado' ? (es ? 'Solicitud aceptada' : 'Request accepted') : (es ? 'Solicitud rechazada' : 'Request rejected'),
            meta: { ...x.meta, sol_id: null },
          }
        : x)));
    }
  }

  // Navega al perfil publico del usuario (o a su chat directo como respaldo).
  async function irAPerfil(actorKey) {
    if (!actorKey) return;
    const r = await apiComunidad.canalSlug(actorKey);
    if (r?.slug) router.push(`/canal/${r.slug}`);
    else router.push(`/chat?dm=${encodeURIComponent(actorKey)}`);
  }

  // Aceptar / cancelar una solicitud de amistad desde la notificacion.
  async function onAmistad(n, estado) {
    const de = n.meta?.de || n.actor_key;
    if (!de || !key) return;
    setBusy(`${n.id}-${estado}`);
    const accion = estado === 'aceptar' ? 'aceptar' : 'cancelar';
    const r = await apiComunidad.amistadAccion(de, key, accion);
    setBusy(null);
    if (r?.error) return;
    setItems((cur) => cur.map((x) => (x.id === n.id
      ? {
          ...x,
          titulo: estado === 'aceptar' ? (es ? 'Solicitud aceptada' : 'Request accepted') : (es ? 'Solicitud cancelada' : 'Request cancelled'),
          meta: { ...x.meta, resuelta: true, cancelada: estado !== 'aceptar' },
        }
      : x)));
    load();
  }

  // Por persona, solo la notificacion de amistad mas reciente lleva acciones.
  const amistadReciente = (() => {
    const map = new Map();
    for (const n of items) {
      if (n.tipo !== 'amistad') continue;
      const actor = n.meta?.de || n.actor_key;
      if (!actor) continue;
      const actual = map.get(actor);
      if (!actual || new Date(n.created_at) > new Date(actual.created_at)) map.set(actor, n);
    }
    return map;
  })();

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{es ? 'Notificaciones' : 'Notifications'}</h1>
        {noLeidas > 0 && (
          <button type="button" className={styles.markAll} onClick={onTodas}>
            {es ? 'Marcar todas' : 'Mark all'}
          </button>
        )}
      </div>

      <div className={styles.list}>
        {!authed && (
          <p className={styles.empty}>{es ? 'Inicia sesión para ver tus notificaciones.' : 'Sign in to see your notifications.'}</p>
        )}
        {authed && loading && <p className={styles.empty}>{es ? 'Cargando…' : 'Loading…'}</p>}
        {authed && !loading && items.length === 0 && (
          <p className={styles.empty}>{es ? 'No tienes notificaciones por ahora.' : 'You have no notifications yet.'}</p>
        )}
        {items.map((n) => {
          const esSolicitud = n.tipo === 'solicitud' && n.meta?.sol_id;
          const actorKey = n.meta?.de || n.actor_key || null;
          const esAmistad = n.tipo === 'amistad' && !!actorKey;
          const esRecienteDeActor = esAmistad && amistadReciente.get(actorKey)?.id === n.id;
          const tituloLower = String(n.titulo || '').toLowerCase();
          const esCancelada = tituloLower.includes('cancelad');
          const esPendiente = esAmistad
            && tituloLower.includes('solicitud')
            && !/aceptad|rechazad|cancelad/i.test(tituloLower)
            && !n.meta?.resuelta;
          const esAmistadPendiente = esRecienteDeActor && esPendiente;
          const esAmistadResuelta = esRecienteDeActor && esAmistad && !esPendiente && !esCancelada;
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
                  <button type="button" className={styles.accept} disabled={busy === `${n.id}-aprobado`} onClick={() => onResponder(n, 'aprobado')}>
                    {es ? 'Aceptar' : 'Accept'}
                  </button>
                  <button type="button" className={styles.reject} disabled={busy === `${n.id}-rechazado`} onClick={() => onResponder(n, 'rechazado')}>
                    {es ? 'Rechazar' : 'Reject'}
                  </button>
                </div>
              )}

              {esAmistadPendiente && (
                <div className={styles.actions}>
                  <button type="button" className={styles.accept} disabled={busy === `${n.id}-aceptar`} onClick={() => onAmistad(n, 'aceptar')}>
                    {es ? 'Aceptar' : 'Accept'}
                  </button>
                  <button type="button" className={styles.reject} disabled={busy === `${n.id}-cancelar`} onClick={() => onAmistad(n, 'cancelar')}>
                    {es ? 'Cancelar' : 'Cancel'}
                  </button>
                  <button type="button" className={styles.profile} onClick={() => irAPerfil(actorKey)}>
                    {es ? 'Ver perfil' : 'View profile'}
                  </button>
                </div>
              )}

              {esAmistadResuelta && (
                <div className={styles.actions}>
                  <button type="button" className={styles.profile} onClick={() => irAPerfil(actorKey)}>
                    {es ? 'Ver perfil' : 'View profile'}
                  </button>
                  <button type="button" className={styles.accept} onClick={() => router.push(`/chat?dm=${encodeURIComponent(actorKey)}`)}>
                    {es ? 'Enviar mensaje' : 'Send message'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
