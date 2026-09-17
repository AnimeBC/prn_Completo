'use client';

/**
 * Actividad del INVITADO guardada en su navegador (localStorage).
 * Los invitados no escriben nada en la BD; al crear cuenta o iniciar
 * sesión esta info se sube una sola vez con /api/auth/profile/import-guest.
 */

const KEY = 'pkp_guest';

const EMPTY = {
  videoLikes: {},
  videoSaved: [],
  following: [],
  videoDownloads: [],
  packLikes: {},
  packSaved: [],
  packDownloads: [],
  hentaiLikes: {},
  hentaiSaved: [],
  hentaiDownloads: [],
  reports: {},
};

function read() {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    const d = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) {
      if (Array.isArray(EMPTY[k])) d[k] = Array.isArray(raw[k]) ? raw[k] : [];
      else d[k] = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
    }
    return d;
  } catch {
    return { ...EMPTY };
  }
}

function write(d) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* noop */ }
}

const has = (arr, v) => arr.includes(v);
const toggleArr = (arr, v) => (has(arr, v) ? arr.filter((x) => x !== v) : [...arr, v]);
const id = (v) => String(v);

export function getGuestData() { return read(); }

export function hasGuestData() {
  const d = read();
  return Object.keys(EMPTY).some((k) => (Array.isArray(d[k]) ? d[k].length > 0 : Object.keys(d[k]).length > 0));
}

export function clearGuestData() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
}

/* ---------- videos ---------- */
export function guestVideoState(videoId) {
  const k = id(videoId);
  const d = read();
  return {
    myVote: d.videoLikes[k] || null,
    saved: has(d.videoSaved, k),
    downloaded: has(d.videoDownloads, k),
    reported: !!d.reports[`video:${k}`],
  };
}

export function guestToggleVideoLike(videoId, tipo) {
  const k = id(videoId);
  const d = read();
  const cur = d.videoLikes[k] || null;
  const next = tipo === 'none' || tipo === cur ? null : tipo;
  if (next) d.videoLikes[k] = next; else delete d.videoLikes[k];
  write(d);
  return next;
}

export function guestToggleVideoSave(videoId) {
  const k = id(videoId);
  const d = read();
  d.videoSaved = toggleArr(d.videoSaved, k);
  write(d);
  return has(d.videoSaved, k);
}

export function guestToggleVideoDownload(videoId) {
  const k = id(videoId);
  const d = read();
  if (!has(d.videoDownloads, k)) d.videoDownloads = [...d.videoDownloads, k];
  write(d);
  return true;
}

export function guestToggleFollow(channel) {
  const name = String(channel || '');
  const d = read();
  d.following = toggleArr(d.following, name);
  write(d);
  return has(d.following, name);
}

export function guestMarkReport(kind, targetId) {
  const d = read();
  d.reports[`${kind}:${id(targetId)}`] = true;
  write(d);
}

/* ---------- packs ---------- */
export function guestPackState(packId) {
  const k = id(packId);
  const d = read();
  return { myVote: d.packLikes[k] || null, saved: has(d.packSaved, k) };
}

export function guestTogglePackLike(packId, tipo) {
  const k = id(packId);
  const d = read();
  const cur = d.packLikes[k] || null;
  const next = tipo === 'none' || tipo === cur ? null : tipo;
  if (next) d.packLikes[k] = next; else delete d.packLikes[k];
  write(d);
  return next;
}

export function guestTogglePackSave(packId) {
  const k = id(packId);
  const d = read();
  d.packSaved = toggleArr(d.packSaved, k);
  write(d);
  return has(d.packSaved, k);
}

export function guestAddPackDownload(packId) {
  const k = id(packId);
  const d = read();
  if (!has(d.packDownloads, k)) d.packDownloads = [...d.packDownloads, k];
  write(d);
}

/* ---------- hentai ---------- */
export function guestHentaiState(capId) {
  const k = id(capId);
  const d = read();
  return {
    myVote: d.hentaiLikes[k] || null,
    saved: has(d.hentaiSaved, k),
    reported: !!d.reports[`hentai:${k}`],
  };
}

export function guestToggleHentaiLike(capId, tipo) {
  const k = id(capId);
  const d = read();
  const cur = d.hentaiLikes[k] || null;
  const next = tipo === 'none' || tipo === cur ? null : tipo;
  if (next) d.hentaiLikes[k] = next; else delete d.hentaiLikes[k];
  write(d);
  return next;
}

export function guestToggleHentaiSave(capId) {
  const k = id(capId);
  const d = read();
  d.hentaiSaved = toggleArr(d.hentaiSaved, k);
  write(d);
  return has(d.hentaiSaved, k);
}

export function guestAddHentaiDownload(capId) {
  const k = id(capId);
  const d = read();
  if (!has(d.hentaiDownloads, k)) d.hentaiDownloads = [...d.hentaiDownloads, k];
  write(d);
}

/* ---------- overlay sobre las estadísticas del server ---------- */
function num(v) { return Number(v) || 0; }

export function overlayVideoStats(stats, videoId) {
  const s = guestVideoState(videoId);
  return {
    ...stats,
    likes: num(stats?.likes) + (s.myVote === 'like' ? 1 : 0),
    dislikes: num(stats?.dislikes) + (s.myVote === 'dislike' ? 1 : 0),
    myVote: s.myVote,
    saved: s.saved,
    reported: s.reported,
  };
}

export function overlayFollow(stats, channel) {
  const following = has(read().following, String(channel || ''));
  return {
    ...stats,
    following,
    subscribers: num(stats?.subscribers) + (following ? 1 : 0),
  };
}

export function overlayPackStats(stats, packId) {
  const s = guestPackState(packId);
  return {
    ...stats,
    likes: num(stats?.likes) + (s.myVote === 'like' ? 1 : 0),
    dislikes: num(stats?.dislikes) + (s.myVote === 'dislike' ? 1 : 0),
    myVote: s.myVote,
    saved: s.saved,
  };
}

export function overlayHentaiStats(stats, capId) {
  const s = guestHentaiState(capId);
  return {
    ...stats,
    likes: num(stats?.likes) + (s.myVote === 'like' ? 1 : 0),
    dislikes: num(stats?.dislikes) + (s.myVote === 'dislike' ? 1 : 0),
    myVote: s.myVote,
    saved: s.saved,
    reported: s.reported,
  };
}

/* ---------- payload para la cuenta ---------- */
export function getGuestImportPayload() {
  const d = read();
  return {
    videos: { likes: d.videoLikes, saved: d.videoSaved, downloads: d.videoDownloads },
    following: d.following,
    packs: { likes: d.packLikes, saved: d.packSaved, downloads: d.packDownloads },
    hentai: { likes: d.hentaiLikes, saved: d.hentaiSaved, downloads: d.hentaiDownloads },
  };
}

export default {
  getGuestData,
  hasGuestData,
  clearGuestData,
  guestVideoState,
  guestToggleVideoLike,
  guestToggleVideoSave,
  guestToggleVideoDownload,
  guestToggleFollow,
  guestMarkReport,
  guestPackState,
  guestTogglePackLike,
  guestTogglePackSave,
  guestAddPackDownload,
  guestHentaiState,
  guestToggleHentaiLike,
  guestToggleHentaiSave,
  guestAddHentaiDownload,
  overlayVideoStats,
  overlayFollow,
  overlayPackStats,
  overlayHentaiStats,
  getGuestImportPayload,
};
