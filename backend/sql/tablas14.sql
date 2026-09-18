-- ============================================================
-- tablas14.sql — Estado de lectura de los chats (Messenger)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS comunidad_chat_leido (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80) NOT NULL,
  ultimo_leido TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_chat_leido_user ON comunidad_chat_leido(user_key);
