-- ============================================================
-- tablas17.sql — Estado de conversaciones en la lista de chats
-- (estilo Facebook): archivar, fijar (máx 5) y silenciar grupos.
--
-- conv_tipo: 'dm' (conv_ref = user_key del otro) | 'grupo' (conv_ref = id)
-- Los silencios de DM ya viven en dm_silenciados; aquí el silencio es
-- para GRUPOS.
-- Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_estado (
  user_key   VARCHAR(80) NOT NULL,
  conv_tipo  VARCHAR(10) NOT NULL,
  conv_ref   VARCHAR(80) NOT NULL,
  archivado  BOOLEAN NOT NULL DEFAULT FALSE,
  fijado     BOOLEAN NOT NULL DEFAULT FALSE,
  silenciado BOOLEAN NOT NULL DEFAULT FALSE,
  fijado_en  TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_key, conv_tipo, conv_ref)
);

CREATE INDEX IF NOT EXISTS idx_chat_estado_user ON chat_estado (user_key);
