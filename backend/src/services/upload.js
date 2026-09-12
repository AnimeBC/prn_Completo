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
  fs.renameSync(file.path, abs);
  return publicOf(abs);
}

/** borra un archivo público /media/... del disco */
export function removeMedia(publicPath) {
  if (!publicPath) return;
  const rel = String(publicPath).replace(/^\/media\//, '');
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) return;
  try { fs.rmSync(abs, { force: true }); } catch { /* ignore */ }
}
