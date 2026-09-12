import { env } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  console.error('[error]', (err && (err.stack || err.message)) || err);

  // Errores de multer (subida de archivos)
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `El archivo es demasiado grande (máximo ${Number(process.env.MAX_VIDEO_MB || 6144)} MB).`
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'Demasiados archivos en la subida.'
        : `Error al subir archivo: ${err.message}`;
    return res.status(413).json({ error: msg, code: err.code });
  }

  const status = err?.status || 500;
  const raw = err?.message || 'Error interno del servidor';

  // En producción no exponemos rutas/errores internos del sistema de archivos
  const safe = status >= 500 && env.nodeEnv === 'production'
    ? 'Error interno del servidor'
    : raw;

  res.status(status).json({ error: safe });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}
