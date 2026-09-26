-- ============================================================
-- tablas20.sql -- Publicaciones de grupo estilo Facebook
--
--  1) Posts anonimos, con sentimiento y encuestas con votos.
--  2) Posts destacados (fijados) por el dueno/semidueno del grupo.
--  3) Reacciones multiples en "me gusta" (like/love/joy/wow/sad/angry).
--  4) Respuestas a comentarios (un nivel) y "me gusta" en comentarios.
--
-- Idempotente y seguro: solo agrega columnas/tablas, nunca borra datos.
-- ============================================================

-- 1) Nuevas columnas de publicacion.
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS anonimo     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS sentimiento VARCHAR(30);
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS encuesta    JSONB;
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS fijado      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS fijado_en   TIMESTAMP;

-- Feed del grupo: los destacados arriba.
CREATE INDEX IF NOT EXISTS idx_comunidad_posts_fijado
    ON comunidad_posts(comunidad_id, fijado DESC, created_at DESC);

-- 2) Reaccion propia de cada persona (por defecto "me gusta").
ALTER TABLE comunidad_post_likes ADD COLUMN IF NOT EXISTS reaccion VARCHAR(20) NOT NULL DEFAULT 'like';

-- 3) Respuestas a comentarios (un solo nivel).
ALTER TABLE comunidad_post_comentarios
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES comunidad_post_comentarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comunidad_coment_parent ON comunidad_post_comentarios(parent_id);

-- "Me gusta" en comentarios.
CREATE TABLE IF NOT EXISTS comunidad_post_comentario_likes (
  id            SERIAL PRIMARY KEY,
  comentario_id INTEGER NOT NULL REFERENCES comunidad_post_comentarios(id) ON DELETE CASCADE,
  user_key      VARCHAR(80) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comentario_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_cmt_likes ON comunidad_post_comentario_likes(comentario_id);

-- 4) Votos de encuestas (una respuesta por persona, se puede cambiar).
CREATE TABLE IF NOT EXISTS comunidad_post_encuesta_votos (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES comunidad_posts(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  opcion     VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_votos_post ON comunidad_post_encuesta_votos(post_id);
