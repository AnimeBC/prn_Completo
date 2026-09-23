-- ============================================================
-- tablas9.sql — Albumes de chat (varios archivos en un mensaje)
-- media estaba en VARCHAR(255); con un album (JSON array de
-- varias rutas de archivo) se pasa de 255 con facilidad.
-- Se amplia a TEXT. Idempotente y sin borrar datos.
-- Orden: tablas_limpias.sql -> tablas2 -> ... -> tablas8 -> tablas9.
-- ============================================================

ALTER TABLE comunidad_mensajes ALTER COLUMN media TYPE TEXT;
ALTER TABLE dm_mensajes ALTER COLUMN media TYPE TEXT;
