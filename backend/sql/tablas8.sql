-- ============================================================
-- tablas8.sql  (cambios nuevos de esquema)
-- Portada (banner) del perfil de usuario en /perfil.
-- Idempotente y sin borrar datos.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS banner VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_pos VARCHAR(20) DEFAULT '50% 50%';
