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
  const h = Math.floor(diff / 3600000);
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
    const onChange = (e) => {
      // La presencia no afecta las notificaciones: no recargar en cada latido.
      if (String(e?.detail?.type || '') === 'comunidad_presencia') return;
      load();
    };
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
    // En celular las notificaciones son una página completa.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      router.push('/notificaciones');
      return;
    }
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
    // Las solicitudes de amistad llevan al perfil del solicitante.
    if (n.tipo === 'amistad' && (n.meta?.de || n.actor_key)) {
      irAPerfil(n.meta?.de || n.actor_key);
      return;
    }
    if (n.url) {
      setOpen(false);
      router.push(irADestino(n) || '/chat');
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

  // Navega al perfil publico del usuario: resuelve su slug de canal.
  async function irAPerfil(actorKey) {
    if (!actorKey) return;
    setOpen(false);
    const r = await apiComunidad.canalSlug(actorKey);
    if (r?.slug) router.push(`/canal/${r.slug}`);
    else router.push(`/chat?dm=${encodeURIComponent(actorKey)}`);
  }

  // Aceptar / rechazar una solicitud de amistad desde la notificacion.
  async function onAmistad(n, estado) {
    const de = n.meta?.de || n.actor_key;
    if (!de || !key) return;
    setBusy(`${n.id}-${estado}`);
    // "cancelar" elimina la solicitud; "aceptar" la confirma.
    const accion = estado === 'aceptar' ? 'aceptar' : 'cancelar';
    const r = await apiComunidad.amistadAccion(de, key, accion);
    setBusy(null);
    if (r?.error) { setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, accion: null } : x))); return; }

    if (estado === 'aceptar') {
      // Marca esta como resuelta (sin botones de pendiente) sin esperar recarga.
      setItems((cur) => cur.map((x) => (x.id === n.id
        ? { ...x, titulo: es ? 'Solicitud aceptada' : 'Request accepted', meta: { ...x.meta, resuelta: true } }
        : x)));
    } else {
      // Cancelada: queda como registro (solo ver perfil), sin botones.
      setItems((cur) => cur.map((x) => (x.id === n.id
        ? { ...x, titulo: es ? 'Solicitud cancelada' : 'Request cancelled', meta: { ...x.meta, resuelta: true, cancelada: true } }
        : x)));
    }
    // Releer del servidor para reflejar el estado real (Redis ya aviso al otro lado).
    load();
  }

  // Estilo Facebook: por cada persona, SOLO la notificacion de amistad mas
  // reciente lleva acciones. Las anteriores quedan como historial (sin botones).
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
              const actorKey = n.meta?.de || n.actor_key || null;
              const esSolicitud = n.tipo === 'solicitud' && n.meta?.sol_id;
              const esAmistad = n.tipo === 'amistad' && !!actorKey;
              // Solo la mas reciente de cada persona lleva acciones.
              const esRecienteDeActor = esAmistad && amistadReciente.get(actorKey)?.id === n.id;
              const tituloLower = String(n.titulo || '').toLowerCase();
              const esCancelada = tituloLower.includes('cancelad');
              const esPendiente = esAmistad
                && tituloLower.includes('solicitud')
                && !/aceptad|rechazad|cancelad/i.test(tituloLower)
                && !n.meta?.resuelta;
              // Accionable: la mas reciente Y sigue pendiente.
              const esAmistadPendiente = esRecienteDeActor && esPendiente;
              // Cancelada (mas reciente): solo ver perfil.
              const esAmistadCancelada = esRecienteDeActor && esAmistad && esCancelada;
              // Aceptada (mas reciente): ver perfil / enviar mensaje.
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

                  {esAmistadPendiente && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.accept}
                        disabled={busy === `${n.id}-aceptar`}
                        onClick={() => onAmistad(n, 'aceptar')}
                      >
                        {es ? 'Aceptar' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className={styles.reject}
                        disabled={busy === `${n.id}-cancelar`}
                        onClick={() => onAmistad(n, 'cancelar')}
                      >
                        {es ? 'Cancelar' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        className={styles.profile}
                        onClick={() => irAPerfil(actorKey)}
                      >
                        {es ? 'Ver perfil' : 'View profile'}
                      </button>
                    </div>
                  )}

                  {esAmistadCancelada && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.profile}
                        onClick={() => irAPerfil(actorKey)}
                      >
                        {es ? 'Ver perfil' : 'View profile'}
                      </button>
                    </div>
                  )}

                  {esAmistadResuelta && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.profile}
                        onClick={() => irAPerfil(actorKey)}
                      >
                        {es ? 'Ver perfil' : 'View profile'}
                      </button>
                      <button
                        type="button"
                        className={styles.accept}
                        onClick={() => { setOpen(false); router.push(`/chat?dm=${encodeURIComponent(actorKey)}`); }}
                      >
                        {es ? 'Enviar mensaje' : 'Send message'}
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
