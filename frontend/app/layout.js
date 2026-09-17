import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers.js";
import { SidebarProvider } from "./sidebarContext.js";
import AgeGate from "@/_Pages/main/layouts/AgeGate/AgeGate.js";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL('https://pikantepe.com'),
  title: {
    default: 'pikante pe — Videos, packs y comunidad picante',
    template: '%s | pikante pe',
  },
  description:
    'pikante pe: la plataforma peruana de videos, packs exclusivos, fetiches, hentai y comunidad en vivo. Contenido picante seleccionado, tendencias y más. Descubre lo mejor en pikantepe.com.',
  keywords: ['pikante pe', 'pikantepe', 'videos', 'packs', 'fetiches', 'hentai', 'tendencias', 'comunidad', 'en vivo', 'contenido picante peru'],
  authors: [{ name: 'pikante pe', url: 'https://pikantepe.com' }],
  creator: 'pikante pe',
  publisher: 'pikante pe',
  category: 'entertainment',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'pikante pe',
  },
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    url: 'https://pikantepe.com',
    siteName: 'pikante pe',
    title: 'pikante pe — Videos, packs y comunidad picante',
    description:
      'Descubre videos, packs exclusivos, fetiches, hentai y comunidad en vivo en pikante pe. El mejor contenido picante peruano.',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'pikante pe logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'pikante pe — Videos, packs y comunidad picante',
    description:
      'Videos, packs, fetiches y hentai en pikante pe. Únete a la comunidad.',
    images: ['/logo.png'],
  },
  verification: {
    google: 'OSkzXC5rIrYiSZXOptfinXaZ5fQW6DnZWxF3Zc3ms4Y',
  },
};

export const viewport = {
  themeColor: '#F20D16',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Google Tag Manager */}
        <Script
          id="gtm-head"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PKXNFDBB');`,
          }}
        />
        {/* End Google Tag Manager */}
        {/* Google tag (gtag.js) - G-C710M1Y33Q */}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-C710M1Y33Q" strategy="afterInteractive" />
        <Script
          id="gtag-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-C710M1Y33Q');`,
          }}
        />
        {/* Client Hints para ExoClick (magsrv.com) */}
        <meta
          httpEquiv="Delegate-CH"
          content="Sec-CH-UA https://s.magsrv.com; Sec-CH-UA-Mobile https://s.magsrv.com; Sec-CH-UA-Arch https://s.magsrv.com; Sec-CH-UA-Model https://s.magsrv.com; Sec-CH-UA-Platform https://s.magsrv.com; Sec-CH-UA-Platform-Version https://s.magsrv.com; Sec-CH-UA-Bitness https://s.magsrv.com; Sec-CH-UA-Full-Version-List https://s.magsrv.com; Sec-CH-UA-Full-Version https://s.magsrv.com;"
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-PKXNFDBB"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <Script
          src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"
          type="module"
          strategy="afterInteractive"
        />
        <Providers>
          <SidebarProvider>
            <AgeGate />
            {children}
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
