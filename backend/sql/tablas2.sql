-- ============================================================
--  tablas2.sql — Login de usuarios (correo/contraseña + Google)
--  Ejecutar DESPUÉS de tablas.sql (en pgAdmin, base "pikantepe")
-- ============================================================

-- ============================================================
-- 1) USERS: verificación de correo + proveedor + Google
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider       VARCHAR(20) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id      VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login     TIMESTAMP;

-- un google_id solo puede estar en una cuenta
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON users(google_id) WHERE google_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- 2) EMAIL_TOKENS: verificación de correo (y reset a futuro)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      VARCHAR(150) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  tipo       VARCHAR(20)  NOT NULL DEFAULT 'verify' CHECK (tipo IN ('verify','reset')),
  expires_at TIMESTAMP    NOT NULL,
  used_at    TIMESTAMP,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);

-- ============================================================
-- FIN — Los usuarios existentes quedan como 'local' sin verificar.
--       Los que entren con Google se marcan email_verified = TRUE.
-- ============================================================
