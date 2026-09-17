/** URL amigable de un video (usa el slug si existe, si no el id). */
export function videoUrl(v) {
  const id = v && typeof v === 'object' ? v.id : v;
  const slug = v && typeof v === 'object' ? v.slug : '';
  return `/videos/${slug || id}`;
}

/** URL amigable de un fetiche (usa el slug si existe, si no el id). */
export function feticheUrl(v) {
  const id = v && typeof v === 'object' ? v.id : v;
  const slug = v && typeof v === 'object' ? v.slug : '';
  return `/videos/fetiches/${slug || id}`;
}

/** URL de un anime hentai (usa el slug si existe, si no el id). */
export function hentaiUrl(v) {
  const id = v && typeof v === 'object' ? v.id : v;
  const slug = v && typeof v === 'object' ? v.slug : '';
  return `/hentai/${slug || id}`;
}
