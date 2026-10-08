import { Skeleton } from '@/components/ui/primitives';

export default function CreativeDetailLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="h-28 w-full" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
