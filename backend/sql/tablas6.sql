-- ============================================================
-- tablas6.sql  (cambios nuevos de esquema)
-- Metadata e historial de llamadas. Solo datos: quien, cuando, cuanto duro.
-- No se almacena audio/video. Idempotente y sin borrar datos.
-- ============================================================

-- Duracion y motivo de finalizacion en las salas grupales.
ALTER TABLE llamada_grupo_salas ADD COLUMN IF NOT EXISTS duracion_seg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE llamada_grupo_salas ADD COLUMN IF NOT EXISTS motivo VARCHAR(40);

-- Campos de metadata que ya usaba la tabla 1:1 (por si faltan en algun entorno).
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS motivo VARCHAR(40);
ALTER TABLE llamadas ADD COLUMN IF NOT EXISTS duracion_seg INTEGER NOT NULL DEFAULT 0;

-- Indice para listar historial de llamadas de un grupo.
CREATE INDEX IF NOT EXISTS idx_llamada_grupo_created ON llamada_grupo_salas(created_at DESC);

-- Limpieza: notificaciones de amistad NO leidas repetidas del mismo actor.
-- Deja solo la mas reciente por (user_key, actor_key).
DELETE FROM notificaciones n1
 USING notificaciones n2
 WHERE n1.tipo = 'amistad' AND n2.tipo = 'amistad'
   AND n1.user_key = n2.user_key
   AND n1.actor_key = n2.actor_key
   AND n1.id < n2.id
   AND NOT EXISTS (
     SELECT 1 FROM notificaciones_leidas nl
      WHERE nl.notificacion_id = n1.id AND nl.user_key = n1.user_key
   );
