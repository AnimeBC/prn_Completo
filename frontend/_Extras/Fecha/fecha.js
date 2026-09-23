import { DateTime } from 'luxon';

/** Zona horaria del navegador del usuario (cada país ve su hora correcta). */
export function tzLocal() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function toDT(ts) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return DateTime.fromJSDate(d, { zone: tzLocal() });
}

function loc(locale) {
  return locale === 'en' ? 'en' : 'es';
}

/** Fecha + hora exactas en la zona del usuario. Ej: "16 de setiembre de 2026, 19:13" */
export function fecha(ts, locale = 'es', patron = "d 'de' LLLL 'de' yyyy, HH:mm") {
  const dt = toDT(ts);
  return dt ? dt.setLocale(loc(locale)).toFormat(patron) : '';
}

/** Fecha corta exacta. Ej: "16 set 2026, 19:13" */
export function fechaCorta(ts, locale = 'es') {
  return fecha(ts, locale, 'd LLL yyyy, HH:mm');
}

/** Solo la hora. Ej: "19:13" */
export function hora(ts) {
  const dt = toDT(ts);
  return dt ? dt.toFormat('HH:mm') : '';
}

/** Relativo en la zona del usuario. Ej: "hace 5 minutos" */
export function hace(ts, locale = 'es') {
  const dt = toDT(ts);
  if (!dt) return '';
  return dt.setLocale(loc(locale)).toRelative() || '';
}

/**
 * Estado de presencia REAL segun la edad en SEGUNDOS (la calcula el backend
 * con el reloj de la BD -> sin problemas de zona horaria).
 * < 2 min = en línea (el latido global manda cada 60s); si no, relativo:
 * "hace 5 min" / "hace 3 h" / "hace 2 d" / "desconectado".
 */
export function presenciaEstado(edad, locale = 'es') {
  const es = locale !== 'en';
  const s = Number(edad);
  if (!Number.isFinite(s) || s < 0) return { online: false, label: es ? 'desconectado' : 'offline' };
  if (s < 120) return { online: true, label: es ? 'en línea' : 'online' };
  if (s < 3600) {
    const m = Math.max(1, Math.round(s / 60));
    return { online: false, label: es ? `hace ${m} min` : `${m}m ago` };
  }
  if (s < 86400) {
    const h = Math.max(1, Math.round(s / 3600));
    return { online: false, label: es ? `hace ${h} h` : `${h}h ago` };
  }
  const d = Math.max(1, Math.round(s / 86400));
  return { online: false, label: es ? `hace ${d} d` : `${d}d ago` };
}

export default { fecha, fechaCorta, hora, hace, tzLocal, presenciaEstado };
