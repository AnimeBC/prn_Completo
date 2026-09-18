-- ============================================================
-- tablas19.sql — Más diseños (gradientes) para el chat entre amigos
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

INSERT INTO chat_temas (nombre, gradient) VALUES
  ('Ciberpunk', 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)'),
  ('Menta',     'linear-gradient(135deg,#43cea2,#185a9d)'),
  ('Cereza',    'linear-gradient(135deg,#eb3349,#f45c43)'),
  ('Lavanda',   'linear-gradient(135deg,#8e2de2,#4a00e0)'),
  ('Dorado',    'linear-gradient(135deg,#f7971e,#ffd200)'),
  ('Aqua',      'linear-gradient(135deg,#00c6ff,#0072ff)'),
  ('Coral',     'linear-gradient(135deg,#ff9966,#ff5e62)'),
  ('Selva',     'linear-gradient(135deg,#093028,#237a57)'),
  ('Vino',      'linear-gradient(135deg,#4b134f,#c94b4b)'),
  ('Noche',     'linear-gradient(135deg,#141e30,#243b55)')
ON CONFLICT (nombre) DO NOTHING;
