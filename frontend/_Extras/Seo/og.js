/**
 * Helpers de Open Graph / Twitter para todas las secciones.
 * Deja las imágenes absolutas y con los extras que los scrapers
 * (WhatsApp, Facebook, Telegram, Discord, X) necesitan para mostrar la portada.
 */
const BASE = 'https://pikantepe.com';
const DEFAULT_IMG = `${BASE}/logo.png`;

/** Convierte una ruta /media/... o relativa en URL absoluta. */
export function absUrl(u) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${BASE}${String(u).startsWith('/') ? '' : '/'}${u}`;
}

/** Imagen para Open Graph. NO declara width/height: los scrapers leen las
 *  medidas reales del archivo (declarar 1200x630 mintiendo —el logo mide
 *  2172x724— hace que algunas plataformas rechacen la imagen). */
export function ogImage(url, alt = 'pikante pe') {
  const u = absUrl(url) || DEFAULT_IMG;
  return [{ url: u, secureUrl: u, alt }];
}

/** Bloque openGraph estándar del sitio. */
export function buildOpenGraph({ title, description, url, image, imageAlt, type = 'website' } = {}) {
  return {
    type,
    locale: 'es_PE',
    siteName: 'pikante pe',
    title: title ? `${title} | pikante pe` : 'pikante pe',
    description: description || 'Videos, packs, fetiches y hentai en pikante pe.',
    url: url ? absUrl(url) : BASE,
    images: ogImage(image, imageAlt || title || 'pikante pe'),
  };
}

/** Bloque twitter estándar del sitio. */
export function buildTwitter({ title, description, image } = {}) {
  return {
    card: 'summary_large_image',
    title: title ? `${title} | pikante pe` : 'pikante pe',
    description: description || 'Videos, packs, fetiches y hentai en pikante pe.',
    images: [absUrl(image) || DEFAULT_IMG],
  };
}

export const OG_BASE = BASE;
