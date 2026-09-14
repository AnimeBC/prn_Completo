-- ============================================================
--  tablas3.sql — INCREMENTO sobre tablas_limpias.sql (y tablas2.sql)
--  Ejecutar DESPUÉS de tablas2.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido: hentai como SERIE de anime con CAPÍTULOS.
--    - hentai: tags, cover (portada), pais
--    - hentai_capitulos: capítulos hijos (numero, video, calidades...)
-- ============================================================

ALTER TABLE hentai ADD COLUMN IF NOT EXISTS tags  TEXT[] DEFAULT '{}';
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS cover VARCHAR(255);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS pais  VARCHAR(80);

CREATE TABLE IF NOT EXISTS hentai_capitulos (
  id         SERIAL PRIMARY KEY,
  hentai_id  INTEGER NOT NULL REFERENCES hentai(id) ON DELETE CASCADE,
  numero     INTEGER NOT NULL DEFAULT 1,
  titulo_es  VARCHAR(200),
  titulo_en  VARCHAR(200),
  desc_es    TEXT,
  desc_en    TEXT,
  src        VARCHAR(255) NOT NULL DEFAULT '',
  thumb      VARCHAR(255),
  duracion   VARCHAR(20) DEFAULT '00:00',
  renditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  vistas     BIGINT DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (hentai_id, numero)
);

ALTER TABLE hentai_capitulos ADD COLUMN IF NOT EXISTS renditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE hentai_capitulos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_hentai_cap_serie ON hentai_capitulos(hentai_id);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
