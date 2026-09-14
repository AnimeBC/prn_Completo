-- ============================================================
--  tablas5.sql — INCREMENTO sobre tablas4.sql
--  Ejecutar DESPUÉS de tablas4.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido: perfiles públicos de canales (autores)
--    1) channels: slug, avatar, banner, pais, verificado, user_key, updated_at
--    2) crear un canal por cada canal usado en videos
--    3) backfill de slug + admin verificado
-- ============================================================

ALTER TABLE channels ADD COLUMN IF NOT EXISTS slug       VARCHAR(160);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS banner     VARCHAR(255);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS pais       VARCHAR(80);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_key   VARCHAR(80);
ALTER TABLE channels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Un canal por cada canal usado en los videos (por si subieron con uno nuevo)
INSERT INTO channels (nombre)
SELECT DISTINCT canal FROM videos
 WHERE canal IS NOT NULL AND trim(canal) <> ''
ON CONFLICT (nombre) DO NOTHING;

-- slug legible (minusculas, no-alfanumerico -> guion)
UPDATE channels
   SET slug = trim(both '-' from regexp_replace(lower(nombre), '[^a-z0-9]+', '-', 'g'))
 WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);

-- Canal oficial del admin: verificado + avatar/descripcion por defecto
UPDATE channels
   SET verificado  = TRUE,
       avatar      = COALESCE(avatar, '/logo.png'),
       descripcion = COALESCE(descripcion, 'Canal oficial de pikante pe. Subimos el mejor contenido picante para ti.'),
       updated_at  = NOW()
 WHERE nombre ILIKE '%pikante%';

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
