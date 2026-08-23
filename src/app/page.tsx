import { redirect } from 'next/navigation';
import { listCampaigns } from '@/lib/db/queries';
import { requireUser } from '@/lib/auth/session';
import { SetupNotice } from '@/components/SetupNotice';
import { NewCampaignForm } from '@/components/NewCampaignForm';
import { Card } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireUser();

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
        Selamat datang, {user.fullName || user.email}. Belum ada ruang kerja — buat satu untuk
        mula menarik data Meta Ads dan derma. Ini tidak mencipta apa-apa dalam Ads Manager.
      </p>
      <Card className="mt-6 px-5 py-5">
        <NewCampaignForm />
      </Card>
    </div>
  );
}
