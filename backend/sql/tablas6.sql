-- ============================================================
--  tablas6.sql — INCREMENTO sobre tablas5.sql
--  Ejecutar DESPUÉS de tablas5.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: vincular el canal del admin con su cuenta de administrador
--  (para que pueda editar su perfil de canal desde el panel).
-- ============================================================

ALTER TABLE channels ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_channels_admin ON channels(admin_id);

-- El canal oficial pasa a ser propiedad del admin existente
UPDATE channels
   SET admin_id = (SELECT id FROM admins ORDER BY id LIMIT 1)
 WHERE nombre ILIKE '%pikante%'
   AND admin_id IS NULL;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
