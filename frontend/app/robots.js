export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: 'https://pikantepe.com/sitemap.xml',
    host: 'https://pikantepe.com',
  };
}
