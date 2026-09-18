// Solo un medio (video/audio) puede reproducirse a la vez en toda la app.
// Cuando uno empieza, pausa el anterior para evitar audio encimado y sobrecarga.

let current = null;

/** Registra el medio que acaba de empezar y pausa el anterior. */
export function soloUnoPlay(el) {
  if (!el) return;
  if (current && current !== el) {
    try { current.pause(); } catch { /* noop */ }
  }
  current = el;
}

/** Quita el medio del registro (al pausar/terminar). */
export function soloUnoStop(el) {
  if (current === el) current = null;
}

export default { soloUnoPlay, soloUnoStop };
