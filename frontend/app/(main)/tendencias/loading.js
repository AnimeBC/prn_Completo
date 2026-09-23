import { ListSkeleton } from '@/_Extras/Skeleton/skeleton';

// Tendencias: head con subtítulo inline, SIN filtros ni buscador.
export default function Loading() {
  return <ListSkeleton showSub showTools={false} showSearch={false} showAllHead={false} />;
}
