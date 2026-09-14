'use client';

/** slug de canal (debe coincidir con channelSlug() del backend y tablas_limpias.sql). */
export function channelSlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
