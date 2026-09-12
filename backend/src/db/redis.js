import { createClient } from 'redis';
import { env } from '../config/env.js';

/**
 * Cliente Redis único para el backend.
 *  - publisher: para publicar eventos (cambios).
 *  - subscriber: se crea aparte porque Redis no permite suscribir y publicar en la misma conexión.
 */
export const redis = createClient({ url: env.redisUrl });

redis.on('error', (err) => console.error('[redis] error:', err.message));
redis.on('connect', () => console.log('[redis] conectando...'));
redis.on('ready', () => console.log('[redis] listo'));

let connected = false;

export async function connectRedis() {
  if (connected) return redis;
  await redis.connect();
  connected = true;
  return redis;
}

export function createSubscriber() {
  const sub = redis.duplicate();
  sub.on('error', (err) => console.error('[redis:sub] error:', err.message));
  return sub;
}

export const CHANNEL = 'pikantepe:events';

export async function publishEvent(type, payload = {}) {
  try {
    if (!connected) return;
    const message = JSON.stringify({ type, payload, at: Date.now() });
    await redis.publish(CHANNEL, message);
  } catch (err) {
    console.error('[redis] no se pudo publicar:', err.message);
  }
}

// ---- caché simple con expiración ----
export async function cacheGet(key) {
  try {
    if (!connected) return null;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    if (!connected) return;
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch { /* ignore */ }
}

export async function cacheDel(pattern) {
  try {
    if (!connected) return;
    if (pattern.includes('*')) {
      for await (const key of redis.scanIterator({ MATCH: pattern })) {
        await redis.del(key);
      }
    } else {
      await redis.del(pattern);
    }
  } catch { /* ignore */ }
}
