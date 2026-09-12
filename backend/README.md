# pikante pe — Backend (Node.js + PostgreSQL)

API del panel admin. Autenticación con JWT y base de datos PostgreSQL `pikantepe`.

## 1) Crear la base de datos
En pgAdmin crea la base:
```sql
CREATE DATABASE pikantepe;
```
Luego abre `sql/tablas.sql` (versión **única, actualizada e idempotente**) y pega TODO en el **Query Tool** de la base `pikantepe` y ejecuta.
Ese único archivo crea/actualiza **todo**:
- tablas base (admins, fetiche_categorias, tags, videos, video_tags, hentai, packs, community, lives, comments, aportantes)
- calidades por video (`renditions`)
- interacciones (likes, vistas, guardados, reportes, descargas, compartidos)
- perfiles, canales/suscripciones
- idiomas + traducciones (i18n)
- índices, triggers de `updated_at`, seeds (categorías, tags, canales, traducciones) y los **10 videos de ejemplo** (sin archivo).

Los videos de ejemplo quedan con `src`/`thumb` vacíos. Luego, desde el admin (`/admin/subirvideos` → **Editar**), sube el video/portada de cada uno; se guardan en `media_completa/`.

Crea el usuario admin por defecto:

- **Usuario:** `admin`
- **Contraseña:** `admin123`  (cámbiala tras el primer login)

### Crear/resetear un admin
Ejecuta **desde la carpeta `backend`** (no desde `sql/`) y después de `npm install`:
```bash
cd backend
npm install
npm run seed:admin
# o directamente
node sql/admin.js
```
Por defecto crea:
- **Usuario:** `brayanjhoance`
- **Correo:** `brayanjhoance@gmail.com`
- **Contraseña:** `123456`
- **Rol:** `superadmin`

Puedes sobreescribir datos:
```bash
node sql/admin.js --email otro@correo.com --password 654321 --usuario otro --nombre "Otro"
```

> `sql/admin.js` solo necesita `pg` (el hash bcrypt lo hace PostgreSQL con pgcrypto), por eso hay que correrlo desde `backend` donde está `node_modules`.

## 2) Variables de entorno
Copia `.env.example` a `.env` (ya viene uno listo):
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=123456
DB_NAME=pikantepe
PORT=3001
FRONTEND_URL=http://localhost:3000
JWT_SECRET=cambia_esto
JWT_EXPIRES=7d
```

## 3) Instalar y correr
```bash
npm install
npm run dev    # http://localhost:3001
```

## Redis (realtime)
Usa un contenedor Redis:
```bash
docker run -d --name pikantepe-redis -p 6379:6379 redis:8
```
`.env` → `REDIS_URL=redis://localhost:6379`.

- `GET  /api/events` — **SSE**: el frontend se suscribe y recibe cada cambio (`event: change`).
- `POST /api/events/publish` — publica un evento manual (Bearer) `{ type, payload }`.
- `publishEvent(type, payload)` en `src/db/redis.js` se llama desde las rutas de escritura.
- Caché: `cacheGet/cacheSet/cacheDel` (ej. `/api/stats` cachea 60s).

## Endpoints
- `GET  /api/health` — estado
- `POST /api/auth/login` — `{ usuario, password }` → `{ token, admin }`
- `GET  /api/auth/me` — admin actual (Bearer token)
- `GET  /api/videos?fetiche=&tendencia=&categoria=&q=&page=&limit=`
- `GET  /api/videos/:id`
- `POST /api/videos/upload` — subir video + portada (multipart, Bearer). Campos: `video`, `thumb`, `title`, `titleEn`, `desc`, `descEn`, `tags`, `tagsEn`, `duration`, `isFetiche`, `feticheCategoria`, `isTendencia`. Guarda en `media_completa/` (raíz del proyecto) y sirve en `/media/...`.
- `POST /api/videos/:id/media` — adjuntar/reemplazar video y/o portada de un video existente (multipart `video`/`thumb`, Bearer). Borra el archivo anterior automáticamente.
- `PUT  /api/videos/:id` — editar video (JSON, Bearer): `title,titleEn,desc,descEn,duration,isFetiche,feticheCategoria,isTendencia,tags`.
- `DELETE /api/videos/:id` — mover a **papelera** (soft delete, `activo=false`). No borra archivos.
- `POST /api/videos/:id/restore` — sacar de la papelera.
- `DELETE /api/videos/:id/permanent` — eliminar definitivamente (BD + archivos).
- `GET  /api/videos?papelera=true` — listar solo los de la papelera.
- `GET  /api/tags` — tags existentes
- `GET  /api/fetiche-categorias` — categorías de fetiche
- `POST /api/fetiche-categorias` — crear categoría (Bearer) `{ categoria }`
- `GET  /api/stats` — conteos del dashboard (Bearer token)
- `GET  /api/events` — SSE realtime (Redis)
- `POST /api/events/publish` — emitir evento (Bearer)
- `GET  /api/videos/:id/interactions?userKey=` — likes/dislikes/vistas/guardados/suscriptores + estado del usuario
- `POST /api/videos/:id/like` `{ userKey, tipo }` — like/dislike/none
- `POST /api/videos/:id/view` / `save` / `download` `{ userKey }`
- `POST /api/videos/:id/report` `{ userKey, motivo, detalle }`
- `POST /api/videos/:id/share` `{ userKey, red }`
- `POST /api/channels/follow` `{ channel, userKey }` — seguir/dejar de seguir
- `GET  /api/videos/:id/comments` · `POST` — comentarios
- `GET  /api/languages` · `GET /api/i18n/:lang` · `PUT /api/i18n/:lang` (Bearer) — traducciones en BD

### SQL
- `sql/tablas.sql` → **todo en uno** (tablas base + calidades + interacciones + perfiles/canales + i18n + seeds + 10 videos)

## Media (`media_completa/`) — una carpeta por video con sus calidades
Los archivos subidos se guardan **fuera** de `backend` y `frontend`, en la raíz del proyecto.
Cada video tiene su **propia carpeta** y el sistema lo **transcodifica** a varias calidades
(1080p → 720p → 480p → 360p) con FFmpeg. Dentro de cada carpeta hay `calidades/` y `thumbs/`:
```
01_por_import/
  backend/
  frontend/
  media_completa/
    videos/
      video_011/
        calidades/
          1080p.mp4
          720p.mp4
          480p.mp4
          360p.mp4
        thumbs/
          poster.jpg     (generado por FFmpeg)
          cover.png      (portada subida por el admin, si existe)
    fetiches/
      fetiche_04/
        calidades/720p.mp4|480p.mp4|360p.mp4
        thumbs/poster.jpg
    hentai/
      hentai_001/...
```
Si el admin sube su propia portada se guarda como `thumbs/cover.<ext>` y se usa esa;
si no, se usa `thumbs/poster.jpg` generado por FFmpeg.
- Se sirven en `http://localhost:3001/media/...`.
- La BD guarda `src` (calidad por defecto, 720p si existe), `thumb` (poster) y `renditions`
  (JSONB con `[{label, height, src}]` de mayor a menor). El player del frontend usa `renditions`.
- FFmpeg viene incluido con `ffmpeg-static` (no necesitas instalarlo en el sistema). Si el
  paquete no está instalado, se guarda el original y se avisa.

La columna `renditions` y todo lo demás se crea con `backend/sql/tablas.sql` (un solo archivo).

## Estructura
```
backend/
  sql/tablas.sql
  src/
    server.js
    app.js
    config/env.js
    db/pool.js
    middleware/auth.js
    middleware/errorHandler.js
    routes/auth.js
    routes/videos.js
    routes/stats.js
```
