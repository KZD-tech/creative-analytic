import 'server-only';
import { createHash } from 'node:crypto';
import { db } from './client';
import { adNameKey, landingKey } from '@/lib/ingest/normalize';
import { classifyMedia } from '@/lib/ingest/mediaLinks';
import type {
  MetricSource,
  NormalizedAdMetric,
  NormalizedConversion,
  NormalizedMediaLink,
} from '@/lib/ingest/adapter';
import type { BatchKind } from '@/types/db';

/** Above this, a batch ships without a rollback snapshot rather than bloating the row. */
const MAX_SNAPSHOT_ROWS = 20_000;
const SNAPSHOTS_KEPT = 5;
const CHUNK = 500;

export interface WriteOutcome {
  batchId: string;
  rowCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  warnings: string[];
  snapshotRows: number;
}

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── creatives ───────────────────────────────────────────────────────────────

/**
 * Ad names arrive from three unrelated exports, so creatives are created on
 * first sight from whichever file mentions them first and enriched afterwards.
 * Returns adNameKey → creative id.
 */
interface CreativeSeed {
  ad_name: string;
  adset_name?: string | null;
  platform_campaign?: string | null;
  external_ad_id?: string | null;
  headline?: string | null;
  body_copy?: string | null;
  landing_url?: string | null;
}

export async function ensureCreatives(
  campaignId: string,
  ads: CreativeSeed[],
): Promise<Map<string, string>> {
  const supabase = await (await db());
  const byKey = new Map<string, CreativeSeed>();
  for (const ad of ads) {
    const key = adNameKey(ad.ad_name);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, {
      ad_name: existing?.ad_name ?? ad.ad_name,
      adset_name: ad.adset_name ?? existing?.adset_name ?? null,
      platform_campaign: ad.platform_campaign ?? existing?.platform_campaign ?? null,
      external_ad_id: ad.external_ad_id ?? existing?.external_ad_id ?? null,
      headline: ad.headline ?? existing?.headline ?? null,
      body_copy: ad.body_copy ?? existing?.body_copy ?? null,
      landing_url: ad.landing_url ?? existing?.landing_url ?? null,
    });
  }

  const entries = [...byKey.entries()];

  // Two passes on purpose. A media-links or donations upload knows only the ad
  // name, so a blind upsert would blank the ad set and campaign that the Meta
  // export had already filled in. Inserts never overwrite; only rows that
  // actually carry enrichment get updated.
  const inserts = entries.map(([key, ad]) => ({
    campaign_id: campaignId,
    ad_name: ad.ad_name.trim(),
    ad_name_key: key,
    adset_name: ad.adset_name ?? null,
    platform_campaign: ad.platform_campaign ?? null,
    external_ad_id: ad.external_ad_id ?? null,
    headline: ad.headline ?? null,
    body_copy: ad.body_copy ?? null,
    landing_url: ad.landing_url ?? null,
    landing_key: landingKey(ad.landing_url),
  }));

  for (const part of chunk(inserts)) {
    const { error } = await supabase
      .from('creatives')
      .upsert(part, { onConflict: 'campaign_id,ad_name_key', ignoreDuplicates: true });
    if (error) throw new Error(`Gagal simpan kreatif: ${error.message}`);
  }

  const enriched = entries
    .filter(
      ([, ad]) =>
        ad.adset_name || ad.platform_campaign || ad.external_ad_id ||
        ad.headline || ad.body_copy || ad.landing_url,
    )
    .map(([key, ad]) => ({
      campaign_id: campaignId,
      ad_name: ad.ad_name.trim(),
      ad_name_key: key,
      adset_name: ad.adset_name ?? null,
      platform_campaign: ad.platform_campaign ?? null,
      external_ad_id: ad.external_ad_id ?? null,
      headline: ad.headline ?? null,
      body_copy: ad.body_copy ?? null,
      landing_url: ad.landing_url ?? null,
      landing_key: landingKey(ad.landing_url),
      updated_at: new Date().toISOString(),
    }));

  for (const part of chunk(enriched)) {
    const { error } = await supabase
      .from('creatives')
      .upsert(part, { onConflict: 'campaign_id,ad_name_key', ignoreDuplicates: false });
    if (error) throw new Error(`Gagal kemas kini kreatif: ${error.message}`);
  }

  return loadCreativeIndex(campaignId);
}

