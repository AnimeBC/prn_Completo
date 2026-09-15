import { getContenidoServer } from '@/_Extras/Datos/server.js';

const BASE = 'https://pikantepe.com';

export default async function sitemap() {
  const data = await getContenidoServer();

  const staticRoutes = [
    '',
    '/videos',
    '/tendencias',
    '/fetiches',
    '/packs',
    '/comunidad',
    '/hentai',
  ].map((route) => ({
    url: `${BASE}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: route === '' ? 1 : 0.8,
  }));

  const videoRoutes = (data.videos || []).map((v) => ({
    url: `${BASE}/videos/${v.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const feticheRoutes = (data.videos || [])
    .filter((v) => v.is_fetiche)
    .map((f) => ({
      url: `${BASE}/videos/fetiches/${f.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  const hentaiRoutes = (data.hentai || []).map((h) => ({
    url: `${BASE}/hentai/${h.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const packRoutes = (data.packs || []).map((p) => ({
    url: `${BASE}/packs/${p.public_id || p.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...videoRoutes, ...feticheRoutes, ...hentaiRoutes, ...packRoutes];
}
