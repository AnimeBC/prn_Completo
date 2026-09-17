-- ============================================================
--  tablas10.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas9.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: límite de subida por usuario (comunidad).
--    subida_mb: NULL = estándar (200 MB), -1 = sin límite, >0 = MB
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS subida_mb INTEGER;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
