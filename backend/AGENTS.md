# Backend AGENTS — Node.js + Express + PostgreSQL

## Stack
- Node.js 20+ · Express 4 · PostgreSQL (`pg`) · Redis (`redis`) · JWT · bcryptjs · ESM (`"type": "module"`)
- No Next.js, no React.

## Redis (realtime + caché)
- `REDIS_URL=redis://localhost:6379` (contenedor `redis:8`, puerto `6379:6379`).
- `src/db/redis.js`: cliente `redis`, `connectRedis()`, `createSubscriber()`, `publishEvent(type, payload)` y helpers de caché (`cacheGet/Set/Del`).
- Canal pub/sub: `pikantepe:events`.
- SSE para el frontend: `GET /api/events` (evento `change`); publicar manualmente con `POST /api/events/publish` (Bearer).
- Toda ruta de escritura debe llamar `publishEvent(...)` y `cacheDel(...)` tras modificar datos.

## Reglas de trabajo
- No ejecutar `npm run dev` / `node src/server.js` hasta que el usuario lo indique.
- No instalar deps automáticamente — mostrar `npm install` para que el usuario lo ejecute.
- Estructura: `src/server.js` (entry), `src/app.js`, `src/config/env.js`, `src/db/pool.js`, `src/routes/`, `src/middleware/`, `src/utils/`.
- Base de datos: `pikantepe` en PostgreSQL (`localhost:5432`, user `postgres`, pass `123456`).
- El SQL de creación de tablas vive en `backend/sql/tablas.sql` (copiar/pegar en pgAdmin).
- Autenticación admin: `POST /api/auth/login` → JWT; rutas protegidas con `authRequired`.
- Contraseñas con bcrypt (`bcryptjs`). El seed de admin usa `crypt(..., gen_salt('bf'))` de pgcrypto.
- CORS con `FRONTEND_URL` (default `http://localhost:3000`).
- No hardcodear credenciales: usar `.env`.
- Respuestas de error JSON `{ error: "..." }`.
