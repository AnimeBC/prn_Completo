-- ============================================================
-- tablas13.sql — Notificaciones (admin/publicas + por usuario)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

-- Avisos: user_key NULL = aviso publico del admin (lo ven todos, incluso invitados)
CREATE TABLE IF NOT EXISTS notificaciones (
  id           SERIAL PRIMARY KEY,
  user_key     VARCHAR(80),
  tipo         VARCHAR(40) NOT NULL DEFAULT 'sistema',
  titulo       VARCHAR(160) NOT NULL,
  texto        TEXT,
  url          VARCHAR(300),
  icono        VARCHAR(40),
  actor_key    VARCHAR(80),
  actor_nombre VARCHAR(120),
  actor_avatar VARCHAR(255),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notificaciones(user_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notificaciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_tipo    ON notificaciones(tipo);

-- Estado de leido por usuario (sirve para avisos personales y publicos)
CREATE TABLE IF NOT EXISTS notificaciones_leidas (
  id              SERIAL PRIMARY KEY,
  user_key        VARCHAR(80) NOT NULL,
  notificacion_id INTEGER NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
  leida_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_key, notificacion_id)
);
CREATE INDEX IF NOT EXISTS idx_notif_leidas_user ON notificaciones_leidas(user_key);
