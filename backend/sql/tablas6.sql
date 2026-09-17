-- ============================================================
--  tablas6.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas5.sql.
--  SEGURO: solo corrige datos inconsistentes.
--
--  Los grupos PRIVADOS deben pedir permiso (modo_union = 'invitacion').
--  Corrige los que quedaron con 'libre'.
-- ============================================================

UPDATE comunidades
   SET modo_union = 'invitacion', updated_at = NOW()
 WHERE privacidad = 'privada'
   AND modo_union <> 'invitacion';

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
