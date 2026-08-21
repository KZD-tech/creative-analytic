'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, Columns3, Database, LayoutGrid, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '', label: 'Ringkasan', Icon: BarChart3, exact: true },
  { href: '/creatives', label: 'Laporan', Icon: LayoutGrid, exact: false },
  { href: '/insights', label: 'Insight', Icon: Lightbulb, exact: false },
  { href: '/compare', label: 'Banding', Icon: Columns3, exact: false },
  { href: '/data', label: 'Data', Icon: Database, exact: false },
];

export function SideNav({ campaignId }: { campaignId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const base = `/c/${encodeURIComponent(campaignId)}`;

  return (
    <nav aria-label="Navigasi utama" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const target = `${base}${href}`;
        const active = exact ? pathname === target : pathname.startsWith(target);
        return (
          <Link
            key={label}
            href={query ? `${target}?${query}` : target}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon size={15} strokeWidth={2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
