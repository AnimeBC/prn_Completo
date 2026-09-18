-- ============================================================
-- tablas16.sql — Editar / eliminar mensajes (con rastro)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

-- Mensajes de grupo
ALTER TABLE comunidad_mensajes ADD COLUMN IF NOT EXISTS editado   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comunidad_mensajes ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;

-- Mensajes directos (1 a 1)
ALTER TABLE dm_mensajes ADD COLUMN IF NOT EXISTS editado   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dm_mensajes ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
