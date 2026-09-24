<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas de trabajo

- **Redis / tiempo real (IMPORTANTE, nunca opcional en el diseño):** la app sincroniza por **Redis → SSE** (`GET /api/events` → evento global `pikantepe:change`). **Nunca** lo trates como opcional: toda feature que cambie estado visible para otro usuario debe escuchar `pikantepe:change` y refrescar por ese canal (sin polling). Al diseñar/crear algo, pregúntate siempre "¿esto debe llegar en vivo a otros?" y conéctalo a Redis/SSE. No agregues `setInterval` de sondeo si el evento ya existe.
- **No ejecutar `npx next dev`, `next dev`, `npm run dev`, `next build`, ni NINGÚN comando de dev/build** hasta que el usuario lo indique explícitamente. El usuario ejecuta estos comandos manualmente.
- **No instalar dependencias con `npm install`**. Si se necesitan paquetes, mostrar los comandos `npm install <paquete>` para que el usuario los ejecute manualmente. El proyecto debe seguir controlado y sin cambios de estado no autorizados.
- **Siempre importar con alias `@/`** (ej: `@/_Pages/main/layouts/Header/Header`) y **nunca** con rutas relativas como `../../` o `../`.
- **No usar emojis** en la interfaz ni en el código (textos, botones, mensajes, logs). Usar **íconos de Ionicons** (`<ion-icon name="...">`) en su lugar.
- **Nunca leer ni abrir `frontend/.env.local`** (tiene valores reales). Trabajar siempre con **`frontend/.env.example`**: si se necesita una variable nueva, agrégala ahí con un placeholder y avisa al usuario para que la ponga en `.env.local`. Nunca imprimir ni commitear secretos.
- **SQL (base de datos):** **NUNCA** editar ni agregar tablas/columnas en `backend/sql/tablas_limpias.sql` (es la base consolidada). Todo cambio nuevo de esquema va en un **archivo numerado nuevo** en `backend/sql/` (`tablas2.sql`, `tablas3.sql`, … el siguiente que no exista), idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) y sin borrar datos. Solo se consolida `tablas_limpias.sql` si el usuario lo pide explícitamente.
- Si hay un error del usuario, este lo reporta y el usuario lo corrige manualmente o me pide que lo arregle.
- **Sin scripts de verificación ni informes "TODO VERDE":** NO ejecutar scripts propios de comprobación (SWC, paridad de JSON, conteo de llaves CSS, etc.) tras cada cambio, NI emitir el resumen "TODO VERDE (...)". Hacer los cambios con cuidado directamente; el usuario hace build/prueba manual cuando quiere. Solo verificar si el usuario lo pide explícitamente.
