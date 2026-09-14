/**
 * admin.js — crea o resetea un administrador en PostgreSQL (base: pikantepe)
 *
 * IMPORTANTE: ejecútalo DESDE la carpeta backend (donde está package.json),
 * no desde sql/. Así Node encuentra las dependencias en backend/node_modules.
 *
 *   cd backend
 *   npm install
 *   node sql/admin.js
 *
 * Por defecto:
 *   usuario:  brayanjhoance
 *   email:    brayanjhoance@gmail.com
 *   password: 123456
 *   rol:      superadmin
 *
 * Opcional:
 *   node sql/admin.js --email otro@correo.com --password 654321 --usuario otro --nombre "Otro"
 *
 * Este script usa solo "pg" (no requiere bcryptjs): el hash bcrypt se genera
 * en PostgreSQL con pgcrypto -> crypt(pass, gen_salt('bf')), 100% compatible
 * con bcryptjs del backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- leer backend/.env sin dependencia de dotenv ----
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  const out = {};
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn('[admin.js] no se encontró backend/.env, uso valores por defecto');
  }
  return out;
}

const envFile = loadEnv();
const cfg = {
  host: process.env.DB_HOST || envFile.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || envFile.DB_PORT || 5432),
  user: process.env.DB_USER || envFile.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || envFile.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || envFile.DB_NAME || 'pikantepe',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ADMIN = {
  usuario: arg('usuario', 'brayanjhoance'),
  email: arg('email', 'brayanjhoance@gmail.com'),
  password: arg('password', '123456'),
  nombre: arg('nombre', 'Brayan'),
  rol: arg('rol', 'superadmin'),
};

const { Pool } = pg;
const pool = new Pool(cfg);

async function main() {
  let client;
  try {
    client = await pool.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query('BEGIN');
    await client.query('DELETE FROM admins WHERE email = $1 OR usuario = $2', [ADMIN.email, ADMIN.usuario]);

    const { rows } = await client.query(
      `INSERT INTO admins (usuario, email, password_hash, nombre, rol, activo)
       VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, TRUE)
       RETURNING id, usuario, email, nombre, rol`,
      [ADMIN.usuario, ADMIN.email, ADMIN.password, ADMIN.nombre, ADMIN.rol]
    );
    await client.query('COMMIT');

    console.log('\n[OK] Administrador creado en la base "' + cfg.database + '":');
    console.table(rows[0]);
    console.log(`   Email:    ${ADMIN.email}`);
    console.log(`   Usuario:  ${ADMIN.usuario}`);
    console.log(`   Password: ${ADMIN.password}\n`);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('\n[admin.js] ERROR:', err.message);
    if (err.code === 'ECONNREFUSED') console.error('  → PostgreSQL no está corriendo o DB_HOST/DB_PORT incorrectos.');
    if (err.code === '3D000') console.error('  → La base de datos "' + cfg.database + '" no existe. Créala: CREATE DATABASE pikantepe;');
    if (err.code === '42P01') console.error('  → La tabla "admins" no existe. Ejecuta primero sql/tablas_limpias.sql en pgAdmin.');
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
