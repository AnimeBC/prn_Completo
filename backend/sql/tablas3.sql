-- ============================================================
--  tablas3.sql — Reportes de contenido
--  Ejecutar DESPUÉS de tablas.sql y tablas2.sql (base "pikantepe")
-- ============================================================

-- ============================================================
-- 1) CATÁLOGO DE MOTIVOS DE REPORTE
-- ============================================================
CREATE TABLE IF NOT EXISTS report_motivos (
  id     SERIAL PRIMARY KEY,
  slug   VARCHAR(60)  UNIQUE NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  activo BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO report_motivos (slug, nombre) VALUES
  ('spam',            'Spam o publicidad'),
  ('menores',         'Contenido con menores de edad'),
  ('violencia',       'Violencia o agresión'),
  ('derechos',        'Derechos de autor'),
  ('contenido_ilegal','Contenido ilegal'),
  ('falso',           'Información falsa o engañosa'),
  ('otro',            'Otro motivo')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2) REPORTS: tabla base (por si no existe) + columnas de gestión
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  motivo     VARCHAR(80),
  detalle    TEXT,
  estado     VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS estado             VARCHAR(20) NOT NULL DEFAULT 'pendiente';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS motivo_slug        VARCHAR(60);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS revisado_en        TIMESTAMP;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS revisado_por       INTEGER REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS nota_admin         TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_estado ON reports(estado);
CREATE INDEX IF NOT EXISTS idx_reports_video  ON reports(video_id);
CREATE INDEX IF NOT EXISTS idx_reports_user   ON reports(user_key);

-- ============================================================
-- FIN — Los reportes llegan a "reports" y el estado inicia en 'pendiente'.
-- ============================================================
