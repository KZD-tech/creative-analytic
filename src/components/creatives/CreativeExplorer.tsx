'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, Search, Table2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_LABELS, type CreativeMetrics, type CreativeStatus } from '@/lib/metrics/derive';
import { TAG_DIMENSION_LABELS, type Tag, type TagDimension } from '@/types/db';
import { bulkTagAction, type ActionResult } from '@/app/actions';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { CreativeCard } from './CreativeCard';
import { CreativeTable } from './CreativeTable';

const SORTS = [
  { id: 'roas', label: 'ROAS', get: (m: CreativeMetrics) => m.roas },
  { id: 'spend', label: 'Belanja', get: (m: CreativeMetrics) => m.spend },
  { id: 'revenue', label: 'Hasil', get: (m: CreativeMetrics) => m.revenue },
  { id: 'conversions', label: 'Derma', get: (m: CreativeMetrics) => m.conversions },
  { id: 'hook', label: 'Hook %', get: (m: CreativeMetrics) => m.hookRate },
  { id: 'ctr', label: 'CTR', get: (m: CreativeMetrics) => m.ctr },
  { id: 'cvr', label: 'CVR', get: (m: CreativeMetrics) => m.cvr },
  { id: 'impressions', label: 'Impresi', get: (m: CreativeMetrics) => m.impressions },
] as const;

const STATUSES: CreativeStatus[] = ['winner', 'promising', 'weak', 'losing', 'learning'];

const MAX_COMPARE = 4;

export function CreativeExplorer({
  items,
  tagsByCreative,
  currency,
  campaignId,
}: {
  items: CreativeMetrics[];
  tagsByCreative: Record<string, Tag[]>;
  currency: string;
  campaignId: string;
}) {
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('roas');
  const [status, setStatus] = useState<CreativeStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagState, tagAction] = useActionState<ActionResult | null, FormData>(bulkTagAction, null);

  const allTags = useMemo(() => {
    const map = new Map<string, Tag>();
    for (const list of Object.values(tagsByCreative)) {
      for (const tag of list) map.set(tag.id, tag);
    }
    return [...map.values()].sort((a, z) => a.label.localeCompare(z.label));
  }, [tagsByCreative]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const getter = SORTS.find((s) => s.id === sort)?.get ?? SORTS[0].get;

    return items
      .filter((item) => {
        if (status !== 'all' && item.status !== status) return false;
        if (tagFilter !== 'all') {
          const tags = tagsByCreative[item.creative_id] ?? [];
          if (!tags.some((tag) => tag.id === tagFilter)) return false;
        }
        if (needle) {
          const haystack = `${item.ad_name} ${item.adset_name ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, z) => (getter(z) ?? -1) - (getter(a) ?? -1));
  }, [items, sort, status, tagFilter, query, tagsByCreative]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  }

  const counts = useMemo(() => {
    const map = new Map<CreativeStatus, number>();
    for (const item of items) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      {/* One filter row above the content. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama iklan…"
            aria-label="Cari nama iklan"
            className="w-52 pl-7"
          />
        </div>

        <Select
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          aria-label="Susun mengikut"
          className="w-auto"
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              Susun: {option.label}
            </option>
          ))}
        </Select>

        {allTags.length > 0 ? (
          <Select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            aria-label="Tapis mengikut tag"
            className="w-auto"
          >
            <option value="all">Semua tag</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {TAG_DIMENSION_LABELS[tag.dimension]}: {tag.label}
              </option>
            ))}
          </Select>
        ) : null}

        <div role="group" aria-label="Tapis status" className="flex flex-wrap gap-1">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
            Semua ({items.length})
          </FilterChip>
          {STATUSES.map((value) => (
            <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
              {STATUS_LABELS[value]} ({counts.get(value) ?? 0})
            </FilterChip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            title="Paparan grid"
            className={cn('rounded-md p-1.5', view === 'grid' ? 'bg-surface-3 text-ink' : 'text-ink-muted')}
          >
            <LayoutGrid size={14} />
            <span className="sr-only">Paparan grid</span>
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
            title="Paparan jadual"
            className={cn('rounded-md p-1.5', view === 'table' ? 'bg-surface-3 text-ink' : 'text-ink-muted')}
          >
            <Table2 size={14} />
            <span className="sr-only">Paparan jadual</span>
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Tiada kreatif sepadan">
          Longgarkan tapisan, atau muat naik eksport Ads Manager di tab Data.
        </EmptyState>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {visible.map((item) => (
            <CreativeCard
              key={item.creative_id}
              item={item}
              tags={tagsByCreative[item.creative_id] ?? []}
              currency={currency}
              campaignId={campaignId}
              selected={selected.has(item.creative_id)}
              onToggleSelect={toggle}
            />
          ))}
        </div>
      ) : (
        <CreativeTable
          items={visible}
          currency={currency}
          campaignId={campaignId}
          selected={selected}
          onToggleSelect={toggle}
        />
      )}

      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-20 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">
              {selected.size} dipilih
              {selected.size >= MAX_COMPARE ? ` (maksimum ${MAX_COMPARE})` : ''}
            </span>

            <Link
              href={`/c/${encodeURIComponent(campaignId)}/compare?ids=${[...selected].join(',')}`}
              className="inline-flex items-center rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-page hover:opacity-90"
            >
              Banding sisi-ke-sisi
            </Link>

            <form action={tagAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="campaign_id" value={campaignId} />
              {[...selected].map((id) => (
                <input key={id} type="hidden" name="creative_id" value={id} />
              ))}
              <Select name="dimension" aria-label="Dimensi tag" className="w-auto" defaultValue="hook">
                {(Object.keys(TAG_DIMENSION_LABELS) as TagDimension[]).map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {TAG_DIMENSION_LABELS[dimension]}
                  </option>
                ))}
              </Select>
              <Input name="label" placeholder="Nama tag" aria-label="Nama tag" className="w-36" required />
              <SubmitButton size="sm" pendingLabel="Menyimpan…">
                Tag terpilih
              </SubmitButton>
            </form>

            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
              <X size={13} /> Kosongkan
            </Button>
          </div>

          {tagState ? (
            <Notice tone={tagState.ok ? 'ok' : 'error'} className="mt-2">
              {tagState.message}
            </Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
        active
          ? 'border-line-strong bg-surface-3 font-medium text-ink'
          : 'border-line text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
