-- ============================================================
-- tablas4.sql  (cambios nuevos de esquema)
-- Llamadas de voz/video (solo metadatos: quién, cuándo, cuánto duró).
-- No se almacena audio/video. Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS llamadas (
  id            SERIAL PRIMARY KEY,
  call_id       VARCHAR(60) NOT NULL UNIQUE,
  de_key        VARCHAR(80) NOT NULL,
  para_key      VARCHAR(80) NOT NULL,
  tipo          VARCHAR(10) NOT NULL DEFAULT 'audio',   -- audio | video
  estado        VARCHAR(12) NOT NULL DEFAULT 'sonando',  -- sonando | activa | finalizada | rechazada | perdida | cancelada
  iniciada_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  aceptada_at   TIMESTAMP,
  finalizada_at TIMESTAMP,
  duracion_seg  INTEGER NOT NULL DEFAULT 0,
  motivo        VARCHAR(40),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llamadas_de ON llamadas(de_key);
CREATE INDEX IF NOT EXISTS idx_llamadas_para ON llamadas(para_key);
CREATE INDEX IF NOT EXISTS idx_llamadas_created ON llamadas(created_at DESC);
