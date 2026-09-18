'use client';

import { API_URL } from '@/_Extras/Api/api.js';

/** Notificaciones del usuario (o avisos del admin si no hay cuenta). */
export async function getNotificaciones(userKey, limit = 30) {
  const qs = userKey
    ? `?userKey=${encodeURIComponent(userKey)}&limit=${limit}`
    : `?limit=${limit}`;
  try {
    const r = await fetch(`${API_URL}/api/notificaciones${qs}`);
    if (!r.ok) return { data: [], noLeidas: 0 };
    return await r.json();
  } catch {
    return { data: [], noLeidas: 0 };
  }
}

export async function marcarLeida(id, userKey) {
  if (!userKey) return;
  try {
    await fetch(`${API_URL}/api/notificaciones/${id}/leer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey }),
    });
  } catch { /* noop */ }
}

export async function marcarTodasLeidas(userKey) {
  if (!userKey) return;
  try {
    await fetch(`${API_URL}/api/notificaciones/leer-todas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey }),
    });
  } catch { /* noop */ }
}

/** Aceptar / rechazar una solicitud de grupo desde la notificación. */
export async function responderSolicitud(comunidadId, solicitudId, userKey, estado) {
  try {
    const r = await fetch(`${API_URL}/api/comunidad/grupos/${comunidadId}/solicitudes/${solicitudId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, estado }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
