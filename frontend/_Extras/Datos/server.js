/**
 * Helpers de datos para Server Components (App Router).
 * Todo se jala de la API (PostgreSQL), ya no del JSON.
 */
export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function mediaUrl(p) {
  if (!p) return p;
  return String(p).startsWith('/media/') ? `${API}${p}` : p;
}

/** "09/2026" a partir de una fecha */
export function sinceOf(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function apiGet(path) {
  try {
    const r = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** listas completas para sitemap / server pages */
export async function getContenidoServer() {
  const [videos, hentai, packs] = await Promise.all([
    apiGet('/api/videos?limit=200'),
    apiGet('/api/hentai'),
    apiGet('/api/packs'),
  ]);
  return {
    videos: videos?.data || [],
    hentai: hentai?.data || [],
    packs: packs?.data || [],
  };
}
