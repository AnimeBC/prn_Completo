'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLanguage } from '@/_Extras/Idioma/LanguageProvider.js';
import { API_URL } from '@/_Extras/Api/api.js';

const ContenidoContext = createContext(null);

/* ---------- helpers de formato ---------- */
function media(p) {
  if (!p) return p;
  // las rutas /media/... las sirve el backend; /videos/... son del frontend
  return String(p).startsWith('/media/') ? `${API_URL}${p}` : p;
}
function fmtViews(n, es) {
  const num = Number(n) || 0;
  const suf = es ? 'vistas' : 'views';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace('.0', '')}M ${suf}`;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace('.0', '')}K ${suf}`;
  return `${num} ${suf}`;
}
function fmtViewsFull(n, es) {
  const num = Number(n) || 0;
  return `${num.toLocaleString(es ? 'es-PE' : 'en-US')} ${es ? 'vistas' : 'views'}`;
}
function relTime(dateStr, es) {
  if (!dateStr) return es ? 'hace un momento' : 'just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return es ? 'hace un momento' : 'just now';
  if (min < 60) return es ? `hace ${min} min` : `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return es ? `hace ${h} hora${h > 1 ? 's' : ''}` : `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return es ? `hace ${d} día${d > 1 ? 's' : ''}` : `${d} day${d > 1 ? 's' : ''} ago`;
  const w = Math.floor(d / 7);
  return es ? `hace ${w} semana${w > 1 ? 's' : ''}` : `${w} week${w > 1 ? 's' : ''} ago`;
}
function fmtDate(dateStr, es) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(es ? 'es-PE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtSince(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/* ---------- adaptadores DB -> forma del frontend ---------- */
function mapVideo(r, es) {
  return {
    id: r.id,
    title: r.titulo_es || r.titulo_en || `Video #${r.id}`,
    titleEn: r.titulo_en,
    channel: r.canal || 'administrador pikante.pe',
    views: fmtViews(r.vistas, es),
    viewsFull: fmtViewsFull(r.vistas, es),
    date: fmtDate(r.publicado_en || r.created_at, es),
    time: relTime(r.created_at, es),
    duration: r.duracion || '00:00',
    since: fmtSince(r.created_at),
    tags: r.tags || [],
    desc: es ? (r.desc_es || '') : (r.desc_en || r.desc_es || ''),
    descEn: r.desc_en,
    src: media(r.src),
    download: media(r.descarga || r.src),
    thumb: media(r.thumb),
    isFetiche: !!r.is_fetiche,
    feticheCategoria: r.fetiche_categoria || '',
    isTendencia: !!r.is_tendencia,
  };
}
function mapHentai(r, es) {
  return {
    id: r.id,
    slug: r.slug || '',
    title: r.titulo_es || r.titulo_en || `Anime #${r.id}`,
    channel: r.canal || 'Studio Kitsune',
    views: fmtViews(r.vistas, es),
    viewsFull: fmtViewsFull(r.vistas, es),
    date: fmtDate(r.created_at, es),
    time: relTime(r.created_at, es),
    duration: r.duracion || '00:00',
    since: fmtSince(r.created_at),
    tags: r.tags || [],
    chapters: r.capitulos || 0,
    desc: es ? (r.desc_es || '') : (r.desc_en || r.desc_es || ''),
    src: media(r.src),
    thumb: media(r.thumb),
    cover: media(r.cover || r.thumb),
  };
}
function mapPack(r, es) {
  const suf = es ? 'vistas' : 'views';
  const dsuf = es ? 'descargas' : 'downloads';
  return {
    id: r.id,
    public_id: r.public_id,
    slug: r.slug,
    title: es
      ? (r.titulo_es || r.titulo_en || r.titulo || `Pack #${r.id}`)
      : (r.titulo_en || r.titulo_es || r.titulo || `Pack #${r.id}`),
    titulo_es: r.titulo_es || r.titulo || '',
    titulo_en: r.titulo_en || r.titulo || '',
    uploader: r.uploader,
    fotos: r.fotos,
    videos: r.videos,
    views: `${r.vistas || 0} ${suf}`,
    descargas: `${r.descargas || 0} ${dsuf}`,
    precio: r.precio,
    download: r.download,
    thumb: r.thumb ? media(r.thumb) : '',
    desc: es ? (r.desc_es || '') : (r.desc_en || r.desc_es || ''),
    tags: r.tags || [],
  };
}
function mapCommunity(r, es) {
  return {
    id: r.id,
    title: r.titulo,
    views: fmtViews(r.vistas, es),
    time: relTime(r.created_at, es),
    duration: r.duracion || '00:00',
    tags: r.tags || [],
    src: media(r.src),
    thumb: media(r.thumb),
  };
}
function mapLive(r) {
  return { id: r.id, name: r.nombre, viewers: r.viewers || 0, tags: r.tags || [], thumb: media(r.thumb) };
}

async function getJson(path) {
  try {
    const r = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const EMPTY = { videos: [], hentai: [], packs: [], community: [], lives: [], feticheCategorias: [] };

export function ContenidoProvider({ children }) {
  const { locale } = useLanguage();
  const es = locale !== 'en';
  const [data, setData] = useState(EMPTY);

  const load = useCallback(async () => {
    const [vids, hent, packs, comm, lives, cats] = await Promise.all([
      getJson('/api/videos?limit=200'),
      getJson('/api/hentai'),
      getJson('/api/packs'),
      getJson('/api/community'),
      getJson('/api/lives'),
      getJson('/api/fetiche-categorias'),
    ]);

    setData({
      videos: (vids?.data || []).map((r) => mapVideo(r, es)),
      hentai: (hent?.data || []).map((r) => mapHentai(r, es)),
      packs: (packs?.data || []).map((r) => mapPack(r, es)),
      community: (comm?.data || []).map((r) => mapCommunity(r, es)),
      lives: (lives?.data || []).map(mapLive),
      feticheCategorias: cats?.data || [],
      updatedAt: Date.now(),
    });
  }, [es]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('pikantepe:change', onChange);
    return () => window.removeEventListener('pikantepe:change', onChange);
  }, [load]);

  return <ContenidoContext.Provider value={data}>{children}</ContenidoContext.Provider>;
}

export function useContenido() {
  const ctx = useContext(ContenidoContext);
  return ctx || EMPTY;
}

export default ContenidoProvider;
