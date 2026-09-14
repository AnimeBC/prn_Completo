'use client';

import { ThemeProvider } from "@/_Extras/CambiodeColor/ThemeProvider.js";
import { LanguageProvider } from "@/_Extras/Idioma/LanguageProvider.js";
import { AuthProvider } from "@/_Extras/Auth/AuthProvider.js";
import { ContenidoProvider } from "@/_Extras/Datos/ContenidoProvider.js";
import { RealtimeProvider } from "@/_Extras/TiempoReal/RealtimeProvider.js";
import { PwaProvider } from "@/_Extras/PWA/PwaProvider.js";

export default function Providers({ children }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ContenidoProvider>
          <ThemeProvider>
            <RealtimeProvider>
              <PwaProvider>
                {children}
              </PwaProvider>
            </RealtimeProvider>
          </ThemeProvider>
        </ContenidoProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
