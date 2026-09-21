-- ============================================================
-- tablas5.sql  (cambios nuevos de esquema)
-- Llamadas grupales (salas). Solo metadatos: quién, cuándo, cuánto duró.
-- No se almacena audio/video. Idempotente y sin borrar datos.
-- ============================================================

CREATE TABLE IF NOT EXISTS llamada_grupo_salas (
  id            SERIAL PRIMARY KEY,
  call_id       VARCHAR(60) NOT NULL UNIQUE,
  comunidad_id  INTEGER NOT NULL,
  iniciador_key VARCHAR(80) NOT NULL,
  tipo          VARCHAR(10) NOT NULL DEFAULT 'audio',
  estado        VARCHAR(12) NOT NULL DEFAULT 'sonando', -- sonando | activa | finalizada
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llamada_grupo_participantes (
  id            SERIAL PRIMARY KEY,
  call_id       VARCHAR(60) NOT NULL,
  user_key      VARCHAR(80) NOT NULL,
  estado        VARCHAR(12) NOT NULL DEFAULT 'invitado', -- invitado | unido | salido | rechazado
  joined_at     TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (call_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_llamada_grupo_comunidad ON llamada_grupo_salas(comunidad_id);
CREATE INDEX IF NOT EXISTS idx_llamada_grupo_call ON llamada_grupo_participantes(call_id);
