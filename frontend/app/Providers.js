'use client';

import { ThemeProvider } from "@/_Extras/CambiodeColor/ThemeProvider.js";
import { LanguageProvider } from "@/_Extras/Idioma/LanguageProvider.js";
import { ContenidoProvider } from "@/_Extras/Datos/ContenidoProvider.js";
import { RealtimeProvider } from "@/_Extras/TiempoReal/RealtimeProvider.js";
import { PwaProvider } from "@/_Extras/PWA/PwaProvider.js";

export default function Providers({ children }) {
  return (
    <LanguageProvider>
      <ContenidoProvider>
        <ThemeProvider>
          <RealtimeProvider>
            <PwaProvider>
              {children}
            </PwaProvider>
          </RealtimeProvider>
        </ThemeProvider>
      </ContenidoProvider>
    </LanguageProvider>
  );
}
