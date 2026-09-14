-- ============================================================
--  tablas7.sql — INCREMENTO sobre tablas6.sql
--  Ejecutar DESPUÉS de tablas6.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: posición (encuadre) de la foto y la portada del canal.
--  Formato: "50% 50%" (object-position / background-position).
-- ============================================================

ALTER TABLE channels ADD COLUMN IF NOT EXISTS avatar_pos VARCHAR(20) DEFAULT '50% 50%';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS banner_pos VARCHAR(20) DEFAULT '50% 50%';

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
