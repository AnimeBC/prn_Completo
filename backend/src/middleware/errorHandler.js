import { env } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  console.error('[error]', (err && (err.stack || err.message)) || err);

  // Errores de multer (subida de archivos)
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `El archivo es demasiado grande (máximo ${Number(process.env.MAX_VIDEO_MB || 6144)} MB).`
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'Demasiados archivos en la subida.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Error al subir archivo: se recibió un campo de archivo inesperado (¿backend sin reiniciar?).'
          : `Error al subir archivo: ${err.message}`;
    // Solo el tamaño real es 413; los demás errores de subida son 400
    // (evita confundir "Payload Too Large" con errores de campo/cantidad).
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: msg, code: err.code });
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
