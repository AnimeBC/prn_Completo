-- ============================================================
--  tablas7.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas6.sql.
--  SEGURO e IDEMPOTENTE.
--
--  Convierte las fechas de la COMUNIDAD a TIMESTAMPTZ (con zona horaria)
--  para que cada país vea la hora exacta. Asume que los valores existentes
--  están en UTC (por eso el "AT TIME ZONE 'UTC'").
-- ============================================================

DO $$
DECLARE
  pares text[][] := ARRAY[
    ['comunidades', 'created_at'], ['comunidades', 'updated_at'],
    ['comunidad_miembros', 'created_at'],
    ['comunidad_posts', 'created_at'],
    ['comunidad_post_likes', 'created_at'],
    ['comunidad_post_comentarios', 'created_at'],
    ['comunidad_post_guardados', 'created_at'],
    ['comunidad_stories', 'created_at'], ['comunidad_stories', 'expires_at'],
    ['comunidad_story_vistas', 'created_at'],
    ['comunidad_mensajes', 'created_at'],
    ['comunidad_presencia', 'last_seen'],
    ['comunidad_reportes', 'created_at'], ['comunidad_reportes', 'revisado_en'],
    ['comunidad_solicitudes', 'created_at'],
    ['comunidad_mensaje_reacciones', 'created_at']
  ];
  par text[];
BEGIN
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = par[1]
         AND column_name = par[2]
         AND data_type = 'timestamp without time zone'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
        par[1], par[2], par[2]
      );
      RAISE NOTICE 'Convertido % . % a TIMESTAMPTZ', par[1], par[2];
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
