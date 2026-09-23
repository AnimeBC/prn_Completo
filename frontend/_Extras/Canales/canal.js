'use client';

import { apiComunidad } from '@/_Extras/Comunidad/api.js';

/** slug de canal (debe coincidir con channelSlug() del backend y tablas_limpias.sql). */
export function channelSlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function canalUrl(name) {
  const slug = channelSlug(name);
  return `/canal/${slug}`;
}

/**
 * Navega al canal REAL del usuario: primero resuelve el slug por user_key
 * (la BD manda; evita el 404 cuando el nombre visible no coincide con el
 * slug del canal) y si no hay canal, cae al slug construido con el nombre.
 */
export async function abrirCanal(router, userKey, nombre) {
  if (userKey) {
    try {
      const r = await apiComunidad.canalSlug(userKey);
      if (r && r.slug) {
        router.push(`/canal/${r.slug}`);
        return;
      }
    } catch { /* sin red: fallback abajo */ }
  }
  router.push(canalUrl(nombre));
}
