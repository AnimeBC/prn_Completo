import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import HentaiPlayer from '@/_Pages/main/Hentai/hentaiPlayer';
import styles from '@/app/(main)/page.module.css';
import { apiGet, mediaUrl, sinceOf } from '@/_Extras/Datos/server.js';

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
  return { title: entry.title, views: entry.viewsFull, date: entry.date, channel: entry.channel, since: entry.since, tags: entry.tags, desc: entry.desc };
}

export async function generateMetadata({ params }) {
  const { slug, cap } = await params;
  const entry = await resolveEntry(slug);
  if (!entry) return { title: 'Hentai' };
  const title = `${entry.title} - Episodio ${cap}`;
  const resumen = (entry.desc || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title,
    description: resumen || `Mira ${entry.title} episodio ${cap} en pikante pe`,
    keywords: entry.tags,
    alternates: { canonical: `/hentai/${entry.slug}/${cap}` },
    openGraph: {
      type: 'video.other',
      title: `${title} | pikante pe`,
      description: resumen,
      images: entry.thumb ? [entry.thumb] : undefined,
    },
  };
}

export default async function HentaiCapituloPage({ params }) {
  const { slug, cap } = await params;
  const entry = await resolveEntry(slug);

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <HentaiPlayer
          hentaiId={entry?.id || slug}
          slug={entry?.slug || slug}
          capNumero={cap}
          info={toInfo(entry)}
          serie={entry}
          capitulos={entry?.capitulos || []}
        />
      </div>
    </div>
  );
}
