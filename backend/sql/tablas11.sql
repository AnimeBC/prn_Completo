-- ============================================================
--  tablas11.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas10.sql.
--  SEGURO e IDEMPOTENTE.
--
--  Contenido: slug amigable para los VIDEOS (para URLs con nombre,
--  ej: /videos/obligada-3 en vez de /videos/3).
-- ============================================================

UPDATE videos
   SET slug = trim(both '-' from regexp_replace(lower(titulo_es), '[^a-z0-9]+', '-', 'g')) || '-' || id
 WHERE slug IS NULL OR slug = '';

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
