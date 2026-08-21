import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, listCampaigns } from '@/lib/db/queries';
import { SetupNotice } from '@/components/SetupNotice';
import { SideNav } from '@/components/nav/SideNav';
import { CampaignSwitcher } from '@/components/nav/CampaignSwitcher';
import { RangePicker } from '@/components/nav/RangePicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AccountMenu } from '@/components/nav/AccountMenu';
import { requireUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const user = await requireUser();

  let campaigns;
  let campaign;
  try {
    [campaigns, campaign] = await Promise.all([listCampaigns(), getCampaign(campaignId)]);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  if (!campaign) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
      <aside className="min-w-0 shrink-0 border-line lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:border-r">
        <div className="flex min-w-0 flex-col gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-page"
            >
              C
            </span>
            <span className="text-[13px] font-semibold">Creative Analytic</span>
          </Link>

          <Suspense fallback={<div className="h-9 rounded-lg bg-surface-2" />}>
            <CampaignSwitcher campaigns={campaigns} current={campaign.id} />
          </Suspense>

          <Suspense fallback={<div className="h-9 rounded-lg bg-surface-2" />}>
            <SideNav campaignId={campaign.id} />
          </Suspense>

          <div className="mt-auto hidden space-y-3 lg:block">
            <ThemeToggle />
            <AccountMenu user={user} />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page/90 px-5 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold">{campaign.name}</h1>
            <p className="text-[11px] text-ink-muted">
              {campaign.currency} · {campaign.timezone}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={<div className="h-8 w-72 rounded-lg bg-surface-2" />}>
              <RangePicker />
            </Suspense>
            <div className="lg:hidden">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
