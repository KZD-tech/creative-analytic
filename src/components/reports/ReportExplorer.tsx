'use client';

import { useActionState, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, HelpCircle, LayoutGrid, Search, Table2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { REPORTS, findReport, type ReportId } from '@/lib/reports';
import { groupRows, type GroupId, type ReportRow } from '@/lib/metrics/rollup';
import {
  DEFAULT_METRICS, METRICS, highlightRules, type MetricId,
} from '@/lib/metrics/catalog';
import { STATUS_LABELS, type CreativeStatus } from '@/lib/metrics/derive';
import { moneyCompact } from '@/lib/format';
import { TAG_DIMENSION_LABELS, type Benchmarks, type PerformanceRow, type Tag, type TagDimension } from '@/types/db';
import { bulkTagAction, type ActionResult } from '@/app/actions';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { ReportSidebar } from './ReportSidebar';
import { MetricsPicker } from './MetricsPicker';
import { ReportCard } from './ReportCard';
import { ReportTable } from './ReportTable';
import { ReportChart } from './ReportChart';

const STATUSES: CreativeStatus[] = ['winner', 'promising', 'weak', 'losing', 'learning'];
const MAX_COMPARE = 4;
type ViewMode = 'grid' | 'chart' | 'table';

export function ReportExplorer({
  rows,
  benchmarks,
  tagsByCreative,
  currency,
  campaignId,
}: {
  rows: PerformanceRow[];
  benchmarks: Benchmarks;
  tagsByCreative: Record<string, Tag[]>;
  currency: string;
  campaignId: string;
}) {
  const [reportId, setReportId] = useState<ReportId>('creatives');
  const [group, setGroup] = useState<GroupId>('none');
  const [view, setView] = useState<ViewMode>('grid');
  const [metrics, setMetrics] = useState<MetricId[]>(DEFAULT_METRICS);
  const [sort, setSort] = useState<MetricId>('roas');
  const [status, setStatus] = useState<CreativeStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRule, setShowRule] = useState(false);
  const [tagState, tagAction] = useActionState<ActionResult | null, FormData>(bulkTagAction, null);

  const report = findReport(reportId);

  // Every report is built up front so the sidebar can show real counts and
  // grey out the ones this campaign has no data for.
  const built = useMemo(() => {
    const out = {} as Record<ReportId, ReportRow[]>;
    for (const definition of REPORTS) {
      out[definition.id] = definition.build({ rows, benchmarks, tagsByCreative });
    }
    return out;
  }, [rows, benchmarks, tagsByCreative]);

  const counts = useMemo(() => {
    const out = {} as Record<ReportId, number>;
    for (const definition of REPORTS) out[definition.id] = built[definition.id].length;
    return out;
  }, [built]);

  // Switching report resets the metric set and sort to that report's own
  // defaults — Top Headlines wants CTR up front, Video Retention wants
  // completion, and carrying the previous choice over would bury the point.
  function selectReport(id: ReportId) {
    const next = findReport(id);
    setReportId(id);
    setMetrics(next.defaultMetrics);
    setSort(next.defaultSort);
    setSelected(new Set());
    if (id !== 'creatives' && group.startsWith('tag:')) setGroup('none');
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const def = METRICS[sort];

    return built[reportId]
      .filter((row) => {
        if (status !== 'all' && row.status !== status) return false;
        if (needle && !`${row.title} ${row.subtitle ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, z) => (def.value(z) ?? -Infinity) - (def.value(a) ?? -Infinity));
  }, [built, reportId, status, query, sort]);

  const rules = useMemo(
    () => highlightRules(visible, metrics, benchmarks),
    [visible, metrics, benchmarks],
  );

  const grouped = useMemo(
    () => groupRows(visible, group, tagsByCreative),
    [visible, group, tagsByCreative],
  );

  const statusCounts = useMemo(() => {
    const map = new Map<CreativeStatus, number>();
    for (const row of built[reportId]) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [built, reportId]);

  const tagDimensions = useMemo(() => {
    const used = new Set<TagDimension>();
    for (const list of Object.values(tagsByCreative)) for (const tag of list) used.add(tag.dimension);
    return [...used];
  }, [tagsByCreative]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <ReportSidebar active={reportId} counts={counts} onSelect={selectReport} />

      <div className="min-w-0 flex-1 space-y-4">
        {/* One filter row above the content. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={group}
            onChange={(event) => setGroup(event.target.value as GroupId)}
            aria-label="Kumpulkan mengikut"
            className="w-auto font-medium"
          >
            <option value="none">Tiada kumpulan</option>
            <option value="adset">Ikut ad set</option>
            <option value="media">Ikut jenis media</option>
            <option value="status">Ikut status</option>
            {tagDimensions.map((dimension) => (
              <option key={dimension} value={`tag:${dimension}`}>
                Ikut {TAG_DIMENSION_LABELS[dimension].toLowerCase()}
              </option>
            ))}
          </Select>

          <div className="relative">
            <Search
              size={13}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-muted"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari…"
              aria-label="Cari dalam laporan"
              className="w-40 pl-7"
            />
          </div>

          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as MetricId)}
            aria-label="Susun mengikut"
            className="w-auto"
          >
            {metrics.map((id) => (
              <option key={id} value={id}>
                Susun: {METRICS[id].label}
              </option>
            ))}
          </Select>

          <div role="group" aria-label="Tapis status" className="flex flex-wrap gap-1">
            <Chip active={status === 'all'} onClick={() => setStatus('all')}>
              Semua ({built[reportId].length})
            </Chip>
            {STATUSES.filter((value) => (statusCounts.get(value) ?? 0) > 0).map((value) => (
              <Chip key={value} active={status === value} onClick={() => setStatus(value)}>
                {STATUS_LABELS[value]} ({statusCounts.get(value)})
              </Chip>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
              {([
                ['grid', LayoutGrid, 'Paparan grid'],
                ['chart', BarChart3, 'Paparan carta'],
                ['table', Table2, 'Paparan jadual'],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  title={label}
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    view === mode ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon size={14} />
                  <span className="sr-only">{label}</span>
                </button>
              ))}
            </div>

            <MetricsPicker selected={metrics} onChange={setMetrics} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <button
            type="button"
            onClick={() => setShowRule((value) => !value)}
            aria-expanded={showRule}
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            <HelpCircle size={12} /> Apa maksud nilai berwarna hijau?
          </button>
        </div>

        {showRule ? (
          <Notice tone="info" title="Peraturan penyerlahan">
            Metrik yang ada benchmark kempen (ROAS, CTR, CVR, hook, hold, kadar LPV) bertukar hijau
            apabila mencapai benchmark itu — jawapan yang sama tanpa mengira apa lagi di skrin.
            Metrik lain yang ada arah &ldquo;lebih baik&rdquo; (CPA, CPM, hasil, derma) bertukar
            hijau apabila berada dalam kuartil terbaik hasil yang sedang dipaparkan. Belanja dan
            impresi tidak pernah diserlahkan — nombor besar di situ satu fakta, bukan pencapaian.
            Ubah benchmark di tab Data.
          </Notice>
        ) : null}

        {built[reportId].length === 0 ? (
          <EmptyState icon={<span className="text-2xl">{report.icon}</span>} title={report.label}>
            {report.emptyHint}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState title="Tiada baris sepadan">Longgarkan tapisan atau carian.</EmptyState>
        ) : view === 'chart' ? (
          <ReportChart
            rows={visible}
            metric={sort}
            metrics={metrics}
            rule={rules[sort]}
            currency={currency}
          />
        ) : (
          grouped.map((section) => (
            <section key={section.key}>
              {section.label ? (
                <header className="mb-2 flex items-baseline gap-3">
                  <h3 className="text-[13px] font-semibold text-ink">{section.label}</h3>
                  <span className="text-[11px] text-ink-muted">
                    {section.rows.length} baris ·{' '}
                    {moneyCompact(
                      section.rows.reduce((total, row) => total + row.spend, 0),
                      currency,
                    )}
                  </span>
                </header>
              ) : null}

              {view === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-4">
                  {section.rows.map((row) => (
                    <ReportCard
                      key={row.rowKey}
                      row={row}
                      metrics={metrics}
                      rules={rules}
                      tags={tagsByCreative[row.sampleCreativeId] ?? []}
                      currency={currency}
                      campaignId={campaignId}
                      selected={selected.has(row.sampleCreativeId)}
                      onToggleSelect={toggle}
                    />
                  ))}
                </div>
              ) : (
                <ReportTable
                  rows={section.rows}
                  metrics={metrics}
                  rules={rules}
                  currency={currency}
                  campaignId={campaignId}
                  selected={selected}
                  onToggleSelect={toggle}
                  sort={sort}
                  onSort={setSort}
                />
              )}
            </section>
          ))
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
                <Input name="label" placeholder="Nama tag" aria-label="Nama tag" className="w-32" required />
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
    </div>
  );
}

function Chip({
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
