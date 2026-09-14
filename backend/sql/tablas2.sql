-- ============================================================
--  tablas2.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas_limpias.sql.
--  SEGURO: solo agrega columnas; no borra datos.
--
--  Contenido: comentarios genéricos (video o pack).
--    - target_type: 'video' | 'pack'
--    - target_id: id del objetivo (video.id o pack.id)
-- ============================================================

ALTER TABLE comments ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'video';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS target_id   INTEGER;

-- Los comentarios existentes pertenecen a videos
UPDATE comments SET target_id = video_id WHERE target_id IS NULL AND video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
