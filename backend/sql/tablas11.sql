-- tablas11.sql — Match: integridad referencial con users.user_key
-- Vincula match_perfiles y match_reportes con las cuentas reales.
-- Idempotente: seguro de ejecutar varias veces, no borra datos.
-- Orden: tablas_limpias.sql -> ... -> tablas10.sql -> tablas11.sql

-- users.user_key es UNIQUE (requisito para ser referenced por FK).
-- Verificable en tablas_limpias.sql: user_key VARCHAR(80) UNIQUE.

-- 1) Perfil de match: 1:1 con la cuenta; si se borra la cuenta, se borra su perfil.
ALTER TABLE match_perfiles
  DROP CONSTRAINT IF EXISTS fk_match_perfiles_user;
ALTER TABLE match_perfiles
  ADD CONSTRAINT fk_match_perfiles_user
  FOREIGN KEY (user_key)
  REFERENCES users (user_key)
  ON DELETE CASCADE;

-- 2) Denuncias: se conservan como historial de moderacion aunque se borre
--    una de las cuentas (pasan a NULL en vez de eliminarse).
ALTER TABLE match_reportes
  ALTER COLUMN denunciante_key DROP NOT NULL;
ALTER TABLE match_reportes
  ALTER COLUMN denunciado_key DROP NOT NULL;

ALTER TABLE match_reportes
  DROP CONSTRAINT IF EXISTS fk_match_reportes_denunciante;
ALTER TABLE match_reportes
  ADD CONSTRAINT fk_match_reportes_denunciante
  FOREIGN KEY (denunciante_key)
  REFERENCES users (user_key)
  ON DELETE SET NULL;

ALTER TABLE match_reportes
  DROP CONSTRAINT IF EXISTS fk_match_reportes_denunciado;
ALTER TABLE match_reportes
  ADD CONSTRAINT fk_match_reportes_denunciado
  FOREIGN KEY (denunciado_key)
  REFERENCES users (user_key)
  ON DELETE SET NULL;
