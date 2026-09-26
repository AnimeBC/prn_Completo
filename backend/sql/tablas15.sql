-- ============================================================
-- tablas15.sql — Bloqueos y silencios entre personas (DM)
--
-- bloqueos: yo bloqueo a alguien -> no puede escribirme (y yo no a él)
--           hasta que se desbloquee desde el modal de información.
-- dm_silenciados: silencio por conversación -> no suena ni abre chat
--                 head para quien lo silenció.
--
-- Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS bloqueos (
  id            SERIAL PRIMARY KEY,
  user_key      VARCHAR(80) NOT NULL,   -- quién bloquea
  bloqueado_key VARCHAR(80) NOT NULL,   -- a quién
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_key, bloqueado_key)
);

CREATE INDEX IF NOT EXISTS idx_bloqueos_bloqueante ON bloqueos (user_key);
CREATE INDEX IF NOT EXISTS idx_bloqueos_bloqueado ON bloqueos (bloqueado_key);

CREATE TABLE IF NOT EXISTS dm_silenciados (
  conversacion_id INTEGER NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  user_key        VARCHAR(80) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (conversacion_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_dm_silenciados_conv ON dm_silenciados (conversacion_id);
