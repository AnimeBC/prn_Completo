-- ============================================================
--  tablas7.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2..6)
--  Ejecutar DESPUÉS de tablas6.sql.
--  SEGURO: solo agrega tablas; no borra datos.
--
--  Contenido: metadatos POR MODO del hentai (título, descripción, tags,
--  tipo, año, temporada, estado). Cada modo (sub/es/en/en_sub) tiene los
--  suyos, porque el texto puede estar en español o inglés.
-- ============================================================

CREATE TABLE IF NOT EXISTS hentai_modos (
  id          SERIAL PRIMARY KEY,
  hentai_id   INTEGER NOT NULL REFERENCES hentai(id) ON DELETE CASCADE,
  modo        VARCHAR(10) NOT NULL CHECK (modo IN ('sub', 'es', 'en', 'en_sub')),
  titulo      VARCHAR(200),
  titulo_alt  VARCHAR(200),
  descripcion TEXT,
  tags        TEXT[] DEFAULT '{}',
  tipo        VARCHAR(20),
  anio        INTEGER,
  temporada   VARCHAR(40),
  estado      VARCHAR(30) DEFAULT 'En emisión',
  UNIQUE (hentai_id, modo)
);
CREATE INDEX IF NOT EXISTS idx_hentai_modos_serie ON hentai_modos(hentai_id);

-- Backfill: crea la fila 'sub' a partir de los datos actuales de la serie
INSERT INTO hentai_modos (hentai_id, modo, titulo, titulo_alt, descripcion, tags, tipo, anio, temporada, estado)
SELECT h.id, 'sub',
       COALESCE(h.titulo_es, h.titulo_en),
       COALESCE(h.titulo_ja, h.titulo_romaji),
       COALESCE(h.desc_es, h.desc_en),
       COALESCE(h.tags, '{}'),
       h.tipo, h.anio, h.temporada, h.estado
  FROM hentai h
 WHERE NOT EXISTS (SELECT 1 FROM hentai_modos m WHERE m.hentai_id = h.id AND m.modo = 'sub')
ON CONFLICT (hentai_id, modo) DO NOTHING;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
