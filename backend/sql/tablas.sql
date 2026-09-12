-- 0) EXTENSIONES Y FUNCIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1) ADMINISTRADORES (acceso /admin/login)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  usuario       VARCHAR(60)  UNIQUE NOT NULL,
  email         VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nombre        VARCHAR(120),
  rol           VARCHAR(30)  NOT NULL DEFAULT 'admin',
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  ultimo_login  TIMESTAMP,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

INSERT INTO admins (usuario, email, password_hash, nombre, rol)
VALUES ('admin', 'admin@pikantepe.com', crypt('admin123', gen_salt('bf')), 'Administrador', 'superadmin')
ON CONFLICT (usuario) DO NOTHING;

-- ============================================================
-- 2) CATEGORÍAS DE FETICHE
-- ============================================================
CREATE TABLE IF NOT EXISTS fetiche_categorias (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(60) UNIQUE NOT NULL,
  slug       VARCHAR(60) UNIQUE NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3) TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(60) UNIQUE NOT NULL,
  slug   VARCHAR(60) UNIQUE NOT NULL
);

-- ============================================================
-- 4) VIDEOS (tabla maestra: todos, fetiches y tendencias)
-- ============================================================
CREATE TABLE IF NOT EXISTS videos (
  id                   SERIAL PRIMARY KEY,
  slug                 VARCHAR(160) UNIQUE,
  titulo_es            VARCHAR(200) NOT NULL,
  titulo_en            VARCHAR(200),
  desc_es              TEXT,
  desc_en              TEXT,
  canal                VARCHAR(120) DEFAULT 'administrador pikante.pe',
  src                  VARCHAR(255) NOT NULL DEFAULT '',
  thumb                VARCHAR(255),
  descarga             VARCHAR(255),
  duracion             VARCHAR(20) DEFAULT '00:00',
  vistas               BIGINT  DEFAULT 0,
  likes                INTEGER DEFAULT 0,
  dislikes             INTEGER DEFAULT 0,
  is_fetiche           BOOLEAN NOT NULL DEFAULT FALSE,
  fetiche_categoria_id INTEGER REFERENCES fetiche_categorias(id) ON DELETE SET NULL,
  is_tendencia         BOOLEAN NOT NULL DEFAULT FALSE,
  renditions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  publicado_en         TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE videos ADD COLUMN IF NOT EXISTS titulo_en            VARCHAR(200);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS desc_en              TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS descarga             VARCHAR(255);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_fetiche           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS fetiche_categoria_id INTEGER REFERENCES fetiche_categorias(id) ON DELETE SET NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_tendencia         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS renditions           JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_videos_categoria ON videos(fetiche_categoria_id);
CREATE INDEX IF NOT EXISTS idx_videos_fetiche   ON videos(is_fetiche);
CREATE INDEX IF NOT EXISTS idx_videos_tendencia ON videos(is_tendencia);
CREATE INDEX IF NOT EXISTS idx_videos_activo    ON videos(activo);

-- Relación N:M video <-> tag
CREATE TABLE IF NOT EXISTS video_tags (
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (video_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag_id);

-- ============================================================
-- 5) HENTAI (colección aparte)
-- ============================================================
CREATE TABLE IF NOT EXISTS hentai (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(160) UNIQUE,
  titulo_es  VARCHAR(200) NOT NULL,
  titulo_en  VARCHAR(200),
  desc_es    TEXT,
  desc_en    TEXT,
  canal      VARCHAR(120) DEFAULT 'Studio Kitsune',
  src        VARCHAR(255),
  thumb      VARCHAR(255),
  duracion   VARCHAR(20) DEFAULT '00:00',
  vistas     BIGINT DEFAULT 0,
  renditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS titulo_en  VARCHAR(200);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS desc_en    TEXT;
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS thumb      VARCHAR(255);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS src        VARCHAR(255);
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS renditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE hentai ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_hentai_activo ON hentai(activo);

-- ============================================================
-- 6) PACKS
-- ============================================================
CREATE TABLE IF NOT EXISTS packs (
  id         SERIAL PRIMARY KEY,
  titulo     VARCHAR(160) NOT NULL,
  uploader   VARCHAR(120),
  fotos      INTEGER DEFAULT 0,
  videos     INTEGER DEFAULT 0,
  vistas     BIGINT DEFAULT 0,
  descargas  BIGINT DEFAULT 0,
  precio     VARCHAR(40) DEFAULT 'S/ 0.00',
  download   VARCHAR(255) DEFAULT '#',
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_packs_activo ON packs(activo);

-- ============================================================
-- 7) COMUNIDAD
-- ============================================================
CREATE TABLE IF NOT EXISTS community (
  id         SERIAL PRIMARY KEY,
  titulo     VARCHAR(200) NOT NULL,
  vistas     BIGINT DEFAULT 0,
  duracion   VARCHAR(20) DEFAULT '00:00',
  thumb      VARCHAR(255),
  src        VARCHAR(255),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_activo ON community(activo);

-- ============================================================
-- 8) LIVES
-- ============================================================
CREATE TABLE IF NOT EXISTS lives (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL,
  viewers    INTEGER DEFAULT 0,
  thumb      VARCHAR(255),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lives_activo ON lives(activo);

-- ============================================================
-- 9) COMENTARIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  usuario    VARCHAR(120) NOT NULL,
  texto      TEXT NOT NULL,
  likes      INTEGER DEFAULT 0,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);

