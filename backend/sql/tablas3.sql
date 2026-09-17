-- ============================================================
--  tablas3.sql — INCREMENTO sobre tablas_limpias.sql
--  Ejecutar DESPUÉS de tablas_limpias.sql.
--  SEGURO: solo crea tablas; no borra datos.
--
--  Contenido: COMUNIDAD (red social interna).
--    - comunidades: grupos/páginas (públicas o privadas) con reglas
--    - comunidad_miembros
--    - comunidad_posts: publicaciones (texto/foto/video/audio/sticker)
--    - comunidad_post_likes / _comentarios / _guardados
--    - comunidad_stories (+ vistas)  -> expiran en 24h
--    - comunidad_mensajes: chat de cada grupo
--    - comunidad_presencia: usuarios en línea
--    - comunidad_reportes: denuncias para moderación
-- ============================================================

-- ---------- Grupos / comunidades ----------
CREATE TABLE IF NOT EXISTS comunidades (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  slug        VARCHAR(160) UNIQUE,
  descripcion TEXT,
  avatar      VARCHAR(255),
  banner      VARCHAR(255),
  reglas      TEXT,
  privacidad  VARCHAR(20)  NOT NULL DEFAULT 'publica',   -- publica | privada
  solo_adultos BOOLEAN     NOT NULL DEFAULT TRUE,
  user_key    VARCHAR(80),
  miembros    BIGINT       NOT NULL DEFAULT 0,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS reglas       TEXT;
ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS privacidad   VARCHAR(20) NOT NULL DEFAULT 'publica';
ALTER TABLE comunidades ADD COLUMN IF NOT EXISTS solo_adultos BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_comunidades_activo ON comunidades(activo);

CREATE TABLE IF NOT EXISTS comunidad_miembros (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80) NOT NULL,
  usuario      VARCHAR(120),
  rol          VARCHAR(20) NOT NULL DEFAULT 'miembro',    -- miembro | moderador | dueno
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (comunidad_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_miembros_grupo ON comunidad_miembros(comunidad_id);
CREATE INDEX IF NOT EXISTS idx_comunidad_miembros_user  ON comunidad_miembros(user_key);

-- ---------- Publicaciones ----------
CREATE TABLE IF NOT EXISTS comunidad_posts (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER REFERENCES comunidades(id) ON DELETE SET NULL,
  user_key     VARCHAR(80),
  usuario      VARCHAR(120) NOT NULL,
  avatar       VARCHAR(255),
  texto        TEXT,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'texto',      -- texto|foto|video|audio|sticker
  media        JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{url,thumb,tipo,width,height,duracion}]
  likes        INTEGER NOT NULL DEFAULT 0,
  comentarios  INTEGER NOT NULL DEFAULT 0,
  compartidos  INTEGER NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);
ALTER TABLE comunidad_posts ADD COLUMN IF NOT EXISTS media  JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_comunidad_posts_activo ON comunidad_posts(activo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comunidad_posts_grupo  ON comunidad_posts(comunidad_id);
CREATE INDEX IF NOT EXISTS idx_comunidad_posts_user   ON comunidad_posts(user_key);

CREATE TABLE IF NOT EXISTS comunidad_post_likes (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES comunidad_posts(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_likes_post ON comunidad_post_likes(post_id);

CREATE TABLE IF NOT EXISTS comunidad_post_comentarios (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES comunidad_posts(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  usuario    VARCHAR(120) NOT NULL,
  avatar     VARCHAR(255),
  texto      TEXT NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comunidad_coment_post ON comunidad_post_comentarios(post_id);

CREATE TABLE IF NOT EXISTS comunidad_post_guardados (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES comunidad_posts(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_comunidad_guardados_post ON comunidad_post_guardados(post_id);

-- ---------- Historias (stories) ----------
CREATE TABLE IF NOT EXISTS comunidad_stories (
  id         SERIAL PRIMARY KEY,
  user_key   VARCHAR(80),
  usuario    VARCHAR(120) NOT NULL,
  avatar     VARCHAR(255),
  tipo       VARCHAR(20) NOT NULL DEFAULT 'foto',         -- foto|video|texto
  media      VARCHAR(255),
  texto      TEXT,
  vistas     INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_comunidad_stories_activo ON comunidad_stories(activo, expires_at DESC);

CREATE TABLE IF NOT EXISTS comunidad_story_vistas (
  id         SERIAL PRIMARY KEY,
  story_id   INTEGER NOT NULL REFERENCES comunidad_stories(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, user_key)
);

-- ---------- Chat de grupos ----------
CREATE TABLE IF NOT EXISTS comunidad_mensajes (
  id           SERIAL PRIMARY KEY,
  comunidad_id INTEGER REFERENCES comunidades(id) ON DELETE CASCADE,
  user_key     VARCHAR(80),
  usuario      VARCHAR(120) NOT NULL,
  avatar       VARCHAR(255),
  texto        TEXT,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'texto',      -- texto|foto|video|audio|sticker|emoji
  media        VARCHAR(255),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comunidad_msj_grupo ON comunidad_mensajes(comunidad_id, created_at DESC);

-- ---------- Presencia (en línea) ----------
CREATE TABLE IF NOT EXISTS comunidad_presencia (
  user_key   VARCHAR(80) PRIMARY KEY,
  usuario    VARCHAR(120),
  avatar     VARCHAR(255),
  last_seen  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Reportes / moderación ----------
CREATE TABLE IF NOT EXISTS comunidad_reportes (
  id           SERIAL PRIMARY KEY,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'post',       -- post|comentario|mensaje|story|comunidad
  target_id    INTEGER,
  comunidad_id INTEGER,
  user_key     VARCHAR(80),
  motivo       VARCHAR(80),
  detalle      TEXT,
  estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente',  -- pendiente|revisado|descartado
  nota_admin   TEXT,
  revisado_en  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comunidad_reportes_estado ON comunidad_reportes(estado);

-- ---------- Triggers updated_at ----------
DROP TRIGGER IF EXISTS trg_comunidades_updated ON comunidades;
CREATE TRIGGER trg_comunidades_updated BEFORE UPDATE ON comunidades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- SEED: comunidades base ----------
INSERT INTO comunidades (nombre, slug, descripcion, reglas, privacidad, miembros)
VALUES
  ('Fotos Calientes', 'fotos-calientes', 'Comparte y mira las mejores fotos de la comunidad.',
   '1) Solo contenido +18. 2) Prohibido contenido de menores. 3) Respeta a los demás.', 'publica', 18700),
  ('Videos XXX', 'videos-xxx', 'Los mejores videos caseros y amateur subidos por la comunidad.',
   '1) Solo contenido +18. 2) Prohibido contenido de menores. 3) No spam.', 'publica', 12400),
  ('Parejas Swingers', 'parejas-swingers', 'Espacio para parejas y experiencias en grupo.',
   '1) Solo adultos verificados. 2) Prohibido contenido de menores. 3) Respeto total.', 'privada', 9800),
  ('Amateur Perú', 'amateur-peru', 'Contenido amateur hecho en casa, comunidad peruana.',
   '1) Solo +18. 2) Contenido propio o con permiso. 3) Sin menores.', 'publica', 5400)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- FIN — Incremento aplicado sin borrar datos.
-- ============================================================
