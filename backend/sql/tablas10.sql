-- tablas10.sql — Match (videollamada aleatoria estilo Omegle)
-- Perfiles de emparejamiento (edad/género/intereses) y denuncias de cuentas.
-- Idempotente: seguro de ejecutar varias veces, no borra datos.

CREATE TABLE IF NOT EXISTS match_perfiles (
  user_key VARCHAR(80) PRIMARY KEY,
  edad SMALLINT NOT NULL CHECK (edad >= 18 AND edad <= 99),
  genero VARCHAR(20) NOT NULL DEFAULT 'no',
  intereses TEXT NOT NULL DEFAULT '[]',
  actualizado_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_reportes (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(60),
  denunciante_key VARCHAR(80) NOT NULL,
  denunciado_key VARCHAR(80) NOT NULL,
  motivo VARCHAR(60) NOT NULL,
  detalle TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_reportes_estado ON match_reportes (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_reportes_denunciado ON match_reportes (denunciado_key);
