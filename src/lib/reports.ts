import type { Benchmarks, PerformanceRow, Tag } from '@/types/db';
import { perCreative, rollup, type ReportRow } from '@/lib/metrics/rollup';
import type { MetricId } from '@/lib/metrics/catalog';

export type ReportId =
  | 'creatives' | 'landing-pages' | 'body-copy' | 'headlines'
  | 'videos' | 'images' | 'hooks' | 'retention';

export interface ReportDef {
  id: ReportId;
  label: string;
  blurb: string;
  icon: string;
  defaultSort: MetricId;
  defaultMetrics: MetricId[];
  /** What to say when the report has nothing to show, and why. */
  emptyHint: string;
  build: (input: {
    rows: PerformanceRow[];
    benchmarks: Benchmarks;
    tagsByCreative: Record<string, Tag[]>;
  }) => ReportRow[];
}

function truncate(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

export const REPORTS: ReportDef[] = [
  {
    id: 'creatives',
    label: 'Top Creatives',
    blurb: 'Aset kreatif terbaik',
    icon: '🎬',
    defaultSort: 'roas',
    defaultMetrics: ['roas', 'spend', 'revenue', 'conversions', 'cpa'],
    emptyHint: 'Muat naik eksport Ads Manager di tab Data untuk mengisi laporan ini.',
    build: ({ rows, benchmarks }) => perCreative(rows, benchmarks),
  },
  {
    id: 'landing-pages',
    label: 'Top Landing Pages',
    blurb: 'Halaman dengan konversi tertinggi',
    icon: '🖥️',
    defaultSort: 'cvr',
    defaultMetrics: ['cvr', 'lpv', 'conversions', 'revenue', 'roas'],
    emptyHint:
      'Tiada URL destinasi dalam data. Tambah lajur "Link" pada eksport Ads Manager, kemudian muat naik semula.',
    build: ({ rows, benchmarks }) =>
      rollup(rows, benchmarks, {
        keyOf: (row) => row.landing_key,
        titleOf: (row, key) => key,
        subtitleOf: (row, members) =>
          `${members.length} iklan · ${row.landing_url ? truncate(row.landing_url, 60) : ''}`,
      }),
  },
  {
    id: 'body-copy',
    label: 'Top Body Copy',
    blurb: 'Teks utama terbaik',
    icon: '📝',
    defaultSort: 'roas',
    defaultMetrics: ['roas', 'ctr', 'conversions', 'revenue', 'spend'],
    emptyHint:
      'Tiada teks iklan dalam data. Tambah lajur "Body" pada eksport Ads Manager, kemudian muat naik semula.',
    build: ({ rows, benchmarks }) =>
      rollup(rows, benchmarks, {
        keyOf: (row) => (row.body_copy ? row.body_copy.trim().toLowerCase() : null),
        titleOf: (row) => truncate(row.body_copy ?? '', 120),
        subtitleOf: (_row, members) => `${members.length} iklan menggunakan teks ini`,
      }),
  },
  {
    id: 'headlines',
    label: 'Top Headlines',
    blurb: 'Tajuk terbaik',
    icon: '🎯',
    defaultSort: 'ctr',
    defaultMetrics: ['ctr', 'roas', 'conversions', 'revenue', 'spend'],
    emptyHint:
      'Tiada tajuk iklan dalam data. Tambah lajur "Title" pada eksport Ads Manager, kemudian muat naik semula.',
    build: ({ rows, benchmarks }) =>
      rollup(rows, benchmarks, {
        keyOf: (row) => (row.headline ? row.headline.trim().toLowerCase() : null),
        titleOf: (row) => truncate(row.headline ?? '', 90),
        subtitleOf: (_row, members) => `${members.length} iklan menggunakan tajuk ini`,
      }),
  },
  {
    id: 'videos',
    label: 'Top Videos',
    blurb: 'Iklan video terbaik',
    icon: '🎥',
    defaultSort: 'roas',
    defaultMetrics: ['roas', 'hookRate', 'holdRate', 'conversions', 'revenue'],
    emptyHint:
      'Tiada kreatif video dikesan. Muat naik CSV Video Links supaya setiap iklan tahu medianya.',
    build: ({ rows, benchmarks }) =>
      perCreative(
        rows.filter((row) => row.media_kind === 'video' || row.media_kind === 'youtube'),
        benchmarks,
      ),
  },
  {
    id: 'images',
    label: 'Top Images',
    blurb: 'Iklan imej terbaik',
    icon: '🖼️',
    defaultSort: 'roas',
    defaultMetrics: ['roas', 'ctr', 'cpa', 'conversions', 'revenue'],
    emptyHint: 'Tiada kreatif imej dikesan dalam kempen ini.',
    build: ({ rows, benchmarks }) =>
      perCreative(rows.filter((row) => row.media_kind === 'image'), benchmarks),
  },
  {
    id: 'hooks',
    label: 'Top Hooks',
    blurb: 'Kadar hook tertinggi',
    icon: '🪝',
    defaultSort: 'hookRate',
    defaultMetrics: ['hookRate', 'holdRate', 'ctr', 'roas'],
    emptyHint:
      'Belum ada tag hook. Pilih beberapa kreatif di Top Creatives dan gunakan borang tag pukal.',
    build: ({ rows, benchmarks, tagsByCreative }) => {
      // One row per hook tag, so a hook used by six ads is judged on all six.
      const byTag = new Map<string, { label: string; members: PerformanceRow[] }>();
      for (const row of rows) {
        for (const tag of tagsByCreative[row.creative_id] ?? []) {
          if (tag.dimension !== 'hook') continue;
          const bucket = byTag.get(tag.id) ?? { label: tag.label, members: [] };
          bucket.members.push(row);
          byTag.set(tag.id, bucket);
        }
      }

      return [...byTag.entries()].flatMap(([tagId, bucket]) =>
        rollup(bucket.members, benchmarks, {
          keyOf: () => tagId,
          titleOf: () => bucket.label,
          subtitleOf: (_row, members) => `${members.length} iklan dengan hook ini`,
        }),
      );
    },
  },
  {
    id: 'retention',
    label: 'Video Retention',
    blurb: 'Analisis pengekalan penonton',
    icon: '📼',
    defaultSort: 'retention',
    defaultMetrics: ['retention', 'hookRate', 'holdRate', 'impressions'],
    emptyHint:
      'Tiada data pengekalan video. Sertakan lajur "Video plays at 25%…100%" dalam eksport Ads Manager.',
    build: ({ rows, benchmarks }) =>
      perCreative(rows.filter((row) => row.video_p25 > 0), benchmarks),
  },
];

export function findReport(id: string | undefined): ReportDef {
  return REPORTS.find((report) => report.id === id) ?? REPORTS[0];
}
