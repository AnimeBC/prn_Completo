-- ============================================================
--  tablas5.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2..4)
--  Ejecutar DESPUÉS de tablas4.sql.
--  SEGURO: solo habilita más opciones; no borra datos.
--
--  Contenido: 4 modos por capítulo de hentai:
--    sub    = Subtitulado en Español
--    es     = Español (doblado)
--    en     = Inglés (doblado)
--    en_sub = Inglés subtitulado
-- ============================================================

ALTER TABLE hentai_capitulo_fuentes DROP CONSTRAINT IF EXISTS hentai_capitulo_fuentes_modo_check;
ALTER TABLE hentai_capitulo_fuentes ADD CONSTRAINT hentai_capitulo_fuentes_modo_check
  CHECK (modo IN ('sub', 'es', 'en', 'en_sub'));

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