export async function loadCreativeIndex(campaignId: string): Promise<Map<string, string>> {
  const supabase = await (await db());
  const index = new Map<string, string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('creatives')
      .select('id, ad_name_key')
      .eq('campaign_id', campaignId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Gagal baca kreatif: ${error.message}`);
    for (const row of data ?? []) index.set(row.ad_name_key as string, row.id as string);
    if (!data || data.length < pageSize) break;
  }

  return index;
}

// ── batches ─────────────────────────────────────────────────────────────────

async function openBatch(
  campaignId: string,
  kind: BatchKind,
  source: 'csv' | 'meta_api' | 'manual',
  filename: string | null,
  snapshot: unknown[] | null,
): Promise<string> {
  const supabase = await (await db());
  const keepSnapshot = snapshot !== null && snapshot.length <= MAX_SNAPSHOT_ROWS;

  const { data, error } = await supabase
    .from('upload_batches')
    .insert({
      campaign_id: campaignId,
      kind,
      source,
      filename,
      snapshot: keepSnapshot ? snapshot : null,
      snapshot_rows: keepSnapshot ? snapshot.length : 0,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Gagal buka batch: ${error.message}`);
  await pruneSnapshots(campaignId, kind);
  return data.id as string;
}

async function closeBatch(
  batchId: string,
  patch: {
    row_count: number;
    inserted_count: number;
    updated_count: number;
    skipped_count: number;
    status: 'ok' | 'partial' | 'error' | 'rolled_back';
    message?: string | null;
    warnings?: string[];
  },
) {
  const supabase = await (await db());
  const { error } = await supabase
    .from('upload_batches')
    .update({ ...patch, warnings: patch.warnings ?? [] })
    .eq('id', batchId);
  if (error) throw new Error(`Gagal tutup batch: ${error.message}`);
}

/** Keeps the newest N snapshots per kind; older batches stay in the log, payload dropped. */
async function pruneSnapshots(campaignId: string, kind: BatchKind) {
  const supabase = await (await db());
  const { data, error } = await supabase
    .from('upload_batches')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('kind', kind)
    .gt('snapshot_rows', 0)
    .order('created_at', { ascending: false })
    .range(SNAPSHOTS_KEPT, SNAPSHOTS_KEPT + 200);

  if (error || !data || data.length === 0) return;
  await supabase
    .from('upload_batches')
    .update({ snapshot: null, snapshot_rows: 0 })
    .in('id', data.map((r) => r.id as string));
}

