-- ============================================================
-- tablas16.sql — Reporte de USUARIOS desde el chat
--
-- El modal de información del DM permite reportar a la persona:
-- se guarda el user_key reportado en target_key (target_id es numérico
-- y no aplica para personas).
-- Idempotente y sin borrar datos.
-- ============================================================

ALTER TABLE comunidad_reportes ADD COLUMN IF NOT EXISTS target_key VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_reportes_target_key ON comunidad_reportes (target_key) WHERE target_key IS NOT NULL;
