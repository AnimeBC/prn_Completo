-- ============================================================
--  tablas6.sql — Extras de pack_media (calidades de packs)
--  Ejecutar DESPUÉS de tablas5.sql (base "pikantepe")
-- ============================================================

ALTER TABLE pack_media ADD COLUMN IF NOT EXISTS renditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pack_media ADD COLUMN IF NOT EXISTS duracion   VARCHAR(20) DEFAULT '00:00';

CREATE INDEX IF NOT EXISTS idx_pack_media_tipo ON pack_media(pack_id, tipo);

-- ============================================================
-- FIN — pack_media guarda calidades (JSONB) y duración.
-- ============================================================
