-- ============================================================
-- tablas12.sql — Notificaciones de reportes de Match
-- Solo el admin debe ver el detalle de los reportes.
-- Los avisos "Sistema Match / Reporte en Match" que estaban
-- publicados para todos (tipo 'admin', user_key NULL) pasan a
-- 'match_reporte': visible solo en el panel de admin.
-- Idempotente y sin borrar datos.
-- ============================================================

UPDATE notificaciones
   SET tipo = 'match_reporte'
 WHERE user_key IS NULL
   AND tipo = 'admin'
   AND actor_nombre = 'Sistema Match'
   AND titulo = 'Reporte en Match';

-- ============================================================
-- Avatares: la foto subida desde el panel solo quedaba en
-- channels.avatar y el chat/usuarios leian users.avatar.
-- Sincroniza users.avatar desde el canal cuando esta vacio.
-- Idempotente y sin borrar datos.
-- ============================================================

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
