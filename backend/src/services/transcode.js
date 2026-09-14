import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * FFmpeg real vía ffmpeg-static (no depende del sistema).
 * Si el paquete no está instalado, hasFFmpeg = false y se guarda el original.
 */
let FFMPEG = null;
let FFPROBE = null;
try { FFMPEG = require('ffmpeg-static'); } catch { /* no instalado */ }
try { FFPROBE = require('ffprobe-static')?.path || null; } catch { /* no instalado */ }

export const hasFFmpeg = !!FFMPEG;

/** Calidades objetivo, de mayor a menor. */
export const QUALITIES = [1080, 720, 480, 360];

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let tail = '';
    p.stderr.on('data', (d) => { tail = (tail + d.toString()).slice(-600); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg salió con ${code}: ${tail}`))));
  });
}

export function probe(input) {
  if (!FFPROBE) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      FFPROBE,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input],
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const j = JSON.parse(stdout);
          const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
          resolve({
            width: Number(v.width) || 0,
            height: Number(v.height) || 0,
            duration: Number(j.format?.duration) || 0,
          });
        } catch { resolve(null); }
      }
    );
  });
}

export function fmtDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Transcodifica `inputPath` a varias calidades dentro de `destDir`
 * (una carpeta por video). Devuelve las renditions + poster + duración.
 */
export async function transcodeVideo({ inputPath, destDir }) {
  fs.mkdirSync(destDir, { recursive: true });

  const info = await probe(inputPath);
  const srcHeight = info?.height || 720;

  let heights = QUALITIES.filter((h) => h <= srcHeight + 1);
  if (!heights.length) heights = [Math.min(360, srcHeight)];

  // subcarpetas ordenadas dentro de la carpeta del video
  const qualDir = path.join(destDir, 'calidades');
  const thumbDir = path.join(destDir, 'thumbs');
  fs.mkdirSync(qualDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });

  const renditions = [];
  for (const h of heights) {
    const file = `${h}p.mp4`;
    await run(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-vf', `scale=-2:${h}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      path.join(qualDir, file),
    ]);
    renditions.push({ label: `${h}p`, height: h, file: `calidades/${file}` });
  }

  // poster (miniatura) -> thumbs/poster.jpg
  const poster = path.join(thumbDir, 'poster.jpg');
  try {
    await run(FFMPEG, [
      '-y', '-ss', '1', '-i', inputPath,
      '-frames:v', '1', '-vf', 'scale=640:-2',
      poster,
    ]);
  } catch { /* sin poster */ }

  return {
    renditions,
    poster: fs.existsSync(poster) ? poster : null,
    duration: info?.duration || 0,
  };
}

/** Anchos objetivo para imágenes de packs. */
export const IMAGE_WIDTHS = [1280, 720, 480];

/**
 * Genera "calidades" de una imagen dentro de destDir:
 *   destDir/original.<ext>  +  destDir/calidades/<w>.jpg
 * Devuelve { renditions, original } con rutas relativas a destDir.
 */
export async function transcodeImage({ inputPath, destDir }) {
  fs.mkdirSync(destDir, { recursive: true });

  const ext = (path.extname(inputPath) || '.jpg').toLowerCase();
  const originalName = `original${ext}`;
  fs.copyFileSync(inputPath, path.join(destDir, originalName));
  const original = { label: 'original', file: originalName };

  if (!hasFFmpeg) return { renditions: [original], original: originalName };

  const qualDir = path.join(destDir, 'calidades');
  fs.mkdirSync(qualDir, { recursive: true });

  const renditions = [];
  for (const w of IMAGE_WIDTHS) {
    const file = `${w}.jpg`;
    try {
      await run(FFMPEG, [
        '-y', '-i', inputPath,
        '-vf', `scale='min(${w},iw)':-2`,
        '-q:v', '3',
        path.join(qualDir, file),
      ]);
      renditions.push({ label: String(w), width: w, file: `calidades/${file}` });
    } catch { /* ignora esta calidad */ }
  }
  if (!renditions.length) renditions.push(original);
  return { renditions, original: originalName };
}

/** Tamaños de avatar (cuadrados), de mayor a menor. */
export const AVATAR_SIZES = [400, 200, 96];

/**
 * Recorta la imagen en cuadrado (cover, tipo Facebook) y genera las calidades
 * del avatar dentro de destDir/calidades. Devuelve { renditions, main }.
 */
export async function transcodeAvatar({ inputPath, destDir }) {
  fs.mkdirSync(destDir, { recursive: true });

  const ext = (path.extname(inputPath) || '.jpg').toLowerCase();
  const originalName = `original${ext}`;
  fs.copyFileSync(inputPath, path.join(destDir, originalName));

  if (!hasFFmpeg) return { renditions: [], main: originalName };

  const qualDir = path.join(destDir, 'calidades');
  fs.mkdirSync(qualDir, { recursive: true });

  const renditions = [];
  for (const s of AVATAR_SIZES) {
    const file = `${s}.jpg`;
    try {
      await run(FFMPEG, [
        '-y', '-i', inputPath,
        '-vf', `scale=${s}:${s}:force_original_aspect_ratio=increase,crop=${s}:${s}`,
        '-q:v', '3',
        path.join(qualDir, file),
      ]);
      renditions.push({ size: s, file: `calidades/${file}` });
    } catch { /* ignora esta calidad */ }
  }

  return { renditions, main: renditions.find((r) => r.size === 400)?.file || originalName };
}
