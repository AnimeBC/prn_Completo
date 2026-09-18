-- ============================================================
-- tablas17.sql — "Borrar solo para mí" en mensajes
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

ALTER TABLE comunidad_mensajes ADD COLUMN IF NOT EXISTS oculto_para TEXT[] DEFAULT '{}';
ALTER TABLE dm_mensajes        ADD COLUMN IF NOT EXISTS oculto_para TEXT[] DEFAULT '{}';
