-- ============================================================
-- tablas3.sql  (cambios nuevos de esquema)
-- Amistades: solicitudes, amigos y favoritos entre usuarios.
-- Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS amistades (
  id           SERIAL PRIMARY KEY,
  a_key        VARCHAR(80) NOT NULL,
  b_key        VARCHAR(80) NOT NULL,
  solicitante  VARCHAR(80) NOT NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'pendiente', -- pendiente | aceptado
  favorito_a   BOOLEAN NOT NULL DEFAULT FALSE,
  favorito_b   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (a_key, b_key)
);

CREATE INDEX IF NOT EXISTS idx_amistades_a ON amistades(a_key);
CREATE INDEX IF NOT EXISTS idx_amistades_b ON amistades(b_key);
