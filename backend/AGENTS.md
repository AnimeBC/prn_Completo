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
- **REGLA CRÍTICA DE SQL (NO romperla nunca):** `backend/sql/tablas_limpias.sql` es el archivo base consolidado y **NO se edita, ni se le agregan tablas ni columnas**. Solo se regenera/consolida cuando el usuario lo pide explícitamente ("consolidar/regenerar tablas_limpias").
- **TODO cambio NUEVO de esquema va SIEMPRE en un archivo numerado nuevo**: `tablas2.sql`, `tablas3.sql`, `tablas4.sql`, … (el siguiente número que **no exista** en `backend/sql/`). **Nunca** editarlo en `tablas_limpias.sql` ni en archivos anteriores. Cada archivo debe ser idempotente y seguro (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`), **sin borrar datos**. Orden de ejecución: `tablas_limpias.sql` → `tablas2.sql` → `tablas3.sql` → … Si hay duda, **preguntar antes de tocar SQL**.
- Autenticación admin: `POST /api/auth/login` → JWT; rutas protegidas con `authRequired`.
- Contraseñas con bcrypt (`bcryptjs`). El seed de admin usa `crypt(..., gen_salt('bf'))` de pgcrypto.
- CORS con `FRONTEND_URL` (default `http://localhost:3000`).
- No hardcodear credenciales: usar `.env`.
- **No usar emojis** en mensajes, respuestas, logs ni código. Usar texto plano.
- **Nunca leer ni abrir `backend/.env`** (tiene credenciales reales). Trabajar siempre con **`backend/.env.example`**: si falta una variable, agrégala ahí con un placeholder y avisa al usuario para que la ponga en `.env`. Nunca imprimir ni commitear secretos.
- Respuestas de error JSON `{ error: "..." }`.
