-- ============================================================
--  tablas8.sql — INCREMENTO sobre tablas_limpias.sql (+ tablas2..7)
--  Ejecutar DESPUÉS de tablas7.sql.
--  SEGURO: solo agrega tablas/filas; no borra datos.
--
--  Contenido: tags PROPIOS del hentai (apartes de los tags de videos).
-- ============================================================

CREATE TABLE IF NOT EXISTS hentai_tags (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(60) UNIQUE NOT NULL,
  slug   VARCHAR(60) UNIQUE NOT NULL
);

INSERT INTO hentai_tags (nombre, slug) VALUES
  ('TV','tv'), ('OVA','ova'), ('ONA','ona'), ('Especial','especial'), ('Película','pelicula'),
  ('Harem','harem'), ('Ecchi','ecchi'), ('Romance','romance'), ('Comedia','comedia'),
  ('Escolar','escolar'), ('Fantasía','fantasia'), ('Isekai','isekai'), ('Sobrenatural','sobrenatural'),
  ('Acción','accion'), ('Drama','drama'), ('Netorare','netorare'), ('NTR','ntr'),
  ('Vanilla','vanilla'), ('Tetonas','tetonas'), ('Milf','milf'), ('Virgen','virgen'),
  ('Dominante','dominante'), ('Sumisa','sumisa'), ('Timido','timido'), ('Senpai','senpai'),
  ('Enfermera','enfermera'), ('Profesora','profesora'), ('Sirvienta','sirvienta'),
  ('Anal','anal'), ('Oral','oral'), ('Vaginal','vaginal'), ('Trío','trio'),
  ('Ahegao','ahegao'), ('Embarazo','embarazo'), ('Corrida Interna','corrida-interna'),
  ('Juguetes','juguetes'), ('Bondage','bondage'), ('Incesto','incesto'), ('Tentáculos','tentaculos')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