-- ============================================================
-- 10) APORTANTES
-- ============================================================
CREATE TABLE IF NOT EXISTS aportantes (
  id                SERIAL PRIMARY KEY,
  dni               VARCHAR(15) UNIQUE NOT NULL,
  nombres           VARCHAR(200) NOT NULL,
  email             VARCHAR(150),
  telefono          VARCHAR(30),
  departamento      VARCHAR(80),
  provincia         VARCHAR(80),
  distrito          VARCHAR(80),
  monto_aporte      NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_bono   NUMERIC(5,2)  NOT NULL DEFAULT 8,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  contrato_numero   VARCHAR(60),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO aportantes (dni, nombres, email, departamento, provincia, distrito, monto_aporte, porcentaje_bono, contrato_numero)
VALUES ('71923609', 'JHON ANDERSON CURASMA CASAVILCA', NULL, 'HUANCAVELICA', 'HUANCAVELICA', 'ASCENSION', 2199.00, 8, 'PKP-2026-71923609-RUC20539980387')
ON CONFLICT (dni) DO NOTHING;

-- ============================================================
-- 11) PERFILES DE USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  user_key      VARCHAR(80) UNIQUE,
  nombre        VARCHAR(120),
  email         VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255),
  avatar        VARCHAR(255),
  rol           VARCHAR(30) NOT NULL DEFAULT 'user',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12) CANALES (autores) + seguidores
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) UNIQUE NOT NULL,
  descripcion TEXT,
  avatar      VARCHAR(255),
  seguidores  BIGINT NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO channels (nombre) VALUES
  ('administrador pikante.pe'),
  ('Studio Kitsune'), ('Sakura Films'), ('Otaku Dreams'),
  ('NekoHouse'), ('Sensei Prod'), ('Hana Studio')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 13) INTERACCIONES DE VIDEO
