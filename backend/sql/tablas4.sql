-- ============================================================
--  tablas4.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas3.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido:
--    - comunidades.modo_union: 'libre' (unirse directo) o
--      'invitacion' (requiere aprobación del dueño/admin)
--    - comunidad_solicitudes: pedidos de ingreso a grupos privados
-- ============================================================

ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS modo_union VARCHAR(20) NOT NULL DEFAULT 'libre';

CREATE TABLE IF NOT EXISTS comunidad_solicitudes (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80) NOT NULL,
  usuario      VARCHAR(120),
  mensaje      TEXT,
  estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente',  -- pendiente|aprobado|rechazado
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_solicitudes_estado ON comunidad_solicitudes(estado);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
