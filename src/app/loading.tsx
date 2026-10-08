import { Skeleton } from '@/components/ui/primitives';

export default function RootLoading() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-6 py-16">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
