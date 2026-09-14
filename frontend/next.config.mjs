/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // SOLO archivos de video estáticos (con extensión). Antes esta regla era
        // '/videos/:path*' y también cacheaba las PÁGINAS '/videos' y
        // '/videos/[id]' por 1 año (immutable), sirviendo HTML/RSC viejo junto a
        // JS nuevo: se rompía la hidratación, desaparecía la sesión y la app se
        // quedaba cargando. Los videos reales los sirve el backend en /media.
        source: '/videos/:file([^/]+\\.(?:mp4|mov|webm|mkv|avi|m4v))',
        headers: [
          { key: 'Accept-Ranges', value: 'bytes' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
