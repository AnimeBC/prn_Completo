-- ============================================================
--  tablas9.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2..8)
--  Ejecutar DESPUÉS de tablas8.sql.
--  SEGURO: solo agrega tablas; no borra datos.
--
--  Contenido: interacciones REALES de los capítulos de hentai
--  (like/dislike, guardados, descargas y reportes), por capitulo_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS hentai_likes (
  id          SERIAL PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES hentai_capitulos(id) ON DELETE CASCADE,
  user_key    VARCHAR(80) NOT NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('like', 'dislike')),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (capitulo_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_hentai_likes_cap ON hentai_likes(capitulo_id);

CREATE TABLE IF NOT EXISTS hentai_saved (
  id          SERIAL PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES hentai_capitulos(id) ON DELETE CASCADE,
  user_key    VARCHAR(80) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (capitulo_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_hentai_saved_cap ON hentai_saved(capitulo_id);

CREATE TABLE IF NOT EXISTS hentai_downloads (
  id          SERIAL PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES hentai_capitulos(id) ON DELETE CASCADE,
  user_key    VARCHAR(80),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hentai_downloads_cap ON hentai_downloads(capitulo_id);

CREATE TABLE IF NOT EXISTS hentai_reports (
  id          SERIAL PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES hentai_capitulos(id) ON DELETE CASCADE,
  user_key    VARCHAR(80),
  motivo      VARCHAR(80),
  detalle     TEXT,
  estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hentai_reports_cap ON hentai_reports(capitulo_id);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
