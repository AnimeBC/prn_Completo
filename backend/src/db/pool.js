import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] error inesperado en cliente idle:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (env.nodeEnv === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.log(`[db] ${ms}ms -> ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
  }
  return res;
}

export async function testConnection() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0].now;
}
