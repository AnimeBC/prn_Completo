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

export default { fecha, fechaCorta, hora, hace, tzLocal };
