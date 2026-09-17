import { cache } from 'react';
import { notFound } from 'next/navigation';
import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import CanalClient from '@/_Pages/main/Canal/canal.js';
import styles from '@/app/(main)/page.module.css';
import { apiGet, mediaUrl } from '@/_Extras/Datos/server.js';
import { buildOpenGraph, buildTwitter } from '@/_Extras/Seo/og.js';

const getChannel = cache(async (slug) => {
  const r = await apiGet(`/api/channels/${encodeURIComponent(slug)}`);
  return r?.channel || null;
});

const getVideos = cache(async (slug) => {
  const r = await apiGet(`/api/channels/${encodeURIComponent(slug)}/videos?page=1&limit=24`);
  return { data: r?.data || [], total: r?.total || 0, pages: r?.pages || 1 };
});

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const ch = await getChannel(slug);
  if (!ch) return { title: 'Canal' };
  const desc = (ch.descripcion || `${ch.videos || 0} videos · ${ch.seguidores || 0} suscriptores`).slice(0, 160);
  const image = ch.avatar ? mediaUrl(ch.avatar) : undefined;
  return {
    title: ch.nombre,
    description: desc,
    alternates: { canonical: `/canal/${slug}` },
    openGraph: buildOpenGraph({
      title: ch.nombre,
      description: desc,
      url: `/canal/${slug}`,
      image,
      imageAlt: ch.nombre,
      type: 'profile',
    }),
    twitter: buildTwitter({ title: ch.nombre, description: desc, image }),
  };
}

export default async function CanalPage({ params }) {
  const { slug } = await params;
  const [channel, vids] = await Promise.all([getChannel(slug), getVideos(slug)]);
  if (!channel) notFound();

  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <CanalClient
          slug={slug}
          initialChannel={channel}
          initialVideos={vids.data}
          initialTotal={vids.total}
          initialPages={vids.pages}
        />
      </div>
    </div>
  );
}
