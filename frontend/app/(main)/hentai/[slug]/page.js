import HentaiPlayer from '@/_Pages/main/Hentai/hentaiPlayer';
import { apiGet, mediaUrl, sinceOf } from '@/_Extras/Datos/server.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

async function resolveEntry(slug) {
  const r = await apiGet(`/api/hentai/${encodeURIComponent(slug)}`);
  if (!r || !r.id) return null;
  const capitulos = (r.capitulos || []).map((c) => ({
    id: c.id,
    numero: c.numero,
    titulo_es: c.titulo_es,
    titulo_en: c.titulo_en,
    fuentes: (c.fuentes || []).map((f) => ({
      id: f.id,
      modo: f.modo,
      src: mediaUrl(f.src),
      thumb: f.thumb ? mediaUrl(f.thumb) : '',
      duracion: f.duracion || '00:00',
      renditions: Array.isArray(f.renditions) ? f.renditions.map((x) => ({ label: x.label, src: mediaUrl(x.src) })) : [],
    })),
  }));
  return {
    id: r.id,
    slug: r.slug || String(r.id),
    title: r.titulo_es || r.titulo_en,
    titleEs: r.titulo_es || '',
    titleEn: r.titulo_en || '',
    titulo_es: r.titulo_es || '',
    titulo_ja: r.titulo_ja || '',
    titulo_en: r.titulo_en || '',
    titulo_romaji: r.titulo_romaji || '',
    viewsFull: `${Number(r.vistas || 0).toLocaleString('es-PE')} vistas`,
    date: r.created_at,
    channel: r.canal,
    since: sinceOf(r.created_at),
    tags: r.tags || [],
    desc: r.desc_es || r.desc_en,
    thumb: mediaUrl(r.cover || r.thumb),
    tipo: r.tipo || '',
    anio: r.anio || null,
    temporada: r.temporada || '',
    estado: r.estado || '',
    rating: Number(r.rating || 0),
    votos: Number(r.votos || 0),
    modos: r.modos || {},
    titulos_extras: r.titulos_extras || [],
    capitulos,
  };
}

function toInfo(entry) {
  if (!entry) return null;
  return { title: entry.title, titleEs: entry.titleEs || '', titleEn: entry.titleEn || '', views: entry.viewsFull, date: entry.date, channel: entry.channel, since: entry.since, tags: entry.tags, desc: entry.desc };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = await resolveEntry(slug);
  if (!entry) return { title: 'Hentai' };
  const title = entry.title;
  const resumen = (entry.desc || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const description =
    resumen ||
    `${entry.viewsFull || ''} • ${entry.channel || ''}`.trim() ||
    `Mira ${title} en pikante pe`;
  return {
    title,
    description,
    keywords: entry.tags,
    alternates: { canonical: `/hentai/${entry.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/hentai/${entry.slug}`,
      image: entry.thumb,
      imageAlt: title,
      type: 'video.tv_show',
    }),
    twitter: buildTwitter({ title, description, image: entry.thumb }),
  };
}

export default async function HentaiSeriePage({ params }) {
  const { slug } = await params;
  const entry = await resolveEntry(slug);

  return (
    <>

      <HentaiPlayer
          hentaiId={entry?.id || slug}
          slug={entry?.slug || slug}
          info={toInfo(entry)}
          serie={entry}
          capitulos={entry?.capitulos || []}
        />
    </>
  );
}
