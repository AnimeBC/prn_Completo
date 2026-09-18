-- ============================================================
-- tablas15.sql — Mensajes directos (1 a 1, estilo amigo/chat)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS dm_conversaciones (
  id         SERIAL PRIMARY KEY,
  a_key      VARCHAR(80) NOT NULL,
  b_key      VARCHAR(80) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (a_key, b_key)
);
CREATE INDEX IF NOT EXISTS idx_dm_conv_a ON dm_conversaciones(a_key);
CREATE INDEX IF NOT EXISTS idx_dm_conv_b ON dm_conversaciones(b_key);

CREATE TABLE IF NOT EXISTS dm_mensajes (
  id              SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  user_key        VARCHAR(80) NOT NULL,
  usuario         VARCHAR(120),
  avatar          VARCHAR(255),
  texto           TEXT,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'texto',
  media           VARCHAR(255),
  reply_to        INTEGER,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_msj_conv ON dm_mensajes(conversacion_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_leido (
  id              SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  user_key        VARCHAR(80) NOT NULL,
  ultimo_leido    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversacion_id, user_key)
);

CREATE TABLE IF NOT EXISTS dm_mensaje_reacciones (
  id         SERIAL PRIMARY KEY,
  mensaje_id INTEGER NOT NULL REFERENCES dm_mensajes(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  emoji      VARCHAR(8) NOT NULL,
  UNIQUE (mensaje_id, user_key)
);
