-- ============================================================
--  tabla1.sql — Migración INCREMENTAL (SEGURA, NO BORRA DATOS)
--  Agrega el identificador público de packs y la tabla de
--  tokens de descarga. Ejecutar en el VPS sobre la base existente.
--
--  Lo que hace (todo aditivo):
--    1) Agrega la columna packs.public_id (si no existe)
--    2) Rellena public_id SOLO donde esté vacío (no toca datos)
--    3) Crea el índice único de public_id
--    4) Crea la tabla pack_download_tokens (si no existe)
--  No hace DROP ni DELETE de ninguna tabla con datos.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Identificador público aleatorio (32 chars) por pack
ALTER TABLE packs ADD COLUMN IF NOT EXISTS public_id VARCHAR(32);

-- 2) Rellena solo los que estén en NULL (no modifica los que ya tienen)
UPDATE packs SET public_id = encode(gen_random_bytes(16), 'hex') WHERE public_id IS NULL;

-- 3) Índice único
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_public_id ON packs(public_id);

-- 4) Tokens de descarga (un token activo por pack + usuario; se guarda el hash)
CREATE TABLE IF NOT EXISTS pack_download_tokens (
  id         SERIAL PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip         VARCHAR(60),
  UNIQUE (pack_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_pack_tokens_pack ON pack_download_tokens(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_tokens_hash ON pack_download_tokens(token_hash);

-- ============================================================
-- FIN — Migración aplicada. No se borró ningún registro.
-- ============================================================
