-- ============================================================
-- tablas7.sql  (mantenimiento de datos, sin cambios de esquema)
-- Limpia avisos de amistad que ya no aplican: notificaciones de
-- "solicitud de amistad" cuyo par ya no tiene una solicitud pendiente.
-- Idempotente y sin borrar datos validos.
-- ============================================================

-- 1) Marca como canceladas las solicitudes de amistad pendientes que ya no
--    tienen una amistad pendiente asociada (no se borran: quedan como registro).
UPDATE notificaciones n
   SET titulo = 'Solicitud cancelada',
       meta = (COALESCE(meta, '{}'::jsonb) - 'amistad') || '{"cancelada": true}'::jsonb
 WHERE n.tipo = 'amistad'
   AND n.actor_key IS NOT NULL
   AND lower(n.titulo) LIKE '%solicitud%'
   AND lower(n.titulo) NOT LIKE '%aceptad%'
   AND lower(n.titulo) NOT LIKE '%rechazad%'
   AND lower(n.titulo) NOT LIKE '%cancelad%'
   AND NOT EXISTS (
     SELECT 1 FROM amistades am
      WHERE am.estado = 'pendiente'
        AND am.solicitante = n.actor_key
        AND (am.a_key = n.user_key OR am.b_key = n.user_key)
   );

-- 2) Colapsa duplicados: deja solo la solicitud de amistad mas reciente
--    pendiente por (destinatario, remitente).
DELETE FROM notificaciones n1
 USING notificaciones n2
 WHERE n1.tipo = 'amistad' AND n2.tipo = 'amistad'
   AND n1.user_key = n2.user_key
   AND n1.actor_key = n2.actor_key
   AND n1.id < n2.id
   AND lower(n1.titulo) LIKE '%solicitud%'
   AND lower(n1.titulo) NOT LIKE '%aceptad%'
   AND lower(n2.titulo) LIKE '%solicitud%'
   AND lower(n2.titulo) NOT LIKE '%aceptad%';
