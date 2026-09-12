-- ============================================================
--  tablas5.sql — Interacciones de Packs (like/dislike/guardar/compartir)
--  Ejecutar DESPUÉS de tablas4.sql (base "pikantepe")
-- ============================================================

-- 1) Contadores en la tabla packs (para el listado)
ALTER TABLE packs ADD COLUMN IF NOT EXISTS likes     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS dislikes  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS guardados INTEGER NOT NULL DEFAULT 0;

-- 2) PACK_LIKES: me gusta / no me gusta por usuario
CREATE TABLE IF NOT EXISTS pack_likes (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  tipo       VARCHAR(10) NOT NULL CHECK (tipo IN ('like','dislike')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_pack_likes_pack ON pack_likes(pack_id);

-- 3) PACK_SAVES: packs guardados por usuario
CREATE TABLE IF NOT EXISTS pack_saves (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_pack_saves_pack ON pack_saves(pack_id);

-- 4) PACK_SHARES: registro de compartidos
CREATE TABLE IF NOT EXISTS pack_shares (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  red        VARCHAR(40),
  user_key   VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pack_shares_pack ON pack_shares(pack_id);

-- ============================================================
-- FIN — Packs con like/dislike, guardado y compartir.
-- ============================================================
