import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import HentaiPlayer from '@/_Pages/main/Hentai/hentaiPlayer';
import styles from '@/app/(main)/page.module.css';
import { apiGet, mediaUrl, sinceOf } from '@/_Extras/Datos/server.js';

async function resolveEntry(id) {
  const r = await apiGet(`/api/hentai/${id}`);
  if (!r || !r.id) return null;
  const capitulos = (r.capitulos || []).map((c) => ({
    id: c.id,
    numero: c.numero,
    titulo_es: c.titulo_es,
    titulo_en: c.titulo_en,
    desc_es: c.desc_es,
    desc_en: c.desc_en,
    duracion: c.duracion || '00:00',
    src: mediaUrl(c.src),
    thumb: c.thumb ? mediaUrl(c.thumb) : '',
    renditions: Array.isArray(c.renditions) ? c.renditions.map((x) => ({ label: x.label, src: mediaUrl(x.src) })) : [],
  }));
  return {
    title: r.titulo_es || r.titulo_en,
    viewsFull: `${Number(r.vistas || 0).toLocaleString('es-PE')} vistas`,
    date: r.created_at,
    channel: r.canal,
    since: sinceOf(r.created_at),
    tags: r.tags || [],
    desc: r.desc_es || r.desc_en,
    thumb: mediaUrl(r.cover || r.thumb),
    capitulos,
  };
}

function toInfo(entry) {
  if (!entry) return null;
  return { title: entry.title, views: entry.viewsFull, date: entry.date, channel: entry.channel, since: entry.since, tags: entry.tags, desc: entry.desc };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const entry = await resolveEntry(id);
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
    alternates: { canonical: `/hentai/${id}` },
    openGraph: {
      type: 'video.other',
      title: `${title} | pikante pe`,
      description,
      images: entry.thumb ? [entry.thumb] : undefined,
    },
  };
}

export default async function HentaiPage({ params }) {
  const { id } = await params;
  const entry = await resolveEntry(id);

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <HentaiPlayer
          hentaiId={id}
          src={entry?.capitulos?.[0]?.src || ''}
          info={toInfo(entry)}
          capitulos={entry?.capitulos || []}
        />
      </div>
    </div>
  );
}
