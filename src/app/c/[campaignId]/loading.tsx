import { Skeleton } from '@/components/ui/primitives';

/**
 * Shown while any page under a workspace streams in — every page here reads
 * cookies/headers for auth, so it is always server-rendered fresh and never
 * served from the static cache. Without this, a slow Supabase round trip
 * left the whole content area blank on every navigation.
 */
export default function CampaignLoading() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
