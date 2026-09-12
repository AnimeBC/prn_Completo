// Loader de idiomas escalable.
//
// Para agregar un idioma nuevo (ej: portugués):
//   1. Crea `pt.json` con LAS MISMAS claves que `es.json`.
//   2. Impórtalo abajo y agrégalo a LOCALES.
// Todo lo demás (provider, t(), fallback) funciona solo.
import es from './es.json';
import en from './en.json';

export const LOCALES = ['es', 'en'];
export const DEFAULT_LOCALE = 'es';
export const ENGLISH_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE'];

const MESSAGES = { es, en };

export function getMessages(locale) {
  return MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
}

// Detecta el país del visitante por IP (para saber si cambió de ubicación,
// ej. cambio de VPS). Con timeout para no colgar el arranque si la API falla.
export async function getCountryCode(timeoutMs = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.country_code === 'string' ? data.country_code : null;
  } catch {
    return null;
  }
}

// Mapeo país -> idioma. Países de habla inglesa -> 'en', resto -> 'es'.
export function localeForCountry(code) {
  return code && ENGLISH_COUNTRIES.includes(code) ? 'en' : 'es';
}
