-- ============================================================
-- tablas13.sql — Roles de grupo + opcion de chat del grupo
--
-- 1) 3 roles de grupo en comunidad_miembros.rol:
--      dueno      -> edita TODO del grupo (foto, reglas, roles).
--      semidueno  -> designado por el dueno; puede agregar y eliminar
--                    miembros y editar SOLO lo que el dueno le asigne
--                    (columna permisos).
--      miembro    -> rol por defecto, solo participa.
--    (El valor 'moderador' era un rol heredado: se unifica como 'semidueno'.)
--
-- 2) permisos: lista de claves que el dueno le otorga a un semidueno:
--      'agregar_miembros' -> invitar/agregar gente al grupo
--      'eliminar_miembros'-> expulsar gente del grupo
--      'editar_grupo'     -> cambiar foto, portada, reglas, descripcion
--      'chat'             -> moderar mensajes del chat
--    Vacio [] = no puede editar nada (solo agregar/eliminar, base del rol).
--
-- 3) chat_activo en comunidades: el dueno puede apagar el envio de
--    mensajes del chat del grupo para todos.
--
-- Idempotente y sin borrar datos.
-- ============================================================

-- 1) Permisos asignados por el dueno a cada miembro.
ALTER TABLE comunidad_miembros ADD COLUMN IF NOT EXISTS permisos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2) Unifica el rol heredado 'moderador' con el nuevo 'semidueno'.
UPDATE comunidad_miembros SET rol = 'semidueno' WHERE rol = 'moderador';

-- 3) Opcion: envio de mensajes activado/desactivado en el grupo.
ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS chat_activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 4) Indice para listar miembros por rol (dueño/semidueno).
CREATE INDEX IF NOT EXISTS idx_comunidad_miembros_rol ON comunidad_miembros (comunidad_id, rol);
