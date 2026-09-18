-- ============================================================
-- tablas22.sql — Tema del chat compartido entre amigos (1 a 1)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

ALTER TABLE dm_conversaciones ADD COLUMN IF NOT EXISTS tema_gradient TEXT;
ALTER TABLE dm_conversaciones ADD COLUMN IF NOT EXISTS tema_color    VARCHAR(20);
ALTER TABLE dm_conversaciones ADD COLUMN IF NOT EXISTS tema_emoji    VARCHAR(16);
