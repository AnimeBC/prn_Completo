import { API_URL } from '@/_Extras/Api/api.js';

export const USUARIO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Consulta en el backend si un usuario / correo ya existe. */
export async function checkAvailability({ usuario, email, userKey }) {
  const params = new URLSearchParams();
  if (usuario !== undefined) params.set('usuario', usuario);
  if (email !== undefined) params.set('email', email);
  if (userKey) params.set('userKey', userKey);
  const r = await fetch(`${API_URL}/api/auth/check?${params.toString()}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return j;
}

/**
 * Verifica un campo contra el backend (se llama al pulsar el botón, no al escribir).
 * field: 'usuario' | 'email'.
 * Devuelve { state, msg } con state: 'ok' | 'taken' | 'invalid' | 'idle'.
 */
export async function verifyField({ field, value, userKey, es = true }) {
  const v = String(value || '').trim();
  const isEmail = field === 'email';
  const re = isEmail ? EMAIL_RE : USUARIO_RE;

  if (!v) {
    return {
      state: 'invalid',
      msg: isEmail
        ? (es ? 'Escribe tu correo' : 'Enter your email')
        : (es ? 'Escribe un nombre de usuario' : 'Enter a username'),
    };
  }
  if (!re.test(v)) {
    return {
      state: 'invalid',
      msg: isEmail
        ? (es ? 'Correo no válido' : 'Invalid email')
        : (es ? '3-30: letras, números, . _ -' : '3-30: letters, numbers, . _ -'),
    };
  }

  const j = await checkAvailability({ [field]: v, userKey });
  const res = j?.[field];
  if (!res) return { state: 'idle', msg: '' };
  if (res.available) {
    return {
      state: 'ok',
      msg: isEmail ? (es ? 'Correo disponible' : 'Email available') : (es ? 'Usuario disponible' : 'Username available'),
    };
  }
  return {
    state: 'taken',
    msg: isEmail
      ? (es ? 'Ese correo ya está registrado' : 'That email is already registered')
      : (es ? 'Ese nombre de usuario ya existe' : 'That username already exists'),
  };
}
