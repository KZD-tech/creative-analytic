import 'server-only';
import { db, isSchemaNotExposed } from './client';
import { withDefaults } from '@/lib/metrics/benchmarks';
import type {
  Benchmarks,
  Campaign,
  CampaignSummaryRow,
  Creative,
  CreativeDailyRow,
  DailyRow,
  PerformanceRow,
  Tag,
  TagDimension,
  UploadBatch,
} from '@/types/db';

export class SchemaNotExposedError extends Error {
  constructor(schema: string) {
    super(
      `Skema "${schema}" belum didedahkan kepada API Supabase. Buka Dashboard → Settings → API → Exposed schemas dan tambah "${schema}".`,
    );
    this.name = 'SchemaNotExposedError';
  }
}

function guard(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (isSchemaNotExposed(error)) {
    throw new SchemaNotExposedError(process.env.SUPABASE_SCHEMA?.trim() || 'public');
  }
  throw new Error(error.message ?? 'Ralat Supabase tidak diketahui');
}

export interface DateWindow {
  from: string | null;
  to: string | null;
}

// ── campaigns ───────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await (await db())
    .from('campaigns')
    .select('*')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });
  guard(error);
  return (data ?? []) as Campaign[];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await (await db()).from('campaigns').select('*').eq('id', id).maybeSingle();
  guard(error);
  return (data as Campaign | null) ?? null;
}

export async function createCampaign(input: {
  id: string;
  name: string;
  ownerId: string;
  currency?: string;
  timezone?: string;
}): Promise<Campaign> {
  const supabase = await db();

  // owner_id is what every row-level policy in the schema ultimately checks,
  // so a campaign created without one would be invisible to its own author.
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      id: input.id,
      name: input.name,
      owner_id: input.ownerId,
      currency: input.currency ?? 'MYR',
      timezone: input.timezone ?? 'Asia/Kuala_Lumpur',
    })
    .select('*')
    .single();
  guard(error);

  await supabase.from('benchmarks').upsert({ campaign_id: input.id }, { onConflict: 'campaign_id' });
  return data as Campaign;
}

/**
 * Renames a workspace and adjusts its currency or timezone.
 *
 * The id is deliberately not editable. It is in every URL, every API call and
 * every foreign key in the database; changing it would break bookmarks and
 * orphan data, and there is no benefit that pays for that.
 */
export async function updateCampaign(input: {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}): Promise<Campaign> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      name: input.name,
      currency: input.currency,
      timezone: input.timezone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .select()
    .single();

  // Row-level security answers "not yours" the same way as "does not exist",
  // so a missing row here means one of the two and neither is worth telling
  // apart.
  if (error || !data) throw new Error(error?.message ?? 'Ruang kerja tidak dijumpai.');
  return data as Campaign;
}

// ── benchmarks ──────────────────────────────────────────────────────────────

export async function getBenchmarks(campaignId: string): Promise<Benchmarks> {
  const { data, error } = await (await db())
    .from('benchmarks')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  guard(error);
  return withDefaults(campaignId, data as Partial<Benchmarks> | null);
}

export async function saveBenchmarks(
  campaignId: string,
  patch: Partial<Benchmarks>,
): Promise<Benchmarks> {
  const { data, error } = await (await db())
    .from('benchmarks')
    .upsert(
      { ...patch, campaign_id: campaignId, updated_at: new Date().toISOString() },
      { onConflict: 'campaign_id' },
    )
    .select('*')
    .single();
  guard(error);
  return withDefaults(campaignId, data as Partial<Benchmarks>);
}

// ── performance ─────────────────────────────────────────────────────────────

export async function getPerformance(
  campaignId: string,
  window: DateWindow,
): Promise<PerformanceRow[]> {
  const { data, error } = await (await db()).rpc('creative_performance', {
    p_campaign_id: campaignId,
    p_from: window.from,
    p_to: window.to,
  });
  guard(error);
  return (data ?? []) as PerformanceRow[];
}

export async function getSummary(
  campaignId: string,
  window: DateWindow,
): Promise<CampaignSummaryRow> {
  const { data, error } = await (await db()).rpc('campaign_summary', {
    p_campaign_id: campaignId,
    p_from: window.from,
    p_to: window.to,
  });
  guard(error);
  const row = (data ?? [])[0] as CampaignSummaryRow | undefined;
  return (
    row ?? {
      spend: 0,
      impressions: 0,
      link_clicks: 0,
      landing_page_views: 0,
      video_3s_views: 0,
      results: 0,
      conversions: 0,
      revenue: 0,
      creative_count: 0,
      first_day: null,
      last_day: null,
    }
  );
}

