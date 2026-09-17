-- ============================================================
-- tablas12.sql — Reportes con IP (video, hentai y comunidad)
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

-- IP de origen del reporte (se toma de x-forwarded-for / remoteAddress)
ALTER TABLE reports           ADD COLUMN IF NOT EXISTS ip VARCHAR(60);
ALTER TABLE hentai_reports    ADD COLUMN IF NOT EXISTS ip VARCHAR(60);
ALTER TABLE comunidad_reportes ADD COLUMN IF NOT EXISTS ip VARCHAR(60);

CREATE INDEX IF NOT EXISTS idx_reports_ip          ON reports(ip);
CREATE INDEX IF NOT EXISTS idx_hentai_reports_ip   ON hentai_reports(ip);
CREATE INDEX IF NOT EXISTS idx_comunidad_reports_ip ON comunidad_reportes(ip);
