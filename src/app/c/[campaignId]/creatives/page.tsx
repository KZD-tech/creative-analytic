import { getBenchmarks, getCampaign, getPerformance, getTagAssignments } from '@/lib/db/queries';
import { deriveAll } from '@/lib/metrics/derive';
import { resolveWindow } from '@/lib/window';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { CreativeExplorer } from '@/components/creatives/CreativeExplorer';
import { EmptyState } from '@/components/ui/primitives';
import type { Tag } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function CreativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId } = await params;
  const query = await searchParams;
  const window = resolveWindow(
    typeof query.range === 'string' ? query.range : undefined,
    typeof query.from === 'string' ? query.from : undefined,
    typeof query.to === 'string' ? query.to : undefined,
  );

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [performance, benchmarks, tagMap] = await Promise.all([
      getPerformance(campaignId, window),
      getBenchmarks(campaignId),
      getTagAssignments(campaignId),
    ]);
    return { campaign, performance, benchmarks, tagMap };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { campaign, performance, benchmarks, tagMap } = loaded.data;

  if (performance.length === 0) {
    return (
      <EmptyState title="Belum ada kreatif">
        Muat naik eksport Ads Manager di tab <strong>Data</strong> untuk mengisi grid ini.
      </EmptyState>
    );
  }

  const items = deriveAll(performance, benchmarks);
  const tagsByCreative: Record<string, Tag[]> = Object.fromEntries(tagMap);

  return (
    <CreativeExplorer
      items={items}
      tagsByCreative={tagsByCreative}
      currency={campaign.currency}
      campaignId={campaignId}
    />
  );
}