export async function getDailySeries(
  campaignId: string,
  window: DateWindow,
): Promise<DailyRow[]> {
  const { data, error } = await (await db()).rpc('daily_series', {
    p_campaign_id: campaignId,
    p_from: window.from,
    p_to: window.to,
  });
  guard(error);
  return (data ?? []) as DailyRow[];
}

export async function getCreativeDailySeries(
  creativeId: string,
  window: DateWindow,
): Promise<CreativeDailyRow[]> {
  const { data, error } = await (await db()).rpc('creative_daily_series', {
    p_creative_id: creativeId,
    p_from: window.from,
    p_to: window.to,
  });
  guard(error);
  return (data ?? []) as CreativeDailyRow[];
}

export async function getCreative(id: string): Promise<Creative | null> {
  const { data, error } = await (await db()).from('creatives').select('*').eq('id', id).maybeSingle();
  guard(error);
  return (data as Creative | null) ?? null;
}

// ── tags ────────────────────────────────────────────────────────────────────

export async function listTags(campaignId: string): Promise<Tag[]> {
  const { data, error } = await (await db())
    .from('tags')
    .select('*')
    .or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    .order('dimension', { ascending: true })
    .order('label', { ascending: true });
  guard(error);
  return (data ?? []) as Tag[];
}

/** creativeId → tags, for the whole campaign in one round trip. */
export async function getTagAssignments(campaignId: string): Promise<Map<string, Tag[]>> {
  const { data, error } = await (await db())
    .from('creative_tags')
    .select('creative_id, tags(id, campaign_id, dimension, label, created_at), creatives!inner(campaign_id)')
    .eq('creatives.campaign_id', campaignId);
  guard(error);

  const map = new Map<string, Tag[]>();
  for (const row of (data ?? []) as unknown as { creative_id: string; tags: Tag | null }[]) {
    if (!row.tags) continue;
    const list = map.get(row.creative_id) ?? [];
    list.push(row.tags);
    map.set(row.creative_id, list);
  }
  return map;
}

export async function upsertTag(
  campaignId: string,
  dimension: TagDimension,
  label: string,
): Promise<Tag> {
  const trimmed = label.trim();
  const existing = await (await db())
    .from('tags')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('dimension', dimension)
    .ilike('label', trimmed)
    .maybeSingle();

  if (existing.data) return existing.data as Tag;

  const { data, error } = await (await db())
    .from('tags')
    .insert({ campaign_id: campaignId, dimension, label: trimmed })
    .select('*')
    .single();
  guard(error);
  return data as Tag;
}

export async function setCreativeTags(creativeId: string, tagIds: string[]): Promise<void> {
  const supabase = await (await db());
  const { error: deleteError } = await supabase
    .from('creative_tags')
    .delete()
    .eq('creative_id', creativeId);
  guard(deleteError);

  if (tagIds.length === 0) return;
  const { error } = await supabase
    .from('creative_tags')
    .insert(tagIds.map((tag_id) => ({ creative_id: creativeId, tag_id })));
  guard(error);
}

export async function addTagToCreatives(tagId: string, creativeIds: string[]): Promise<void> {
  if (creativeIds.length === 0) return;
  const { error } = await (await db())
    .from('creative_tags')
    .upsert(
      creativeIds.map((creative_id) => ({ creative_id, tag_id: tagId })),
      { onConflict: 'creative_id,tag_id', ignoreDuplicates: true },
    );
  guard(error);
}

// ── upload log ──────────────────────────────────────────────────────────────

export async function listBatches(campaignId: string, limit = 25): Promise<UploadBatch[]> {
  const { data, error } = await (await db())
    .from('upload_batches')
    .select(
      'id, campaign_id, kind, source, filename, row_count, inserted_count, updated_count, skipped_count, status, message, warnings, snapshot_rows, created_at',
    )
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);
  guard(error);
  return (data ?? []) as UploadBatch[];
}

export async function listSnapshots(campaignId: string): Promise<UploadBatch[]> {
  const { data, error } = await (await db())
    .from('upload_batches')
    .select(
      'id, campaign_id, kind, source, filename, row_count, inserted_count, updated_count, skipped_count, status, message, warnings, snapshot_rows, created_at',
    )
    .eq('campaign_id', campaignId)
    .gt('snapshot_rows', 0)
    .order('created_at', { ascending: false })
    .limit(10);
  guard(error);
  return (data ?? []) as UploadBatch[];
}
