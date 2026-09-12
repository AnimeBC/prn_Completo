'use client';

import { API_URL } from '@/_Extras/Api/api.js';

const KEY = 'pkp_user_key';

/** identificador de dispositivo/visitante (funciona sin login) */
export function getUserKey() {
  if (typeof window === 'undefined') return '';
  try {
    let k = localStorage.getItem(KEY);
    if (!k) {
      k = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return '';
  }
}

async function api(path, options = {}) {
  try {
    const r = await fetch(`${API_URL}${path}`, options);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export const getInteractions = (id) =>
  api(`/api/videos/${id}/interactions?userKey=${encodeURIComponent(getUserKey())}`);

export const likeVideo = (id, tipo) => post(`/api/videos/${id}/like`, { userKey: getUserKey(), tipo });
export const viewVideo = (id) => post(`/api/videos/${id}/view`, { userKey: getUserKey() });
export const saveVideo = (id) => post(`/api/videos/${id}/save`, { userKey: getUserKey() });
export const reportVideo = (id, motivo, detalle) => post(`/api/videos/${id}/report`, { userKey: getUserKey(), motivo, detalle });
export const downloadVideo = (id) => post(`/api/videos/${id}/download`, { userKey: getUserKey() });
export const shareVideo = (id, red) => post(`/api/videos/${id}/share`, { userKey: getUserKey(), red });
export const followChannel = (channel) => post('/api/channels/follow', { userKey: getUserKey(), channel });
