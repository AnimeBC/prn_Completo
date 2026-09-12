export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: 'https://www.pikantepe.com/sitemap.xml',
    host: 'https://www.pikantepe.com',
  };
}
