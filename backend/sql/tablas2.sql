-- ============================================================
--  tablas2.sql - INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUES de tablas_limpias.sql.
--  SEGURO: solo agrega; no borra datos.
--
--  Contenido: AJUSTES (configuracion global del sitio) + sonido de
--  notificaciones/mensajes.
--    ajustes.sonido_activo: activo para todos por defecto.
--    users.sonido_activo: preferencia por usuario (activa por defecto).
-- ============================================================

CREATE TABLE IF NOT EXISTS ajustes (
  clave      VARCHAR(60) PRIMARY KEY,
  valor      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sonido activo para todos por defecto.
INSERT INTO ajustes (clave, valor) VALUES ('sonido_activo', 'true')
ON CONFLICT (clave) DO NOTHING;

-- Preferencia de sonido por usuario (activo por defecto).
ALTER TABLE users ADD COLUMN IF NOT EXISTS sonido_activo BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- FIN - Incremento aplicado sin borrar datos.
-- ============================================================
