'use client';

// Sonido de notificaciones/mensajes. Un solo Audio reutilizable, con
// desbloqueo por primer gesto (los navegadores lo exigen) y silencio local.

const SRC = '/notificacion.mp3';
const SRC_LLAMADA = '/llamadas.mp3';
const LS_MUTE = 'pkp_sonido_mute';

let audioEl = null;
let ringEl = null;
let unlocked = false;
let activoGlobal = true;
let ultimo = 0;

function ensure() {
  if (typeof window === 'undefined') return null;
  if (!audioEl) {
    audioEl = new window.Audio(SRC);
    audioEl.preload = 'auto';
    audioEl.volume = 0.5;
  }
  return audioEl;
}

function ensureRing() {
  if (typeof window === 'undefined') return null;
  if (!ringEl) {
    ringEl = new window.Audio(SRC_LLAMADA);
    ringEl.preload = 'auto';
    ringEl.volume = 0.6;
    ringEl.loop = true;
  }
  return ringEl;
}

/** Ajuste global (viene del backend). */
export function setSonidoActivo(v) { activoGlobal = v !== false; }

/** Silencio local del dispositivo. */
export function isMuted() {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(LS_MUTE) === '1'; } catch { return false; }
}
export function setMuted(m) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_MUTE, m ? '1' : '0'); } catch { /* noop */ }
}
export function toggleMuted() {
  const next = !isMuted();
  setMuted(next);
  return next;
}

/** Desbloquea el audio al primer gesto del usuario. */
export function initSonido() {
  if (typeof window === 'undefined') return;
  const desbloquear = () => {
    const a = ensure();
    if (a && !unlocked) {
      const p = a.play();
      if (p && p.then) {
        p.then(() => { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } unlocked = true; }).catch(() => {});
      } else {
        unlocked = true;
      }
    }
    // Desbloquea tambien el timbre de llamadas (mismo gesto del usuario).
    try { ensureRing(); } catch { /* noop */ }
    window.removeEventListener('pointerdown', desbloquear);
    window.removeEventListener('keydown', desbloquear);
    window.removeEventListener('touchstart', desbloquear);
  };
  window.addEventListener('pointerdown', desbloquear);
  window.addEventListener('keydown', desbloquear);
  window.addEventListener('touchstart', desbloquear);
}

/** Reproduce el sonido (con un pequeño anti-spam de 1.2s). */
export function playNotification() {
  if (!activoGlobal || isMuted()) return;
  const a = ensure();
  if (!a) return;
  const now = Date.now();
  if (now - ultimo < 1200) return;
  ultimo = now;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* bloqueado por el navegador */ });
  } catch { /* noop */ }
}

/**
 * Timbre de llamada entrante (loop hasta stopRing). Respeta el silencio.
 * Se usa solo mientras hay una llamada "sonando".
 */
export function playRing() {
  if (typeof window === 'undefined') return;
  if (isMuted()) return;
  const a = ensureRing();
  if (!a) return;
  try {
    if (!a.paused) return; // ya suena
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => { /* bloqueado por el navegador */ });
  } catch { /* noop */ }
}

/** Detiene el timbre de llamada. */
export function stopRing() {
  if (typeof window === 'undefined') return;
  const a = ringEl;
  if (!a) return;
  try { a.pause(); a.currentTime = 0; } catch { /* noop */ }
}

export default { initSonido, playNotification, playRing, stopRing, setSonidoActivo, isMuted, setMuted, toggleMuted };
