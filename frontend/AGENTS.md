<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas de trabajo

- **No ejecutar `npx next dev`, `next dev`, `npm run dev`, `next build`, ni NINGÚN comando de dev/build** hasta que el usuario lo indique explícitamente. El usuario ejecuta estos comandos manualmente.
- **No instalar dependencias con `npm install`**. Si se necesitan paquetes, mostrar los comandos `npm install <paquete>` para que el usuario los ejecute manualmente. El proyecto debe seguir controlado y sin cambios de estado no autorizados.
- **Siempre importar con alias `@/`** (ej: `@/_Pages/main/layouts/Header/Header`) y **nunca** con rutas relativas como `../../` o `../`.
- **No usar emojis** en la interfaz ni en el código (textos, botones, mensajes, logs). Usar **íconos de Ionicons** (`<ion-icon name="...">`) en su lugar.
- **Nunca leer ni abrir `frontend/.env.local`** (tiene valores reales). Trabajar siempre con **`frontend/.env.example`**: si se necesita una variable nueva, agrégala ahí con un placeholder y avisa al usuario para que la ponga en `.env.local`. Nunca imprimir ni commitear secretos.
- **SQL (base de datos):** **NUNCA** editar ni agregar tablas/columnas en `backend/sql/tablas_limpias.sql` (es la base consolidada). Todo cambio nuevo de esquema va en un **archivo numerado nuevo** en `backend/sql/` (`tablas2.sql`, `tablas3.sql`, … el siguiente que no exista), idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) y sin borrar datos. Solo se consolida `tablas_limpias.sql` si el usuario lo pide explícitamente.
- Si hay un error del usuario, este lo reporta y el usuario lo corrige manualmente o me pide que lo arregle.
