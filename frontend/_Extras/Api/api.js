export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
