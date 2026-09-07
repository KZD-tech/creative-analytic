import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/db/client';
import { syncSource } from '@/lib/connections/sync';
import type { CampaignSource } from '@/lib/db/connections';

export const dynamic = 'force-dynamic';
// One connection budgets 45s for itself (see BUDGET_MS in lib/connections/sync.ts),
// and this route works through every connected account sequentially in one
// call. 60s was enough for one or two accounts; with four now, and more
// coming, the run outlives it and Vercel drops the connection mid-way,
// leaving the last account or two to catch up on the next firing instead of
// this one. 300s is the ceiling on Vercel Pro for a Node.js function.
export const maxDuration = 300;

/**
 * Pulls every connected account on a schedule, so nobody has to sit and wait
 * for a button.
 *
 * Runs as the service role rather than as a signed-in user: there is no session
 * behind a cron firing, and the rows it writes belong to whoever owns the
 * campaign. That is exactly why the request is authenticated first.
 */
function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // Without a secret configured the endpoint stays shut rather than open.
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const given = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Tidak dibenarkan.' }, { status: 401 });
  }

  const supabase = adminDb();
  const { data, error } = await supabase
    .from('campaign_sources')
    .select('id, campaign_id, connection_id, platform_campaign_ids, connection:ad_connections(*)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sources = (data ?? []) as unknown as CampaignSource[];
  const results: { campaign: string; ok: boolean; rows: number; more: boolean; message: string }[] = [];

  // Sequential on purpose: the platforms rate-limit per account, and a cron run
  // has nothing to gain from finishing a few seconds sooner.
  for (const source of sources) {
    if (source.connection?.status === 'disabled') continue;
    // No signed-in visitor is behind a cron firing, so this runs as the
    // service role rather than through a session RLS would reject outright.
    const outcome = await syncSource(source, undefined, true);
    results.push({
      campaign: source.campaign_id,
      ok: outcome.ok,
      rows: outcome.rows,
      more: outcome.more,
      message: outcome.message,
    });
  }

  return NextResponse.json({ synced: results.length, results });
}
