-- ============================================================
-- tablas6.sql  (cambios nuevos de esquema)
-- Metadata e historial de llamadas. Solo datos: quien, cuando, cuanto duro.
-- No se almacena audio/video. Idempotente y sin borrar datos.
-- ============================================================

-- Duracion y motivo de finalizacion en las salas grupales.
ALTER TABLE llamada_grupo_salas ADD COLUMN IF NOT EXISTS duracion_seg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE llamada_grupo_salas ADD COLUMN IF NOT EXISTS motivo VARCHAR(40);

-- Campos de metadata que ya usaba la tabla 1:1 (por si faltan en algun entorno).
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS motivo VARCHAR(40);
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS duracion_seg INTEGER NOT NULL DEFAULT 0;

-- Indice para listar historial de llamadas de un grupo.
CREATE INDEX IF NOT EXISTS idx_llamada_grupo_created ON llamada_grupo_salas(created_at DESC);
