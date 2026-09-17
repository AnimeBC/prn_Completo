-- ============================================================
--  tablas5.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas4.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido: respuestas y reacciones del chat de la comunidad.
--    - comunidad_mensajes.reply_to: id del mensaje al que responde
--    - comunidad_mensaje_reacciones: 1 reacción (emoji) por usuario y mensaje
-- ============================================================

ALTER TABLE comunidad_mensajes
  ADD COLUMN IF NOT EXISTS reply_to INTEGER REFERENCES comunidad_mensajes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS comunidad_mensaje_reacciones (
  id         SERIAL PRIMARY KEY,
  mensaje_id INTEGER NOT NULL REFERENCES comunidad_mensajes(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  emoji      VARCHAR(8) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (mensaje_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_reacciones_msj ON comunidad_mensaje_reacciones(mensaje_id);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
