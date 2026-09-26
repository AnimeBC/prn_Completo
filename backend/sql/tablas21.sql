-- ============================================================
-- tablas21.sql -- Comentarios POR ARCHIVO (foto/video) de una publicacion
--
-- Cada foto o video de un post tiene su propio apartado de comentarios
-- (como el visor de Facebook), aparte del hilo general de la publicacion.
--
-- columna `media` en comunidad_post_comentarios:
--   NULL  -> comentario general de la publicacion (como hasta ahora)
--   url   -> comentario del archivo concreto (p.ej. /media/community/.../foto/x.jpg)
--
-- Idempotente y seguro: solo agrega columna/indice, nunca borra datos.
-- ============================================================

ALTER TABLE comunidad_post_comentarios
  ADD COLUMN IF NOT EXISTS media VARCHAR(600);

CREATE INDEX IF NOT EXISTS idx_comunidad_coment_media
  ON comunidad_post_comentarios(post_id, media);