async function readAll<T>(
  table: string,
  columns: string,
  campaignId: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const supabase = await (await db());
  const out: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from(table)
      .select(columns)
      .eq('campaign_id', campaignId)
      .range(from, from + pageSize - 1);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);

    const { data, error } = await query;
    if (error) throw new Error(`Gagal baca ${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < pageSize) break;
  }

  return out;
}

// ── ad metrics ──────────────────────────────────────────────────────────────

const METRIC_COLUMNS = [
  'campaign_id',
  'creative_id',
  'date_start',
  'date_stop',
  'source',
  'spend',
  'impressions',
  'reach',
  'frequency',
  'clicks_all',
  'link_clicks',
  'landing_page_views',
  'video_3s_views',
  'video_thruplays',
  'video_p25',
  'video_p50',
  'video_p75',
  'video_p100',
  'results',
  'platform_purchases',
  'platform_revenue',
].join(', ');

export async function writeAdMetrics(
  campaignId: string,
  items: NormalizedAdMetric[],
  opts: { source: MetricSource; filename: string | null; skipped: number; warnings: string[] },
): Promise<WriteOutcome> {
  const supabase = await (await db());
  const warnings = [...opts.warnings];

  const before = await readAll<Record<string, unknown>>('ad_metrics', METRIC_COLUMNS, campaignId, {
    source: opts.source,
  });
  const batchId = await openBatch(campaignId, opts.source === 'meta_api' ? 'meta_api' : 'fb_ads', opts.source === 'meta_api' ? 'meta_api' : 'csv', opts.filename, before);

  if (before.length > MAX_SNAPSHOT_ROWS) {
    warnings.push('Data terlalu besar untuk snapshot — rollback tidak tersedia untuk muat naik ini.');
  }

  try {
    const index = await ensureCreatives(campaignId, items);
    const existing = new Set(
      before.map((r) => `${r.creative_id}|${r.date_start}|${r.date_stop}`),
    );

    const rows = [];
    let unmatched = 0;
    for (const item of items) {
      const creativeId = index.get(adNameKey(item.ad_name));
      if (!creativeId) {
        unmatched += 1;
        continue;
      }
      rows.push({
        campaign_id: campaignId,
        creative_id: creativeId,
        date_start: item.date_start,
        date_stop: item.date_stop,
        source: opts.source,
        batch_id: batchId,
        spend: item.spend,
        impressions: item.impressions,
        reach: item.reach,
        frequency: item.frequency,
        clicks_all: item.clicks_all,
        link_clicks: item.link_clicks,
        landing_page_views: item.landing_page_views,
        video_3s_views: item.video_3s_views,
        video_thruplays: item.video_thruplays,
        video_p25: item.video_p25,
        video_p50: item.video_p50,
        video_p75: item.video_p75,
        video_p100: item.video_p100,
        results: item.results,
        platform_purchases: item.platform_purchases,
        platform_revenue: item.platform_revenue,
        updated_at: new Date().toISOString(),
      });
    }

    if (unmatched > 0) warnings.push(`${unmatched} baris tidak dapat dipadankan dengan kreatif.`);

    let updated = 0;
    for (const row of rows) {
      if (existing.has(`${row.creative_id}|${row.date_start}|${row.date_stop}`)) updated += 1;
    }

    for (const part of chunk(rows)) {
      const { error } = await supabase
        .from('ad_metrics')
        .upsert(part, { onConflict: 'creative_id,date_start,date_stop,source' });
      if (error) throw new Error(`Gagal simpan metrik: ${error.message}`);
    }

    await refreshCreativeDates(campaignId);

    const outcome: WriteOutcome = {
      batchId,
      rowCount: items.length,
      inserted: rows.length - updated,
      updated,
      skipped: opts.skipped + unmatched,
      warnings,
      snapshotRows: before.length <= MAX_SNAPSHOT_ROWS ? before.length : 0,
    };

    await closeBatch(batchId, {
      row_count: outcome.rowCount,
      inserted_count: outcome.inserted,
      updated_count: outcome.updated,
      skipped_count: outcome.skipped,
      status: outcome.skipped > 0 ? 'partial' : 'ok',
      message: `${outcome.inserted} baris baru, ${outcome.updated} dikemas kini`,
      warnings,
    });

    return outcome;
  } catch (error) {
    await closeBatch(batchId, {
      row_count: items.length,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: items.length,
      status: 'error',
      message: error instanceof Error ? error.message : 'Ralat tidak diketahui',
      warnings,
    });
    throw error;
  }
}

/** first_seen / last_seen power the "bila iklan ini hidup" strip on the detail page. */
async function refreshCreativeDates(campaignId: string) {
  const supabase = await (await db());
  const { data, error } = await supabase
    .from('ad_metrics')
    .select('creative_id, date_start, date_stop')
    .eq('campaign_id', campaignId)
    .order('date_start', { ascending: true })
    .limit(50_000);
  if (error || !data) return;

  const bounds = new Map<string, { first: string; last: string }>();
  for (const row of data) {
    const id = row.creative_id as string;
    const start = row.date_start as string;
    const stop = row.date_stop as string;
    const current = bounds.get(id);
    if (!current) bounds.set(id, { first: start, last: stop });
    else {
      if (start < current.first) current.first = start;
      if (stop > current.last) current.last = stop;
    }
  }

  for (const part of chunk([...bounds.entries()], 200)) {
    await Promise.all(
      part.map(([id, b]) =>
        supabase.from('creatives').update({ first_seen: b.first, last_seen: b.last }).eq('id', id),
      ),
    );
  }
}

// ── conversions ─────────────────────────────────────────────────────────────

export function dedupeKey(item: NormalizedConversion): string {
  if (item.external_id) return item.external_id;
  return createHash('sha1')
    .update(`${item.occurred_at}|${item.amount}|${item.attribution_raw ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

export async function writeConversions(
  campaignId: string,
  items: NormalizedConversion[],
  opts: { filename: string | null; skipped: number; warnings: string[] },
): Promise<WriteOutcome> {
  const supabase = await (await db());
  const warnings = [...opts.warnings];

  const before = await readAll<Record<string, unknown>>(
    'conversions',
    'campaign_id, creative_id, external_id, dedupe_key, occurred_at, amount, channel, attribution_raw, matched_ad_name, match_method, source',
    campaignId,
    { source: 'csv' },
  );
  const batchId = await openBatch(campaignId, 'conversions', 'csv', opts.filename, before);

  try {
    const named = items.filter((i) => i.ad_name_hint);
    const index = await ensureCreatives(
      campaignId,
      named.map((i) => ({ ad_name: i.ad_name_hint as string })),
    );

    const existingKeys = new Set(before.map((r) => String(r.dedupe_key)));
    const seen = new Set<string>();
    const rows = [];
    let updated = 0;
    let unmatched = 0;

    for (const item of items) {
      const key = dedupeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      if (existingKeys.has(key)) updated += 1;

      const hint = item.ad_name_hint;
      const creativeId = hint ? (index.get(adNameKey(hint)) ?? null) : null;
      if (!creativeId) unmatched += 1;

      rows.push({
        campaign_id: campaignId,
        creative_id: creativeId,
        external_id: item.external_id,
        dedupe_key: key,
        occurred_at: item.occurred_at,
        amount: item.amount,
        channel: item.channel,
        attribution_raw: item.attribution_raw,
        matched_ad_name: hint,
        match_method: creativeId ? 'normalized' : 'unmatched',
        source: 'csv',
        batch_id: batchId,
      });
    }

    for (const part of chunk(rows)) {
      const { error } = await supabase
        .from('conversions')
        .upsert(part, { onConflict: 'campaign_id,source,dedupe_key' });
      if (error) throw new Error(`Gagal simpan derma: ${error.message}`);
    }

    if (unmatched > 0) {
      warnings.push(
        `${unmatched} derma tidak dapat dipadankan dengan kreatif — ia dikira di peringkat kempen sahaja.`,
      );
    }

    const outcome: WriteOutcome = {
      batchId,
      rowCount: items.length,
      inserted: rows.length - updated,
      updated,
      skipped: opts.skipped,
      warnings,
      snapshotRows: before.length <= MAX_SNAPSHOT_ROWS ? before.length : 0,
    };

    await closeBatch(batchId, {
      row_count: outcome.rowCount,
      inserted_count: outcome.inserted,
      updated_count: outcome.updated,
      skipped_count: outcome.skipped,
      status: outcome.skipped > 0 ? 'partial' : 'ok',
      message: `${outcome.inserted} derma baru, ${outcome.updated} sudah wujud`,
      warnings,
    });

    return outcome;
  } catch (error) {
    await closeBatch(batchId, {
      row_count: items.length,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: items.length,
      status: 'error',
      message: error instanceof Error ? error.message : 'Ralat tidak diketahui',
      warnings,
    });
    throw error;
  }
}

/**
 * Conversions that arrived before the ad they belong to. Re-runs matching over
 * every unmatched row, so uploading FB Ads after Onpay still ends up joined.
 */
export async function rematchConversions(campaignId: string): Promise<number> {
  const supabase = await (await db());
  const index = await loadCreativeIndex(campaignId);

  const pending = await readAll<{ id: number; matched_ad_name: string | null }>(
    'conversions',
    'id, matched_ad_name',
    campaignId,
    { match_method: 'unmatched' },
  );

  let matched = 0;
  const updates: { id: number; creative_id: string }[] = [];
  for (const row of pending) {
    if (!row.matched_ad_name) continue;
    const creativeId = index.get(adNameKey(row.matched_ad_name));
    if (creativeId) {
      updates.push({ id: row.id, creative_id: creativeId });
      matched += 1;
    }
  }

  for (const part of chunk(updates, 200)) {
    await Promise.all(
      part.map((u) =>
        supabase
          .from('conversions')
          .update({ creative_id: u.creative_id, match_method: 'normalized' })
          .eq('id', u.id),
      ),
    );
  }

  return matched;
}

// ── media links ─────────────────────────────────────────────────────────────

export async function writeMediaLinks(
  campaignId: string,
  items: NormalizedMediaLink[],
  opts: { filename: string | null; skipped: number; warnings: string[] },
): Promise<WriteOutcome> {
  const supabase = await (await db());
  const batchId = await openBatch(campaignId, 'media_links', 'csv', opts.filename, null);

  try {
    const index = await ensureCreatives(campaignId, items.map((i) => ({ ad_name: i.ad_name })));
    let applied = 0;

    for (const part of chunk(items, 100)) {
      await Promise.all(
        part.map(async (item) => {
          const creativeId = index.get(adNameKey(item.ad_name));
          if (!creativeId) return;
          const { kind, thumbnail } = classifyMedia(item.media_url);
          const { error } = await supabase
            .from('creatives')
            .update({
              media_url: item.media_url,
              media_kind: kind,
              thumbnail_url: thumbnail,
              updated_at: new Date().toISOString(),
            })
            .eq('id', creativeId);
          if (!error) applied += 1;
        }),
      );
    }

    const outcome: WriteOutcome = {
      batchId,
      rowCount: items.length,
      inserted: applied,
      updated: 0,
      skipped: opts.skipped + (items.length - applied),
      warnings: opts.warnings,
      snapshotRows: 0,
    };

    await closeBatch(batchId, {
      row_count: outcome.rowCount,
      inserted_count: outcome.inserted,
      updated_count: 0,
      skipped_count: outcome.skipped,
      status: outcome.skipped > 0 ? 'partial' : 'ok',
      message: `${applied} pautan video dikemas kini`,
      warnings: opts.warnings,
    });

    return outcome;
  } catch (error) {
    await closeBatch(batchId, {
      row_count: items.length,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: items.length,
      status: 'error',
      message: error instanceof Error ? error.message : 'Ralat tidak diketahui',
      warnings: opts.warnings,
    });
    throw error;
  }
}

// ── rollback ────────────────────────────────────────────────────────────────

export async function rollbackBatch(campaignId: string, batchId: string): Promise<number> {
  const supabase = await (await db());

  const { data: batch, error } = await supabase
    .from('upload_batches')
    .select('id, campaign_id, kind, snapshot, snapshot_rows')
    .eq('id', batchId)
    .eq('campaign_id', campaignId)
    .single();

  if (error || !batch) throw new Error('Snapshot tidak dijumpai.');
  if (!batch.snapshot) throw new Error('Batch ini tiada snapshot untuk dipulihkan.');

  const snapshot = batch.snapshot as Record<string, unknown>[];
  const table = batch.kind === 'conversions' ? 'conversions' : 'ad_metrics';
  const source = batch.kind === 'meta_api' ? 'meta_api' : 'csv';

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('campaign_id', campaignId)
    .eq('source', source);
  if (deleteError) throw new Error(`Gagal kosongkan data semasa: ${deleteError.message}`);

  for (const part of chunk(snapshot)) {
    const { error: insertError } = await supabase.from(table).insert(part);
    if (insertError) throw new Error(`Gagal pulihkan snapshot: ${insertError.message}`);
  }

  await supabase.from('upload_batches').insert({
    campaign_id: campaignId,
    kind: 'rollback',
    source: 'manual',
    row_count: snapshot.length,
    inserted_count: snapshot.length,
    status: 'ok',
    message: `${snapshot.length} rekod dipulihkan daripada snapshot`,
  });

  await supabase.from('upload_batches').update({ status: 'rolled_back' }).eq('id', batchId);

  return snapshot.length;
}
