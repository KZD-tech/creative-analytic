import { redirect } from 'next/navigation';
import { listCampaigns } from '@/lib/db/queries';
import { SetupNotice } from '@/components/SetupNotice';
import { NewCampaignForm } from '@/components/NewCampaignForm';
import { Card } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let campaigns;
  try {
    campaigns = await listCampaigns();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const active = campaigns.find((campaign) => campaign.status === 'active') ?? campaigns[0];
  if (active) redirect(`/c/${encodeURIComponent(active.id)}`);

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-lg font-semibold">Creative Analytic</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Belum ada kempen. Buat satu untuk mula memuat naik data Meta Ads dan derma.
      </p>
      <Card className="mt-6 px-5 py-5">
        <NewCampaignForm />
      </Card>
    </div>
  );
}
