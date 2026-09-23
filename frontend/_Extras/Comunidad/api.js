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
const jsonPut = (body) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const jsonDelete = (body) => ({
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

/** POST multipart con progreso (XHR). Resuelve { ...json } o { error }. */
function xhrSend(path, fd, onProgress) {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}${path}`);
      const t = authHeaders();
      if (t.Authorization) xhr.setRequestHeader('Authorization', t.Authorization);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* noop */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(j);
        else resolve({ error: j.error || 'No se pudo enviar' });
      };
      xhr.onerror = () => resolve({ error: 'Sin conexión con el servidor' });
      xhr.onabort = () => resolve({ error: 'Subida cancelada' });
      xhr.send(fd);
    } catch {
      resolve({ error: 'Sin conexión con el servidor' });
    }
  });
}

export const apiComunidad = {
  // Temas (diseños del chat entre amigos)
  temas: () => req('/api/comunidad/temas'),
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
  /** Miembros del grupo con su presencia (edad en segundos desde la BD). */
  gruposMiembros: (id) => req(`/api/comunidad/grupos/${id}/miembros`),
  crearGrupo: (fd) => req('/api/comunidad/grupos', { method: 'POST', headers: authHeaders(), body: fd }),
  unirse: (id, userKey, mensaje = '', accion = '') => req(`/api/comunidad/grupos/${id}/join`, jsonPost({ userKey, mensaje, accion })),
  grupoAvatar: (id, userKey, file) => {
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('avatar', file);
    return req(`/api/comunidad/grupos/${id}/avatar`, { method: 'POST', body: fd });
  },
  grupoBanner: (id, userKey, file) => {
    const fd = new FormData();
    fd.append('userKey', userKey);
    fd.append('banner', file);
    return req(`/api/comunidad/grupos/${id}/banner`, { method: 'POST', body: fd });
  },
  solicitudesGrupo: (id, userKey) => req(`/api/comunidad/grupos/${id}/solicitudes?userKey=${encodeURIComponent(userKey)}`),
  resolverSolicitudGrupo: (id, solId, userKey, estado) => req(`/api/comunidad/grupos/${id}/solicitudes/${solId}`, jsonPost({ userKey, estado })),

  // Chat
  mensajes: (id, userKey = '', opts = {}) => {
    const p = new URLSearchParams();
    if (userKey) p.set('userKey', userKey);
    if (opts.before) p.set('before', String(opts.before));
    if (opts.limit) p.set('limit', String(opts.limit));
    const qs = p.toString();
    return req(`/api/comunidad/grupos/${id}/mensajes${qs ? `?${qs}` : ''}`);
  },
  enviarMensaje: (id, fd) => req(`/api/comunidad/grupos/${id}/mensajes`, { method: 'POST', headers: authHeaders(), body: fd }),
  enviarMensajeXHR: (id, fd, onProgress) => xhrSend(`/api/comunidad/grupos/${id}/mensajes`, fd, onProgress),
  editarMensaje: (id, msjId, userKey, texto) => req(`/api/comunidad/grupos/${id}/mensajes/${msjId}`, jsonPut({ userKey, texto })),
  eliminarMensaje: (id, msjId, userKey, paraTodos = false) => req(`/api/comunidad/grupos/${id}/mensajes/${msjId}`, jsonDelete({ userKey, paraTodos })),
  reaccionarMensaje: (msjId, userKey, emoji) => req(`/api/comunidad/mensajes/${msjId}/reaccion`, jsonPost({ userKey, emoji })),
  /** Bandeja estilo Messenger: conversaciones (grupos) del usuario. */
  chats: (userKey) => req(`/api/comunidad/chats?userKey=${encodeURIComponent(userKey)}`),
  /** Sala de llamada grupal activa del grupo (o null). */
  llamadaGrupoActiva: (id) => req(`/api/calls/grupo/${id}/activa`),
  /** Slug del canal publico de un usuario (para enlazar /canal/<slug>). */
  canalSlug: (userKey) => req(`/api/comunidad/canal-slug/${encodeURIComponent(userKey)}`),
  marcarChatLeido: (id, userKey) => req(`/api/comunidad/chats/${id}/leido`, jsonPost({ userKey })),
  /** Mensajes directos (1 a 1). */
  dmChats: (userKey) => req(`/api/comunidad/dm/chats?userKey=${encodeURIComponent(userKey)}`),
  dmMensajes: (otroKey, userKey, before = null, limit = null) => {
    const p = new URLSearchParams({ userKey });
    if (before) p.set('before', String(before));
    if (limit) p.set('limit', String(limit));
    return req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes?${p.toString()}`);
  },
  dmEnviar: (otroKey, userKey, texto, replyTo = null) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes`, jsonPost({ userKey, texto, reply_to: replyTo || undefined })),
  dmEnviarFd: (otroKey, fd) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes`, { method: 'POST', body: fd }),
  dmEnviarXHR: (otroKey, fd, onProgress) => xhrSend(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes`, fd, onProgress),
  dmApodo: (otroKey, userKey, miApodo, suApodo) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/apodo`, jsonPut({ userKey, miApodo, suApodo })),
  dmTema: (otroKey, userKey, tema = {}) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/tema`, jsonPost({ userKey, gradient: tema.gradient || '', color: tema.color || '', emoji: tema.emoji || '' })),
  dmEditarMensaje: (otroKey, msjId, userKey, texto) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes/${msjId}`, jsonPut({ userKey, texto })),
  dmEliminarMensaje: (otroKey, msjId, userKey, paraTodos = false) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/mensajes/${msjId}`, jsonDelete({ userKey, paraTodos })),
  dmLeido: (otroKey, userKey) => req(`/api/comunidad/dm/${encodeURIComponent(otroKey)}/leido`, jsonPost({ userKey })),
  dmReaccionar: (msjId, userKey, emoji) => req(`/api/comunidad/dm/mensajes/${msjId}/reaccion`, jsonPost({ userKey, emoji })),

  /** Buscar personas, comunidades y publicaciones (paginado). */
  buscar: (q = '', userKey = '', filtro = 'todos', page = 1, limit = 12, limits = null) => {
    const p = new URLSearchParams({ q, filtro, page: String(page), limit: String(limit) });
    if (userKey) p.set('userKey', userKey);
    if (limits) {
      if (limits.personas) p.set('limitPersonas', String(limits.personas));
      if (limits.grupos) p.set('limitGrupos', String(limits.grupos));
      if (limits.posts) p.set('limitPosts', String(limits.posts));
    }
    return req(`/api/comunidad/buscar?${p.toString()}`);
  },
  /** Buscar usuarios para escribirles. */
  buscarUsuarios: (q = '', userKey) => {
    const p = new URLSearchParams({ userKey });
    if (q) p.set('q', q);
    return req(`/api/comunidad/usuarios?${p.toString()}`);
  },
  /** Mensaje en masa a varios usuarios. */
  mensajeMasivo: (userKey, ids, texto) => req('/api/comunidad/mensajes-directos', jsonPost({ userKey, ids, texto })),

  // Amistades
  amistad: (userKey, me) => req(`/api/comunidad/amistad/${encodeURIComponent(userKey)}?me=${encodeURIComponent(me || '')}`),
  amistadAccion: (userKey, me, accion) => req(`/api/comunidad/amistad/${encodeURIComponent(userKey)}`, jsonPost({ userKey: me, accion })),
  /** Lista de amigos (amistades aceptadas) con buscador y paginado.
   *  filtro: todos | favoritos | pendientes | sugerencias */
  amigos: (userKey = '', opts = {}) => {
    const p = new URLSearchParams({ userKey });
    if (opts.q) p.set('q', opts.q);
    if (opts.page) p.set('page', String(opts.page));
    if (opts.limit) p.set('limit', String(opts.limit));
    if (opts.filtro) p.set('filtro', opts.filtro);
    return req(`/api/comunidad/amigos?${p.toString()}`);
  },

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
