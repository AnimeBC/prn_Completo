-- ============================================================
--  tablas9.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas8.sql.
--  SEGURO: solo crea tablas; no borra datos.
--
--  Contenido: reacciones/respuestas a las historias (story).
-- ============================================================

CREATE TABLE IF NOT EXISTS comunidad_story_reacciones (
  id         SERIAL PRIMARY KEY,
  story_id   INTEGER NOT NULL REFERENCES comunidad_stories(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  emoji      VARCHAR(8),
  texto      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comunidad_story_reacc ON comunidad_story_reacciones(story_id);

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
