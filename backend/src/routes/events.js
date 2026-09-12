import { Router } from 'express';
import { createSubscriber, CHANNEL, publishEvent } from '../db/redis.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

/**
 * GET /api/events  (Server-Sent Events)
 * El frontend se suscribe aquí y recibe un evento por cada cambio publicado en Redis.
 * Formato: event: change  ->  data: { type, payload, at }
 */
r.get('/', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, channel: CHANNEL })}\n\n`);

  const sub = createSubscriber();
  let closed = false;

  try {
    await sub.connect();
    await sub.subscribe(CHANNEL, (message) => {
      if (!closed) res.write(`event: change\ndata: ${message}\n\n`);
    });
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'redis_unavailable' })}\n\n`);
  }

  const keepAlive = setInterval(() => {
    if (!closed) {
      try { res.write(': keep-alive\n\n'); } catch { /* ignore */ }
    }
  }, 25000);

  req.on('close', async () => {
    closed = true;
    clearInterval(keepAlive);
    try { await sub.unsubscribe(CHANNEL); } catch { /* ignore */ }
    try { await sub.quit(); } catch { /* ignore */ }
    res.end();
  });
});

/**
 * POST /api/events/publish  (Bearer token)
 * Emite un evento a todos los clientes conectados. Los módulos de escritura
 * (crear/editar/borrar videos, packs, etc.) llaman a publishEvent directamente.
 * Body: { type, payload }
 */
r.post('/publish', authRequired, async (req, res, next) => {
  try {
    const { type = 'generic', payload = {} } = req.body || {};
    await publishEvent(type, payload);
    res.json({ ok: true, type });
  } catch (e) { next(e); }
});

export default r;
