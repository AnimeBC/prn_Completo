'use client';

export const VAST_TAG =
  process.env.NEXT_PUBLIC_VAST_TAG || 'https://s.magsrv.com/v1/vast.php?idz=6029702';

function text(el) {
  return el ? String(el.textContent || '').trim() : '';
}

function parseClock(v) {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!m) return 5;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Resuelve un VAST tag a un anuncio lineal reproducible.
 * Sigue wrappers (<VASTAdTagURI>) hasta 4 niveles.
 * Devuelve { mediaFile, impression[], clickThrough, clickTracking[], tracking[], skipAfter, error[] } o null.
 */
export async function fetchVastAd(tagUrl, depth = 0) {
  if (!tagUrl || depth > 4) return null;

  const res = await fetch(tagUrl, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) return null;
  const xmlText = await res.text();

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return null;

  // Wrapper -> seguir la URI
  const wrapperUri = text(doc.querySelector('VASTAdTagURI'));
  if (wrapperUri) return fetchVastAd(wrapperUri, depth + 1);

  const hasAd = doc.querySelector('InLine') || doc.querySelector('Ad');
  if (!hasAd) return null;

  const mediaFiles = [...doc.querySelectorAll('MediaFile')]
    .map((el) => ({
      url: text(el),
      type: el.getAttribute('type') || '',
      width: Number(el.getAttribute('width') || 0),
      height: Number(el.getAttribute('height') || 0),
    }))
    .filter((m) => m.url && (/^video\//i.test(m.type) || /\.(mp4|webm|m3u8)(\?|$)/i.test(m.url)));

  const best = mediaFiles.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const mediaFile = best?.url || text(doc.querySelector('MediaFile')) || null;
  if (!mediaFile) return null;

  const linear = doc.querySelector('Linear');
  const skipAfter = parseClock(linear?.getAttribute('skipoffset') || '00:00:05');

  return {
    mediaFile,
    impression: [...doc.querySelectorAll('Impression')].map(text).filter(Boolean),
    clickThrough: text(doc.querySelector('ClickThrough')) || null,
    clickTracking: [...doc.querySelectorAll('ClickTracking')].map(text).filter(Boolean),
    tracking: [...doc.querySelectorAll('Tracking')]
      .map((el) => ({ event: el.getAttribute('event') || '', url: text(el) }))
      .filter((t) => t.url),
    error: [...doc.querySelectorAll('Error')].map(text).filter(Boolean),
    skipAfter,
  };
}

export function firePixels(urls) {
  (urls || []).forEach((u) => {
    try { fetch(u, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch { /* noop */ }
  });
}
