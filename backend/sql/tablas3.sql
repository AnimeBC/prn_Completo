-- ============================================================
--  tablas3.sql — INCREMENTO sobre tablas.sql / tablas2.sql
--  Ejecutar DESPUÉS de tablas2.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido:
--    1) users.usuario  (nombre de usuario único, sin distinguir mayúsculas)
--    2) email_tokens   (permite tipo 'verify_code' + intentos)
-- ============================================================

-- 1) Nombre de usuario (único, case-insensitive)
ALTER TABLE users ADD COLUMN IF NOT EXISTS usuario VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_usuario_lower
  ON users (lower(usuario)) WHERE usuario IS NOT NULL;

-- 2) Códigos de verificación por correo
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_tipo_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_tipo_check
  CHECK (tipo IN ('verify', 'reset', 'verify_code'));
ALTER TABLE email_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
