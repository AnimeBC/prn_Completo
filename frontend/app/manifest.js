export default function manifest() {
  return {
    name: 'pikante pe — Videos, packs y comunidad',
    short_name: 'pikante pe',
    description: 'Descubre videos, packs exclusivos, transmisiones en vivo y comunidad en pikante pe',
    id: '/',
    start_url: '/?utm_source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#0D0D0F',
    theme_color: '#F20D16',
    lang: 'es',
    dir: 'ltr',
    categories: ['entertainment', 'video'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
