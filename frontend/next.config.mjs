/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev: permite abrir la app desde la red local (celular/tablet) usando la IP
  // de la PC, ej. http://192.168.0.100:3000. Sin esto Next 16 bloquea los
  // recursos y la app queda sin datos. Solo aplica en desarrollo.
  // Agrega aqui la IP de tu PC si cambia.
  allowedDevOrigins: [
    '192.168.0.100',
    '192.168.1.100',
    'localhost',
    '127.0.0.1',
  ],
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
