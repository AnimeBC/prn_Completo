export function errorHandler(err, req, res, _next) {
  console.error('[error]', err.message);

  // Errores de multer (subida de archivos)
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `El archivo es demasiado grande (máximo ${Number(process.env.MAX_VIDEO_MB || 6144)} MB).`
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'Demasiados archivos en la subida.'
        : `Error al subir archivo: ${err.message}`;
    return res.status(413).json({ error: msg, code: err.code });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}
