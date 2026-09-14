-- ============================================================
--  tablas2.sql — INCREMENTO sobre tablas.sql
--  Ejecutar DESPUÉS de tablas.sql (base "pikantepe").
--  SEGURO: solo agrega columnas/tablas; no borra datos.
--
--  Contenido:
--    1) packs.public_id      (identificador público aleatorio)
--    2) packs.pack_dir       (carpeta del pack en media_completa)
--    3) pack_download_tokens (tokens de descarga por pack + usuario)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Identificador público de packs (32 hex)
ALTER TABLE packs ADD COLUMN IF NOT EXISTS public_id VARCHAR(32);
UPDATE packs SET public_id = encode(gen_random_bytes(16), 'hex') WHERE public_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_public_id ON packs(public_id);

-- 2) Carpeta física del pack (media_completa/packs/...)
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pack_dir VARCHAR(255);

-- 3) Tokens de descarga (un token activo por pack + usuario; se guarda el hash)
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
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
