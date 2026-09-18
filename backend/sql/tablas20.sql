-- ============================================================
-- tablas20.sql — Apodos entre amigos (dos: uno por cada persona)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS dm_apodos (
  id              SERIAL PRIMARY KEY,
  conversacion_id INTEGER UNIQUE NOT NULL REFERENCES dm_conversaciones(id) ON DELETE CASCADE,
  a_alias         VARCHAR(60),
  b_alias         VARCHAR(60),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
