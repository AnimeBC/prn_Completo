-- ============================================================
-- tablas21.sql — Asegura las columnas de apodos (por si ya existía
--                 la tabla con el esquema viejo de un solo alias).
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

ALTER TABLE dm_apodos ADD COLUMN IF NOT EXISTS a_alias VARCHAR(60);
ALTER TABLE dm_apodos ADD COLUMN IF NOT EXISTS b_alias VARCHAR(60);
