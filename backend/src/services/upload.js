import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Carpeta de media FUERA de backend y frontend:
 *   C:\Users\anime\Documents\01_por_import\media_completa
 * backend/src/services -> ../../../media_completa
 */
export const MEDIA_DIR = path.resolve(__dirname, '../../../media_completa');

// Cada video vive en su propia carpeta con /calidades y /thumbs adentro;
// ya no existen carpetas planas de thumbs.
export const DIRS = {
  videos: path.join(MEDIA_DIR, 'videos'),
  fetiches: path.join(MEDIA_DIR, 'fetiches'),
  hentai: path.join(MEDIA_DIR, 'hentai'),
  packs: path.join(MEDIA_DIR, 'packs'),
  avatars: path.join(MEDIA_DIR, 'avatars'),
  tmp: path.join(MEDIA_DIR, '_tmp'),
};

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRS.tmp),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${file.fieldname}-${rand}${ext}`);
  },
});

const videoMime = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/mp2t', 'video/x-msvideo'];
const imageMime = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/avif'];

// Límite configurable: MAX_VIDEO_MB (default 6144 MB = 6 GB).
const MAX_MB = Number(process.env.MAX_VIDEO_MB || 6144);

export const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 2 },
  fileFilter(req, file, cb) {
    const bad = (msg) => { const e = new Error(msg); e.status = 400; return cb(e); };
    if (file.fieldname === 'video') {
      if (!videoMime.includes(file.mimetype) && !file.originalname.match(/\.(mp4|mov|webm|mkv|avi)$/i)) {
        return bad('Formato de video no permitido (mp4/mov/webm/mkv)');
      }
    }
    if (file.fieldname === 'thumb') {
      if (!imageMime.includes(file.mimetype) && !file.originalname.match(/\.(png|jpg|jpeg|webp|avif)$/i)) {
        return bad('Formato de portada no permitido (png/jpg/webp)');
      }
    }
    cb(null, true);
  },
});

export function publicOf(absPath) {
  return `/media/${path.relative(MEDIA_DIR, absPath).replace(/\\/g, '/')}`;
}

/** Multer para packs: portada + varios videos + varias imágenes. */
export const packUpload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 80 },
  fileFilter(req, file, cb) {
    const bad = (msg) => { const e = new Error(msg); e.status = 400; return cb(e); };
    if (file.fieldname === 'videos') {
      if (!videoMime.includes(file.mimetype) && !file.originalname.match(/\.(mp4|mov|webm|mkv|avi)$/i)) {
        return bad('Formato de video no permitido (mp4/mov/webm/mkv)');
      }
    } else if (file.fieldname === 'images' || file.fieldname === 'thumb') {
      if (!imageMime.includes(file.mimetype) && !file.originalname.match(/\.(png|jpg|jpeg|webp|avif)$/i)) {
        return bad('Formato de imagen no permitido (png/jpg/webp/avif)');
      }
    }
    cb(null, true);
  },
});

/** nombre de la carpeta del pack: pack_<slug>_<id> */
export function packFolderName(slug, id) {
  const s = (slug || 'pack').slice(0, 60);
  return `pack_${s}_${String(id).padStart(2, '0')}`;
}

export function packRootDir() {
  return DIRS.packs;
}

/** borra la carpeta completa de un pack a partir de una ruta pública */
export function removePackFolder(publicPath) {
  if (!publicPath) return;
  const rel = String(publicPath).replace(/^\/media\//, '');
  let abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) return;
  // sube hasta la carpeta "pack_..." dentro de /packs
  while (abs && path.basename(abs) !== 'packs') {
    if (/^pack_/.test(path.basename(abs))) break;
    const parent = path.dirname(abs);
    if (parent === abs) break;
    abs = parent;
  }
  if (!/^pack_/.test(path.basename(abs))) return;
  try { fs.rmSync(abs, { recursive: true, force: true }); } catch { /* ignora */ }
}

/** Multer para foto de perfil: 1 imagen. */
export const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const bad = (msg) => { const e = new Error(msg); e.status = 400; return cb(e); };
    if (!imageMime.includes(file.mimetype) && !file.originalname.match(/\.(png|jpg|jpeg|webp|avif)$/i)) {
      return bad('Formato de imagen no permitido (png/jpg/webp/avif)');
    }
    cb(null, true);
  },
});

/** carpeta del usuario para su foto: user_<key> */
export function avatarFolderName(userKey) {
  const s = String(userKey || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'user';
  return `user_${s}`;
}

/** borra la carpeta de avatar del usuario (solo si es local /media/avatars/...) */
export function removeAvatarFolder(publicPath) {
  if (!publicPath || !String(publicPath).startsWith('/media/avatars/')) return;
  const rel = String(publicPath).replace(/^\/media\//, '');
  let abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) return;
  while (abs && path.basename(abs) !== 'avatars') {
    if (/^user_/.test(path.basename(abs))) break;
    const parent = path.dirname(abs);
    if (parent === abs) break;
    abs = parent;
  }
  if (!/^user_/.test(path.basename(abs))) return;
  try { fs.rmSync(abs, { recursive: true, force: true }); } catch { /* ignora */ }
}

/** nombre de la carpeta propia del video (dentro de su sección) */
export function videoFolderName({ id, isFetiche, collection }) {
  if (collection === 'hentai') return `hentai_${String(id).padStart(3, '0')}`;
  if (isFetiche) return `fetiche_${String(id).padStart(2, '0')}`;
  return `video_${String(id).padStart(3, '0')}`;
}

/** carpeta raíz de la sección */
export function videoRootDir({ isFetiche, collection }) {
  if (collection === 'hentai') return DIRS.hentai;
  return isFetiche ? DIRS.fetiches : DIRS.videos;
}

/** borra la carpeta completa del video (calidades + poster) */
export function removeVideoFolder(publicPath) {
  if (!publicPath) return;
  const rel = String(publicPath).replace(/^\/media\//, '');
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) return;
  // si el archivo está en /calidades o /thumbs, la carpeta del video es un nivel arriba
  let dir = path.dirname(abs);
  const leaf = path.basename(dir);
  if (leaf === 'calidades' || leaf === 'thumbs') dir = path.dirname(dir);
  const roots = Object.values(DIRS).map((d) => path.resolve(d));
  // SÍNCRONO: debe terminar antes de mover el nuevo archivo (evita borrarlo por carrera)
  try {
    if (!roots.includes(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.rmSync(abs, { force: true });
    }
  } catch { /* ignora si ya no existe */ }
}

/** mueve un archivo temporal a su carpeta final y devuelve la ruta pública */
export function moveFinal(file, destDir, finalName) {
  const abs = path.join(destDir, finalName);
  moveFileSync(file.path, abs);
  return publicOf(abs);
}

/** rename con fallback a copia (por si origen y destino están en discos distintos). */
export function moveFileSync(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.copyFileSync(from, to);
      try { fs.unlinkSync(from); } catch { /* ignore */ }
    } else {
      throw err;
    }
  }
}

/** borra un archivo público /media/... del disco */
export function removeMedia(publicPath) {
  if (!publicPath) return;
  const rel = String(publicPath).replace(/^\/media\//, '');
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) return;
  try { fs.rmSync(abs, { force: true }); } catch { /* ignore */ }
}
