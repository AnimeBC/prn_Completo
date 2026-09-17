export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/perfil',
          '/historial',
          '/favoritos',
          '/me-gusta',
          '/*?*', // evita indexar URLs con parámetros (filtros, búsquedas, tabs)
        ],
      },
    ],
    sitemap: 'https://pikantepe.com/sitemap.xml',
    host: 'https://pikantepe.com',
  };
}
