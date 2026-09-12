import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import VideosClient from '@/_Pages/main/Videos/videos.js';
import styles from '@/app/(main)/page.module.css';
import { apiGet, mediaUrl, sinceOf } from '@/_Extras/Datos/server.js';

/** Trae el video desde PostgreSQL (base de datos). */
async function resolveEntry(id) {
  const r = await apiGet(`/api/videos/${id}`);
  if (!r || !r.id) return null;
  return {
    title: r.titulo_es || r.titulo_en,
    viewsFull: `${Number(r.vistas || 0).toLocaleString('es-PE')} vistas`,
    date: r.created_at,
    channel: r.canal,
    since: sinceOf(r.created_at),
    tags: r.tags || [],
    desc: r.desc_es || r.desc_en,
    src: mediaUrl(r.src),
    thumb: mediaUrl(r.thumb),
    renditions: Array.isArray(r.renditions)
      ? r.renditions.map((x) => ({ label: x.label, src: mediaUrl(x.src) }))
      : [],
  };
}

function toInfo(entry) {
  if (!entry) return null;
  return {
    title: entry.title,
    views: entry.viewsFull,
    date: entry.date,
    channel: entry.channel,
    since: entry.since,
    tags: entry.tags,
    desc: entry.desc,
  };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const entry = await resolveEntry(id);
  if (!entry) return { title: 'Video' };
  const title = entry.title;
  const description = `${entry.viewsFull || ''} • ${entry.channel || ''}`.trim();
  return {
    title,
    description: description || `Mira ${title} en pikante pe`,
    keywords: entry.tags,
    alternates: { canonical: `/videos/${id}` },
    openGraph: { title: `${title} | pikante pe`, description, images: entry.thumb ? [entry.thumb] : undefined },
  };
}

export default async function VideoPage({ params }) {
  const { id } = await params;
  const entry = await resolveEntry(id);
  const src = entry?.src || '';

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <VideosClient videoId={id} src={src} info={toInfo(entry)} renditions={entry?.renditions || []} />
      </div>
    </div>
  );
}
