/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Videos: streaming por rangos + caché larga en navegador/CDN.
        // Los nombres de archivo son versionados (fetiche_01, ...), así que es seguro cachear.
        source: '/videos/:path*',
        headers: [
          { key: 'Accept-Ranges', value: 'bytes' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
