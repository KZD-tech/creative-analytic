'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { Campaign } from '@/types/db';

export function CampaignSwitcher({
  campaigns,
  current,
}: {
  campaigns: Campaign[];
  current: string;
}) {
  const router = useRouter();
  const search = useSearchParams();

  return (
    <div className="relative">
      <select
        aria-label="Pilih kempen"
        value={current}
        onChange={(event) => {
          const query = search.toString();
          const target = `/c/${encodeURIComponent(event.target.value)}`;
          router.push(query ? `${target}?${query}` : target);
        }}
        className="w-full appearance-none rounded-lg border border-line bg-surface py-2 pr-8 pl-3 text-[13px] font-semibold text-ink focus:border-line-strong focus:outline-none"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
            {campaign.status === 'archived' ? ' (arkib)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
