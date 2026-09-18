-- ============================================================
-- tablas18.sql — Temas (diseños) para el chat entre amigos
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_temas (
  id       SERIAL PRIMARY KEY,
  nombre   VARCHAR(60) UNIQUE NOT NULL,
  gradient TEXT NOT NULL,
  activo   BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO chat_temas (nombre, gradient) VALUES
  ('Neón',      'linear-gradient(135deg,#12002f,#ff00cc,#333399)'),
  ('Atardecer', 'linear-gradient(135deg,#ff512f,#dd2476)'),
  ('Océano',    'linear-gradient(135deg,#2193b0,#6dd5ed)'),
  ('Bosque',    'linear-gradient(135deg,#134e5e,#71b280)'),
  ('Fuego',     'linear-gradient(135deg,#f12711,#f5af19)'),
  ('Uva',       'linear-gradient(135deg,#654ea3,#eaafc8)'),
  ('Medianoche','linear-gradient(135deg,#232526,#414345)'),
  ('Rosa',      'linear-gradient(135deg,#ee9ca7,#ffdde1)')
ON CONFLICT (nombre) DO NOTHING;
