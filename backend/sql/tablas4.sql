-- ============================================================
--  tablas4.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2, tablas3)
--  Ejecutar DESPUÉS de tablas3.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido:
--    - hentai: metadatos estilo MyAnimeList (tipo, año, temporada, estado,
--      rating y votos)
--    - hentai_capitulo_fuentes: cada capítulo puede tener 2 modos:
--         'sub' = Subtitulado   /   'es' = Español (doblado)
-- ============================================================

ALTER TABLE hentai ADD COLUMN IF NOT EXISTS tipo      VARCHAR(20);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS anio      INTEGER;
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS temporada VARCHAR(40);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS estado    VARCHAR(30) DEFAULT 'En emisión';
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS rating    NUMERIC(3,1) DEFAULT 0;
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS votos     INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS hentai_capitulo_fuentes (
  id          SERIAL PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES hentai_capitulos(id) ON DELETE CASCADE,
  modo        VARCHAR(10) NOT NULL DEFAULT 'sub' CHECK (modo IN ('sub', 'es')),
  src         VARCHAR(255) NOT NULL DEFAULT '',
  thumb       VARCHAR(255),
  duracion    VARCHAR(20) DEFAULT '00:00',
  renditions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (capitulo_id, modo)
);
CREATE INDEX IF NOT EXISTS idx_hentai_fuentes_cap ON hentai_capitulo_fuentes(capitulo_id);

-- Migrar capítulos existentes (si los hubiera) a una fuente 'sub'
INSERT INTO hentai_capitulo_fuentes (capitulo_id, modo, src, thumb, duracion, renditions)
SELECT c.id, 'sub', c.src, c.thumb, c.duracion, c.renditions
  FROM hentai_capitulos c
 WHERE c.src <> ''
   AND NOT EXISTS (SELECT 1 FROM hentai_capitulo_fuentes f WHERE f.capitulo_id = c.id)
ON CONFLICT (capitulo_id, modo) DO NOTHING;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
