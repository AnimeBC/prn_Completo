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

  // React Compiler (estable en Next 16): memoiza solo, menos re-renders en los
  // grids grandes. Requiere: npm i -D babel-plugin-react-compiler
  reactCompiler: true,

  experimental: {
    // Cachea segmentos dinámicos en el cliente (default: 0s = sin caché).
    // Volver atrás/adelante y re-visitas del sidebar salen de caché.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },

  images: {
    // Miniaturas y avatares viven en el backend (Express en la misma máquina).
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3001' },
      { protocol: 'http', hostname: '127.0.0.1', port: '3001' },
      // Dev desde la red local: el backend se pide con la IP de la PC
      // (mismas IPs que en allowedDevOrigins). Sin esto next/image truena con
      // "hostname is not configured under images" aunque exista
      // dangerouslyAllowLocalIP (esa flag solo permite IPs locales, no las agrega).
      { protocol: 'http', hostname: '192.168.0.100', port: '3001' },
      { protocol: 'http', hostname: '192.168.1.100', port: '3001' },
      { protocol: 'http', hostname: 'pikantepe.com', port: '3001' },
      { protocol: 'https', hostname: 'pikantepe.com' },
      // Avatares de cuentas que entraron con Google (users.avatar guarda la URL
      // de lh3.googleusercontent.com). Sin esto next/image truena y el avatar
      // no se ve en el chat aunque la imagen exista.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
    // Next 16 bloquea las IPs locales por defecto; el backend corre en
    // localhost:3001 (dev y VPS) — sin esto el optimizer da 400.
    dangerouslyAllowLocalIP: true,
  },

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
