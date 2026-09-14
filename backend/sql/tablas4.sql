-- ============================================================
--  tablas4.sql — INCREMENTO sobre tablas3.sql
--  Ejecutar DESPUÉS de tablas3.sql.
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido:
--    1) comments: dueño real (user_key) + updated_at
--    2) comment_likes: un "me gusta" por comentario y usuario
-- ============================================================

-- 1) Comentarios ligados a una cuenta real
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_key   VARCHAR(80);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_comments_user_key ON comments(user_key);
CREATE INDEX IF NOT EXISTS idx_comments_parent   ON comments(parent_id);

-- 2) Me gusta de comentarios
CREATE TABLE IF NOT EXISTS comment_likes (
  id         SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user    ON comment_likes(user_key);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
