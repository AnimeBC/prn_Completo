import app from './app.js';
import { env } from './config/env.js';
import { testConnection } from './db/pool.js';
import { connectRedis } from './db/redis.js';

async function start() {
  try {
    const now = await testConnection();
    console.log(`[db] conectado a PostgreSQL "${env.db.database}" @ ${env.db.host}:${env.db.port} (${now})`);
  } catch (err) {
    console.error('[db] no se pudo conectar a PostgreSQL:', err.message);
    console.error('     Revisa .env (DB_HOST/DB_USER/DB_PASSWORD/DB_NAME) y que el servicio esté corriendo.');
  }

  try {
    await connectRedis();
  } catch (err) {
    console.error('[redis] no se pudo conectar:', err.message);
    console.error(`     Revisa REDIS_URL (${env.redisUrl}) y que el contenedor redis:8 esté corriendo en 6379.`);
  }

  app.listen(env.port, () => {
    console.log(`[backend] listening on http://localhost:${env.port}  (FRONTEND_URL=${env.frontendUrl})`);
    console.log(`[backend] SSE realtime -> http://localhost:${env.port}/api/events`);
  });
}

start();
