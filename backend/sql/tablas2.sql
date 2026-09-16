-- ============================================================
--  tablas2.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas_limpias.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: TÍTULOS EXTRAS del hentai (títulos alternos en otros
--  idiomas), tanto a nivel de serie como por modo (sub/es/en/en_sub).
-- ============================================================

ALTER TABLE hentai       ADD COLUMN IF NOT EXISTS titulos_extras TEXT[] DEFAULT '{}';
ALTER TABLE hentai_modos ADD COLUMN IF NOT EXISTS titulos_extras TEXT[] DEFAULT '{}';

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
