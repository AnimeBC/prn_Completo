-- ============================================================
-- tablas18.sql — "Eliminar chat" de la cuenta propia
--
-- dm_ocultos: el usuario oculta una conversación DM de SU lista.
--   No borra nada: los demás siguen viendo el chat y si llega un
--   mensaje nuevo la conversación vuelve a aparecer para los dos.
--
-- chat_estado.oculto: lo mismo para grupos de la lista (para quien
--   no es dueño; el dueño tiene "Eliminar grupo" que sí lo borra
--   para todos con respaldo).
--
-- Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS dm_ocultos (
  conversacion_id INTEGER NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  user_key        VARCHAR(80) NOT NULL,
  oculto_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (conversacion_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_dm_ocultos_user ON dm_ocultos (user_key);

ALTER TABLE chat_estado ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE;
-- Momento del "Eliminar chat": al reaparecer por un mensaje nuevo, solo se
-- ven los mensajes posteriores a esta fecha.
ALTER TABLE chat_estado ADD COLUMN IF NOT EXISTS oculto_en TIMESTAMP;

-- Limpieza de filas ocultas sin fecha (versión intermedia del endpoint):
-- se les pone la fecha de updated_at para que el chat reaparezca con los
-- mensajes posteriores y no se quede oculto para siempre.
UPDATE chat_estado
   SET oculto_en = updated_at
 WHERE oculto = TRUE AND oculto_en IS NULL;
