import { GenericSkeleton } from '@/_Extras/Skeleton/skeleton';

/** Esqueleto por defecto de (main): variante compacta para las rutas que no
 *  tienen loading.js propio (favoritos, historial, perfil, legal...).
 *  Las rutas principales (videos, hentai, packs, tendencias, fetiches,
 *  comunidad, chat) traen SU esqueleto en su propio loading.js. */
export default function Loading() {
  return <GenericSkeleton />;
}
