-- ============================================================
-- tablas14.sql — Expulsados de grupos (baneo por expulsión)
--
-- Cuando el dueño o un semidueno con permiso expulsa a alguien
-- (botón tacho en Información del grupo), queda registrado aquí:
--   * No puede volver a unirse ni pedir unirse.
--   * No puede leer ni escribir en el chat del grupo.
--   * El grupo "no existe" para él hasta que lo agreguen de nuevo
--     (agregarlo con el botón Agregar borra este registro).
--
-- El respaldo (mensajes, archivos, publicaciones) no se toca.
-- Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS comunidad_expulsados (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80) NOT NULL,
  expelled_by  VARCHAR(80),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_expulsados_grupo ON comunidad_expulsados (comunidad_id);
CREATE INDEX IF NOT EXISTS idx_expulsados_user  ON comunidad_expulsados (user_key);
