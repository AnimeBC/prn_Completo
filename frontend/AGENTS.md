<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas de trabajo

- **No ejecutar `npx next dev`, `next dev`, `npm run dev`, `next build`, ni NINGÚN comando de dev/build** hasta que el usuario lo indique explícitamente. El usuario ejecuta estos comandos manualmente.
- **No instalar dependencias con `npm install`**. Si se necesitan paquetes, mostrar los comandos `npm install <paquete>` para que el usuario los ejecute manualmente. El proyecto debe seguir controlado y sin cambios de estado no autorizados.
- **Siempre importar con alias `@/`** (ej: `@/_Pages/main/layouts/Header/Header`) y **nunca** con rutas relativas como `../../` o `../`.
- Si hay un error del usuario, este lo reporta y el usuario lo corrige manualmente o me pide que lo arregle.