-- ============================================================
CREATE TABLE IF NOT EXISTS video_likes (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  tipo       VARCHAR(10) NOT NULL CHECK (tipo IN ('like','dislike')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (video_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_likes_video ON video_likes(video_id);

CREATE TABLE IF NOT EXISTS video_views (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  ip         VARCHAR(60),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_views_video ON video_views(video_id);

CREATE TABLE IF NOT EXISTS saved_videos (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (video_id, user_key)
);
CREATE INDEX IF NOT EXISTS idx_saved_video ON saved_videos(video_id);

CREATE TABLE IF NOT EXISTS reports (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  motivo     VARCHAR(80),
  detalle    TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS downloads (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_key   VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_downloads_video ON downloads(video_id);

CREATE TABLE IF NOT EXISTS shares (
  id         SERIAL PRIMARY KEY,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  red        VARCHAR(40),
  user_key   VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14) SUSCRIPCIONES (seguir canal)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id         SERIAL PRIMARY KEY,
  channel    VARCHAR(120) NOT NULL,
  user_key   VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (channel, user_key)
);
CREATE INDEX IF NOT EXISTS idx_subs_channel ON subscriptions(channel);

-- ============================================================
-- 15) IDIOMAS + TRADUCCIONES (i18n)
-- ============================================================
CREATE TABLE IF NOT EXISTS languages (
  code   VARCHAR(5) PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO languages (code, nombre) VALUES ('es','Español'), ('en','English')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS translations (
  id    SERIAL PRIMARY KEY,
  lang  VARCHAR(5) NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  key   VARCHAR(120) NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (lang, key)
);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON translations(lang);

INSERT INTO translations (lang, key, value) VALUES
  ('es','video.like','Me gusta'),          ('en','video.like','Like'),
  ('es','video.dislike','No me gusta'),    ('en','video.dislike','Dislike'),
  ('es','video.guardar','Guardar'),        ('en','video.guardar','Save'),
  ('es','video.guardado','Guardado'),      ('en','video.guardado','Saved'),
  ('es','video.compartir','Compartir'),    ('en','video.compartir','Share'),
  ('es','video.descargar','Descargar'),    ('en','video.descargar','Download'),
  ('es','video.reportar','Reportar'),      ('en','video.reportar','Report'),
  ('es','video.reportado','Reportado'),    ('en','video.reportado','Reported'),
  ('es','video.seguir','Seguir'),          ('en','video.seguir','Follow'),
  ('es','video.siguiendo','Siguiendo'),    ('en','video.siguiendo','Following'),
  ('es','video.suscriptores','suscriptores'), ('en','video.suscriptores','subscribers'),
  ('es','video.etiquetas','Etiquetas:'),   ('en','video.etiquetas','Tags:'),
  ('es','video.mostrarMas','Mostrar más'), ('en','video.mostrarMas','Show more'),
  ('es','video.mostrarMenos','Mostrar menos'), ('en','video.mostrarMenos','Show less'),
  ('es','video.aContinuacion','A continuación'), ('en','video.aContinuacion','Up next'),
  ('es','video.masVideos','Más videos'),   ('en','video.masVideos','More videos'),
  ('es','video.proximamente','Subiremos más próximamente 👑'), ('en','video.proximamente','More videos coming soon 👑'),
  ('es','comentarios.titulo','comentarios'), ('en','comentarios.titulo','comments'),
  ('es','comentarios.agrega','Agrega un comentario...'), ('en','comentarios.agrega','Add a comment...'),
  ('es','comentarios.comentar','Comentar'), ('en','comentarios.comentar','Comment'),
  ('es','compartir.titulo','Compartir'),   ('en','compartir.titulo','Share'),
  ('es','compartir.copiar','Copiar enlace'), ('en','compartir.copiar','Copy link'),
  ('es','compartir.copiado','¡Copiado!'),  ('en','compartir.copiado','Copied!')
ON CONFLICT (lang, key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- 16) TRIGGERS updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_admins_updated ON admins;
CREATE TRIGGER trg_admins_updated BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_videos_updated ON videos;
CREATE TRIGGER trg_videos_updated BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hentai_updated ON hentai;
CREATE TRIGGER trg_hentai_updated BEFORE UPDATE ON hentai
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_packs_updated ON packs;
CREATE TRIGGER trg_packs_updated BEFORE UPDATE ON packs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aportantes_updated ON aportantes;
CREATE TRIGGER trg_aportantes_updated BEFORE UPDATE ON aportantes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 17) SEED: categorías de fetiche + tags base
-- ============================================================
INSERT INTO fetiche_categorias (nombre, slug) VALUES
  ('Japonesa', 'japonesa'), ('Orgía', 'orgia'), ('Viral', 'viral'),
  ('Pedido', 'pedido'), ('Latex', 'latex'), ('En carro', 'en-carro'), ('Obligada', 'obligada')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tags (nombre, slug) VALUES
  ('HD', 'hd'), ('4K', '4k'), ('JAV', 'jav'), ('Tendencia', 'tendencia'),
  ('Japonesa', 'japonesa'), ('Viral', 'viral'), ('Oral', 'oral'),
  ('Vaginal', 'vaginal'), ('Anal', 'anal'), ('trío', 'trio'),
  ('Amateur', 'amateur'), ('Latina', 'latina'), ('MILF', 'milf'),
  ('Gritona', 'gritona'), ('Fetiche', 'fetiche')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 18) DATOS DE EJEMPLO: 10 videos (sin archivo; súbelos desde el admin)
-- ============================================================
CREATE OR REPLACE FUNCTION _seed_video(
  p_titulo_es   TEXT,
  p_titulo_en   TEXT,
  p_desc_es     TEXT,
  p_desc_en     TEXT,
  p_duracion    TEXT,
  p_vistas      BIGINT,
  p_is_fetiche  BOOLEAN,
  p_categoria   TEXT,
  p_is_tendencia BOOLEAN,
  p_tags        TEXT[]
) RETURNS INTEGER AS $$
DECLARE
  v_id   INTEGER;
  c_id   INTEGER;
  t      TEXT;
  t_id   INTEGER;
  t_slug TEXT;
  c_slug TEXT;
BEGIN
  SELECT id INTO v_id FROM videos WHERE titulo_es = p_titulo_es LIMIT 1;

  IF v_id IS NULL THEN
    IF p_is_fetiche AND p_categoria IS NOT NULL THEN
      c_slug := trim(both '-' from lower(regexp_replace(p_categoria, '[^a-zA-Z0-9]+', '-', 'g')));
      INSERT INTO fetiche_categorias (nombre, slug)
      VALUES (p_categoria, c_slug)
      ON CONFLICT (nombre) DO NOTHING;
      SELECT id INTO c_id FROM fetiche_categorias WHERE nombre = p_categoria;
    END IF;

    INSERT INTO videos
      (titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga,
       duracion, vistas, is_fetiche, fetiche_categoria_id, is_tendencia, activo)
    VALUES
      (p_titulo_es, p_titulo_en, p_desc_es, p_desc_en, 'administrador pikante.pe',
       '', NULL, NULL, p_duracion, p_vistas, p_is_fetiche, c_id, p_is_tendencia, TRUE)
    RETURNING id INTO v_id;
  END IF;

  FOREACH t IN ARRAY p_tags LOOP
    t_slug := trim(both '-' from lower(regexp_replace(t, '[^a-zA-Z0-9]+', '-', 'g')));
    INSERT INTO tags (nombre, slug)
    VALUES (t, t_slug)
    ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre;
    SELECT id INTO t_id FROM tags WHERE nombre = t;
    INSERT INTO video_tags (video_id, tag_id) VALUES (v_id, t_id) ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

SELECT _seed_video('Familia Japonesa Película Porno', 'Japanese Family Porn Movie',
  'La mejor recomendación de la casa: una película japonesa en familia que es tendencia en la comunidad.',
  'The house''s top recommendation: a Japanese family movie trending in the community.',
  '2:32:50', 12480, TRUE, 'Japonesa', TRUE, ARRAY['Japonesa','Orgía','Tendencia','JAV','HD']);

SELECT _seed_video('Kchame Viral', 'Kchame Viral',
  'El video de Kchame que está rompiendo el internet, viral en todos lados.',
  'Kchame''s video that''s breaking the internet, viral everywhere.',
  '2:31', 8120, TRUE, 'Viral', TRUE, ARRAY['Viral','Tendencia','HD']);

SELECT _seed_video('Zully - Pedido en la Bbaarmy', 'Zully - Requested by the Bbaarmy',
  'El video de Zully que pidió la Bbaarmy, recién salido del horno.',
  'Zully''s video requested by the Bbaarmy, fresh out of the oven.',
  '1:02', 5340, TRUE, 'Pedido', TRUE, ARRAY['Pedido','Tendencia','HD']);

SELECT _seed_video('Nena gritona en latex', 'Screaming girl in latex',
  'Body de látex, gritos y una noche que se sale de control.',
  'Latex bodysuit, screaming and a night that gets out of control.',
  '08:36', 4300, TRUE, 'Latex', TRUE, ARRAY['Latex','HD','Tendencia','Fetiche','Gritona','Vaginal']);

SELECT _seed_video('Sedienta de PENE XD (lit)', 'Thirsty for DICK XD (lit)',
  'Literalmente sedienta, sin filtro y sin censura.',
  'Literally thirsty, no filter, no censorship.',
  '05:55', 5100, FALSE, NULL, FALSE, ARRAY['HD','Oral','Gritona','Vaginal','Insaciable']);

SELECT _seed_video('En el carro, rico', 'In the car, so good',
  'Rapidito en el carro, con adrenalina de que alguien pase.',
  'A quickie in the car, with the thrill of someone walking by.',
  '02:50', 5400, TRUE, 'En carro', FALSE, ARRAY['En carro','Fetiche','Vaginal']);

SELECT _seed_video('Borracha Vengandose 😈', 'Drunk Girl Getting Revenge 😈',
  'Borracha y con ganas de vengarse, no se lo esperaba nadie.',
  'Drunk and out for revenge, nobody saw it coming.',
  '00:53', 1700, FALSE, NULL, FALSE, ARRAY['Borracha','Fetiche','HD','Oral','Vaginal','Argentina']);

SELECT _seed_video('Trio con masoquista', 'Threesome with a masochist',
  'Un trío intenso con una masoquista que pide más.',
  'An intense threesome with a masochist who begs for more.',
  '00:39', 5100, FALSE, NULL, FALSE, ARRAY['trío','Oral','Vaginal']);

SELECT _seed_video('Japonesa con DILDOO', 'Japanese girl with a DILDO',
  'Japonesa con su juguete favorito, cortito pero intenso.',
  'Japanese girl with her favorite toy, short but intense.',
  '00:18', 7300, FALSE, NULL, FALSE, ARRAY['Japonesa','Dildo','Masturbacion']);

SELECT _seed_video('Obligada :(', 'Forced :(',
  'Una chica obligada mientras su marido mira. No sé si sentir pena o no, pero F :(',
  'A girl forced while her husband watches. Not sure whether to feel sorry or not, but F :(',
  '00:40', 4600, TRUE, 'Obligada', TRUE, ARRAY['Obligada','NTR?','Fetiche','Tendencia','Vaginal']);

DROP FUNCTION IF EXISTS _seed_video(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN, TEXT, BOOLEAN, TEXT[]);

-- ============================================================
-- FIN — Base lista. Admin: admin / admin123
-- (o crea otro con: npm run seed:admin)
-- ============================================================
