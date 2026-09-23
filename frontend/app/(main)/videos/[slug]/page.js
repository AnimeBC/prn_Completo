import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import VideosClient from '@/_Pages/main/Videos/videos.js';
import styles from '@/app/(main)/page.module.css';
import { notFound } from 'next/navigation';
import { apiGet, mediaUrl, sinceOf } from '@/_Extras/Datos/server.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

/** Trae el video desde PostgreSQL (acepta id o slug). */
async function resolveEntry(slug) {
  const r = await apiGet(`/api/videos/${encodeURIComponent(slug)}`);
  if (!r || !r.id) return null;
  return {
    id: r.id,
    slug: r.slug || String(r.id),
    title: r.titulo_es || r.titulo_en,
    viewsFull: `${Number(r.vistas || 0).toLocaleString('es-PE')} vistas`,
    date: r.created_at,
    channel: r.canal,
    channelAvatar: mediaUrl(r.canal_avatar),
    channelSlug: r.canal_slug || '',
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
    channelAvatar: entry.channelAvatar || '',
    channelSlug: entry.channelSlug || '',
    since: entry.since,
    tags: entry.tags,
    desc: entry.desc,
    thumb: entry.thumb || '',
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = await resolveEntry(slug);
  if (!entry) return { title: 'Video' };
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
    alternates: { canonical: `/videos/${entry.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/videos/${entry.slug}`,
      image: entry.thumb,
      imageAlt: title,
      type: 'video.other',
    }),
    twitter: buildTwitter({ title, description, image: entry.thumb }),
  };
}

export default async function VideoPage({ params }) {
  const { slug } = await params;
  const entry = await resolveEntry(slug);
  if (!entry) notFound();
  const src = entry?.src || '';

  const jsonLd = entry
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: entry.title,
        description: entry.desc || entry.title,
        thumbnailUrl: entry.thumb ? [entry.thumb] : undefined,
        uploadDate: entry.date,
        contentUrl: entry.src || undefined,
        embedUrl: `https://pikantepe.com/videos/${entry.slug}`,
        publisher: { '@type': 'Organization', name: 'pikante pe', url: 'https://pikantepe.com' },
      }
    : null;

  return (
    <div className={styles.layout}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <VideosClient videoId={entry?.id || slug} src={src} info={toInfo(entry)} renditions={entry?.renditions || []} />
      </div>
    </div>
  );
}
