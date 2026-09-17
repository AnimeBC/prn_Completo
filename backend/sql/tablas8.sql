-- ============================================================
--  tablas8.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas7.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: comunidades.destacado -> el admin marca "Grupos destacados/VIP".
--  Si no hay ninguno marcado, el frontend muestra los más visitados.
-- ============================================================

ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS destacado BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_comunidades_destacado ON comunidades(destacado);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
