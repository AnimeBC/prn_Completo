-- ============================================================
--  tablas6.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2..5)
--  Ejecutar DESPUÉS de tablas5.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: títulos alternos del hentai (japonés y romaji).
-- ============================================================

ALTER TABLE hentai ADD COLUMN IF NOT EXISTS titulo_ja     VARCHAR(200);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS titulo_romaji VARCHAR(200);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
