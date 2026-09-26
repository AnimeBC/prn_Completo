-- ============================================================
-- tablas19.sql — ACTUALIZACIÓN COMPLETA del chat (consolidador)
--
-- Equivale a aplicar tablas12, 14, 15, 16, 17 y 18 en orden.
-- Todo es idempotente: si ya corriste alguna, no pasa nada.
-- Con este UNO solo archivo la BD queda al día:
--
--  1) Notificaciones de reportes de Match -> solo admin.
--  2) Avatares: users.avatar sincronizado desde channels.avatar.
--  3) URLs de notificaciones de respuestas/reacciones -> /chat?conv=.
--  4) Contador REAL de miembros de cada grupo.
--  5) Expulsados de grupos (comunidad_expulsados).
--  6) Bloqueos y silencios entre personas (bloqueos, dm_silenciados).
--  7) Reporte de usuarios (comunidad_reportes.target_key).
--  8) Estado de la lista de chats (chat_estado: archivar/fijar/silenciar).
--  9) "Eliminar chat" de la cuenta propia (dm_ocultos, chat_estado.oculto).
-- ============================================================

-- 1) Reportes de Match: solo el admin los ve.
UPDATE notificaciones
   SET tipo = 'match_reporte'
 WHERE user_key IS NULL
   AND tipo = 'admin'
   AND actor_nombre = 'Sistema Match'
   AND titulo = 'Reporte en Match';

-- 2) Avatares: users.avatar desde channels.avatar cuando está vacío.
UPDATE users u
   SET avatar = sub.avatar,
       updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (user_key) user_key, avatar
      FROM channels
     WHERE avatar IS NOT NULL
     ORDER BY user_key, updated_at DESC
  ) sub
 WHERE u.user_key = sub.user_key
   AND u.avatar IS NULL
   AND sub.avatar IS NOT NULL;

-- 3) Notificaciones de respuestas/reacciones -> abren el chat directo.
UPDATE notificaciones
   SET url = '/chat?conv=' || substring(url FROM 'grupo=([0-9]+)')
 WHERE tipo IN ('respuesta', 'reaccion')
   AND url LIKE '/comunidad?grupo=%'
   AND substring(url FROM 'grupo=([0-9]+)') IS NOT NULL;

-- 4) Contador real de miembros (el viejo estaba inflado).
UPDATE comunidades c
   SET miembros = (SELECT COUNT(*) FROM comunidad_miembros cm WHERE cm.comunidad_id = c.id);

-- 5) Expulsados de grupos.
CREATE TABLE IF NOT EXISTS comunidad_expulsados (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80) NOT NULL,
  expelled_by  VARCHAR(80),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_expulsados_grupo ON comunidad_expulsados (comunidad_id);
CREATE INDEX IF NOT EXISTS idx_expulsados_user ON comunidad_expulsados (user_key);

-- 6) Bloqueos y silencios entre personas.
CREATE TABLE IF NOT EXISTS bloqueos (
  id            SERIAL PRIMARY KEY,
  user_key      VARCHAR(80) NOT NULL,
  bloqueado_key VARCHAR(80) NOT NULL,
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

-- 7) Reporte de usuarios desde el chat.
ALTER TABLE comunidad_reportes ADD COLUMN IF NOT EXISTS target_key VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_reportes_target_key ON comunidad_reportes (target_key) WHERE target_key IS NOT NULL;

-- 8) Estado de la lista de chats (archivar / fijar / silenciar / ocultar).
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

-- 9) "Eliminar chat" de la cuenta propia (sin tocar el historial).
CREATE TABLE IF NOT EXISTS dm_ocultos (
  conversacion_id INTEGER NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  user_key        VARCHAR(80) NOT NULL,
  oculto_en       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (conversacion_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_dm_ocultos_user ON dm_ocultos (user_key);

ALTER TABLE chat_estado ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_estado ADD COLUMN IF NOT EXISTS oculto_en TIMESTAMP;

-- Filas ocultas sin fecha (versión intermedia): se les pone su fecha para
-- que el chat reaparezca con los mensajes posteriores y no quede para siempre.
UPDATE chat_estado
   SET oculto_en = updated_at
 WHERE oculto = TRUE AND oculto_en IS NULL;
