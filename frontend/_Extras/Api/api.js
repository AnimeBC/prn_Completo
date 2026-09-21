// URL del backend. Por defecto la de .env, pero si abres la app desde la red
// local (celular: http://192.168.0.100:3000) se usa el MISMO host con el puerto
// 3001, porque "localhost" en el celular apunta al celular, no a la PC.
// Si NEXT_PUBLIC_API_URL apunta a un host remoto real (produccion) se respeta.
function resolveApiUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  if (typeof window === 'undefined') return fromEnv;
  try {
    const { hostname, protocol } = window.location;
    const esLocal = hostname === 'localhost' || hostname === '127.0.0.1' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    if (!esLocal) return fromEnv;
    // Si el env ya apunta a un host remoto (no local), se respeta (produccion).
    const envHost = (fromEnv.match(/^https?:\/\/([^/:]+)/i) || [])[1] || '';
    const envEsLocal = envHost === 'localhost' || envHost === '127.0.0.1' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(envHost);
    if (!envEsLocal) return fromEnv;
    const port = process.env.NEXT_PUBLIC_API_PORT || '3001';
    return `${protocol}//${hostname}:${port}`;
  } catch {
    return fromEnv;
  }
}

export const API_URL = resolveApiUrl();

/** token del admin guardado en login */
export function adminToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('pkp_admin_token') || sessionStorage.getItem('pkp_admin_token') || '';
}

/** convierte una ruta /media/... en URL absoluta del backend */
export function mediaUrl(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_URL}${p.startsWith('/') ? '' : '/'}${p}`;
}

export function authHeaders(extra = {}) {
  const t = adminToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}
