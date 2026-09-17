// Helpers de la sección Comunidad (red social interna).
import { API_URL, mediaUrl, authHeaders } from '@/_Extras/Api/api.js';

const API = API_URL;

/** URL de un archivo de comunidad (/media/... -> absoluta). */
export function comunidadMedia(p) {
  return mediaUrl(p);
}

async function req(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { cache: 'no-store', ...opts });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || 'Error de red' };
    return j;
  } catch {
    return { error: 'Sin conexión con el servidor' };
  }
}

const jsonPost = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const apiComunidad = {
  // Feed
  feed: (filtro = 'recientes', userKey = '', grupo = null) => {
    const p = new URLSearchParams({ filtro });
    if (userKey) p.set('userKey', userKey);
    if (grupo) p.set('grupo', String(grupo));
    return req(`/api/comunidad/feed?${p.toString()}`);
  },
  crearPost: (fd) => req('/api/comunidad/posts', { method: 'POST', headers: authHeaders(), body: fd }),
  like: (id, userKey) => req(`/api/comunidad/posts/${id}/like`, jsonPost({ userKey })),
  guardar: (id, userKey) => req(`/api/comunidad/posts/${id}/save`, jsonPost({ userKey })),
  compartir: (id) => req(`/api/comunidad/posts/${id}/share`, { method: 'POST' }),
  comentarios: (id) => req(`/api/comunidad/posts/${id}/comments`),
  comentar: (id, userKey, texto) => req(`/api/comunidad/posts/${id}/comments`, jsonPost({ userKey, texto })),
  borrarPost: (id) => req(`/api/comunidad/posts/${id}`, { method: 'DELETE' }),

  // Historias
  stories: () => req('/api/comunidad/stories'),
  subirStory: (fd) => req('/api/comunidad/stories', { method: 'POST', headers: authHeaders(), body: fd }),
  /** Sube con progreso (0-100) y permite cancelar con xhr.abort(). */
  subirStoryXHR: (fd, onProgress) => {
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve) => {
      xhr.open('POST', `${API}/api/comunidad/stories`);
      const t = authHeaders();
      if (t.Authorization) xhr.setRequestHeader('Authorization', t.Authorization);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* noop */ }
        const ok = xhr.status >= 200 && xhr.status < 300;
        resolve(ok ? { ok: true, ...j } : { error: (j && j.error) || 'Error al subir' });
      };
      xhr.onerror = () => resolve({ error: 'Sin conexión con el servidor' });
      xhr.onabort = () => resolve({ aborted: true });
      xhr.send(fd);
    });
    return { xhr, promise };
  },
  verStory: (id, userKey) => req(`/api/comunidad/stories/${id}/view`, jsonPost({ userKey })),
  reaccionarStory: (id, userKey, emoji = '', texto = '') => req(`/api/comunidad/stories/${id}/reaccion`, jsonPost({ userKey, emoji, texto })),

  // Grupos
  grupos: (userKey = '', opts = {}) => {
    const p = new URLSearchParams();
    if (userKey) p.set('userKey', userKey);
    for (const [k, v] of Object.entries(opts)) {
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    }
    const qs = p.toString();
    return req(`/api/comunidad/grupos${qs ? `?${qs}` : ''}`);
  },
  grupo: (id, userKey = '') => req(`/api/comunidad/grupos/${id}${userKey ? `?userKey=${encodeURIComponent(userKey)}` : ''}`),
  crearGrupo: (fd) => req('/api/comunidad/grupos', { method: 'POST', headers: authHeaders(), body: fd }),
  unirse: (id, userKey, mensaje = '') => req(`/api/comunidad/grupos/${id}/join`, jsonPost({ userKey, mensaje })),
  solicitudesGrupo: (id, userKey) => req(`/api/comunidad/grupos/${id}/solicitudes?userKey=${encodeURIComponent(userKey)}`),
  resolverSolicitudGrupo: (id, solId, userKey, estado) => req(`/api/comunidad/grupos/${id}/solicitudes/${solId}`, jsonPost({ userKey, estado })),

  // Chat
  mensajes: (id, userKey = '') => req(`/api/comunidad/grupos/${id}/mensajes${userKey ? `?userKey=${encodeURIComponent(userKey)}` : ''}`),
  enviarMensaje: (id, fd) => req(`/api/comunidad/grupos/${id}/mensajes`, { method: 'POST', headers: authHeaders(), body: fd }),
  reaccionarMensaje: (msjId, userKey, emoji) => req(`/api/comunidad/mensajes/${msjId}/reaccion`, jsonPost({ userKey, emoji })),

  // Presencia
  presencia: () => req('/api/comunidad/presencia'),
  latido: (userKey) => req('/api/comunidad/presencia', jsonPost({ userKey })),

  // Límite de subida del usuario
  miLimite: (userKey) => req(`/api/comunidad/mi-limite?userKey=${encodeURIComponent(userKey || '')}`),

  // Admin: usuarios y límites
  adminUsuarios: (q = '', rol = '', page = 1) => {
    const p = new URLSearchParams({ q, page: String(page) });
    if (rol) p.set('rol', rol);
    return req(`/api/comunidad/admin/usuarios?${p.toString()}`, { headers: authHeaders() });
  },
  adminGuardarUsuario: (id, subida_mb) => req(`/api/comunidad/admin/usuarios/${id}`, {
    method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ subida_mb }),
  }),

  // Reportes
  reportar: (body) => req('/api/comunidad/reportes', jsonPost(body)),

  // Admin
  adminResumen: () => req('/api/comunidad/admin/resumen', { headers: authHeaders() }),
  adminGrupos: () => req('/api/comunidad/admin/grupos', { headers: authHeaders() }),
  adminSolicitudes: (estado = '') => req(`/api/comunidad/admin/solicitudes${estado ? `?estado=${estado}` : ''}`, { headers: authHeaders() }),
  adminResolverSolicitud: (id, estado) => req(`/api/comunidad/admin/solicitudes/${id}`, {
    method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ estado }),
  }),
  adminGuardarGrupo: (id, body) => req(`/api/comunidad/admin/grupos/${id}`, {
    method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  }),
  adminPosts: (q = '', grupo = null, page = 1) => {
    const p = new URLSearchParams({ q, page: String(page) });
    if (grupo) p.set('grupo', String(grupo));
    return req(`/api/comunidad/admin/posts?${p.toString()}`, { headers: authHeaders() });
  },
  adminBorrarPost: (id) => req(`/api/comunidad/admin/posts/${id}`, { method: 'DELETE', headers: authHeaders() }),
  adminMensajes: (q = '', grupo = null) => {
    const p = new URLSearchParams({ q });
    if (grupo) p.set('grupo', String(grupo));
    return req(`/api/comunidad/admin/mensajes?${p.toString()}`, { headers: authHeaders() });
  },
  adminBorrarMensaje: (id) => req(`/api/comunidad/admin/mensajes/${id}`, { method: 'DELETE', headers: authHeaders() }),
  adminStories: () => req('/api/comunidad/admin/stories', { headers: authHeaders() }),
  adminBorrarStory: (id) => req(`/api/comunidad/admin/stories/${id}`, { method: 'DELETE', headers: authHeaders() }),
  adminReportes: (estado = '') => req(`/api/comunidad/admin/reportes${estado ? `?estado=${estado}` : ''}`, { headers: authHeaders() }),
  adminResolverReporte: (id, body) => req(`/api/comunidad/admin/reportes/${id}`, {
    method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  }),
};

/** Comprime imágenes en el navegador (calidad moderada) antes de subirlas. */
export async function comprimirImagen(file, maxW = 1280, quality = 0.82) {
  if (!file || !/^image\//.test(file.type) || /gif/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
