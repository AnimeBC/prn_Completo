-- ============================================================
--  tablas4.sql — Packs (multi-idioma ES/EN + portada + galería)
--  Ejecutar DESPUÉS de tablas.sql, tablas2.sql y tablas3.sql
--  Base: "pikantepe"
-- ============================================================

-- ============================================================
-- 1) PACKS: campos multi-idioma y portada
-- ============================================================
ALTER TABLE packs ADD COLUMN IF NOT EXISTS slug      VARCHAR(180);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS titulo_es VARCHAR(160);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS titulo_en VARCHAR(160);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS desc_es   TEXT;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS desc_en   TEXT;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS thumb     VARCHAR(255);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS tags      TEXT[] DEFAULT '{}';

-- el título viejo deja de ser obligatorio (ahora manda titulo_es/titulo_en)
ALTER TABLE packs ALTER COLUMN titulo DROP NOT NULL;

-- migra lo existente
UPDATE packs SET titulo_es = COALESCE(titulo_es, titulo) WHERE titulo_es IS NULL;
UPDATE packs SET titulo_en = COALESCE(titulo_en, titulo) WHERE titulo_en IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_slug   ON packs(slug);
CREATE INDEX        IF NOT EXISTS idx_packs_activo ON packs(activo);

-- ============================================================
-- 2) PACK_MEDIA: fotos y videos del pack
-- ============================================================
CREATE TABLE IF NOT EXISTS pack_media (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  tipo       VARCHAR(10) NOT NULL CHECK (tipo IN ('foto','video')),
  src        VARCHAR(255) NOT NULL,
  thumb      VARCHAR(255),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pack_media_pack ON pack_media(pack_id);

-- ============================================================
-- 3) PACK_DOWNLOADS: registro de descargas por usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS pack_downloads (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pack_downloads_pack ON pack_downloads(pack_id);

-- ============================================================
-- 4) TRADUCCIONES (i18n) — textos de la sección Packs
-- ============================================================
INSERT INTO translations (lang, key, value) VALUES
  ('es','packs.titulo','Packs populares'),
  ('en','packs.titulo','Popular packs'),
  ('es','packs.subtitulo','Todos los Packs'),
  ('en','packs.subtitulo','All packs'),
  ('es','packs.buscar','Buscar por nombre o persona...'),
  ('en','packs.buscar','Search by name or person...'),
  ('es','packs.limpiar','Limpiar búsqueda'),
  ('en','packs.limpiar','Clear search'),
  ('es','packs.topDescargados','Los 10 más descargados'),
  ('en','packs.topDescargados','Top 10 downloads'),
  ('es','packs.resultados','Resultados'),
  ('en','packs.resultados','Results'),
  ('es','packs.todosPacks','Todos los packs'),
  ('en','packs.todosPacks','All packs'),
  ('es','packs.borrarFiltros','Borrar filtros'),
  ('en','packs.borrarFiltros','Clear filters'),
  ('es','packs.sinResultados','No hay packs con esos filtros por ahora.'),
  ('en','packs.sinResultados','No packs match those filters yet.'),
  ('es','packs.optDescMas','Más descargados'),
  ('en','packs.optDescMas','Most downloaded'),
  ('es','packs.optDescMenos','Menos descargados'),
  ('en','packs.optDescMenos','Least downloaded'),
  ('es','packs.optBusqMas','Más buscados'),
  ('en','packs.optBusqMas','Most searched'),
  ('es','packs.optBusqMenos','Menos buscados'),
  ('en','packs.optBusqMenos','Least searched'),
  ('es','packs.optNuevos','Nuevos primero'),
  ('en','packs.optNuevos','Newest first'),
  ('es','packs.optAntiguos','Antiguos primero'),
  ('en','packs.optAntiguos','Oldest first'),
  ('es','packs.optTodas','Todas'),
  ('en','packs.optTodas','All'),
  ('es','packs.optGrandes','Grandes (+30 fotos)'),
  ('en','packs.optGrandes','Large (+30 photos)'),
  ('es','packs.optCompletos','Completos (+3 videos)'),
  ('en','packs.optCompletos','Complete (+3 videos)'),
  ('es','packs.imagen','Imagen de pack'),
  ('en','packs.imagen','Pack image'),
  ('es','packs.badge','PACK'),
  ('en','packs.badge','PACK'),
  ('es','packs.relacionados','Packs relacionados'),
  ('en','packs.relacionados','Related packs'),
  ('es','descarga.cerrar','Cerrar'),
  ('en','descarga.cerrar','Close')
ON CONFLICT (lang, key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- 5) SEED: packs de ejemplo (multi-idioma)
-- ============================================================
INSERT INTO packs (slug, titulo_es, titulo_en, uploader, fotos, videos, desc_es, desc_en, tags, precio, download, thumb)
VALUES
  ('pack-verano-peru',
   'Pack de Verano - Perú', 'Summer Pack - Peru',
   'Canal Picante', 45, 4,
   'Playita, bikinis y mucho sol. Pack completo de verano.',
   'Beach, bikinis and lots of sun. Complete summer pack.',
   ARRAY['playa','verano','latina'], 'S/ 15.00', '#', NULL),
  ('pack-hentai-neko',
   'Pack Hentai Neko', 'Hentai Neko Pack',
   'Studio Kitsune', 32, 3,
   'Colección neko con estilo anime, exclusiva.',
   'Exclusive neko collection in anime style.',
   ARRAY['hentai','neko','anime'], 'S/ 12.00', '#', NULL),
  ('pack-fetiche-latex',
   'Pack Fetiche Látex', 'Latex Fetish Pack',
   'NekoHouse', 28, 2,
   'Body de látex y sesiones intensas.',
   'Latex bodysuit and intense sessions.',
   ARRAY['latex','fetiche'], 'S/ 18.00', '#', NULL)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- FIN — Packs listo: multi-idioma (ES/EN), portada, galería y descargas.
-- ============================================================
