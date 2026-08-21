import 'server-only';
import { db } from './client';
import { encryptToken, decryptToken } from '@/lib/connections/crypto';
import type { Platform } from '@/lib/connections/config';

export interface AdConnection {
  id: string;
  platform: Platform;
  external_account_id: string;
  account_name: string | null;
  currency: string | null;
  timezone: string | null;
  login_customer_id: string | null;
  status: 'active' | 'needs_reauth' | 'disabled';
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_rows: number;
  created_at: string;
}

/** Columns that are safe to hand to a page. Never the token columns. */
const SAFE = `id, platform, external_account_id, account_name, currency, timezone,
  login_customer_id, status, last_sync_at, last_sync_error, last_sync_rows, created_at`;

export interface CampaignSource {
  id: string;
  campaign_id: string;
  connection_id: string;
  platform_campaign_ids: string[];
  connection: AdConnection;
}

export async function listConnections(): Promise<AdConnection[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('ad_connections')
    .select(SAFE)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdConnection[];
}

export async function listCampaignSources(campaignId: string): Promise<CampaignSource[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('campaign_sources')
    .select(`id, campaign_id, connection_id, platform_campaign_ids, connection:ad_connections(${SAFE})`)
    .eq('campaign_id', campaignId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CampaignSource[];
}

export async function saveConnection(input: {
  ownerId: string;
  platform: Platform;
  externalAccountId: string;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  loginCustomerId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
}): Promise<string> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('ad_connections')
    .upsert(
      {
        owner_id: input.ownerId,
        platform: input.platform,
        external_account_id: input.externalAccountId,
        account_name: input.accountName,
        currency: input.currency,
        timezone: input.timezone,
        login_customer_id: input.loginCustomerId ?? null,
        // Encrypted here, so the value crossing the wire and landing in the
        // table is already ciphertext.
        access_token: encryptToken(input.accessToken),
        refresh_token: input.refreshToken ? encryptToken(input.refreshToken) : null,
        expires_at: input.expiresAt,
        status: 'active',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,platform,external_account_id' },
    )
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Reads and decrypts the tokens. Keep the result in memory only. */
export async function readConnectionSecrets(connectionId: string): Promise<{
  connection: AdConnection;
  accessToken: string;
  refreshToken: string | null;
}> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('ad_connections')
    .select(`${SAFE}, access_token, refresh_token`)
    .eq('id', connectionId)
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Sambungan tidak dijumpai.');

  const row = data as unknown as AdConnection & {
    access_token: string;
    refresh_token: string | null;
  };

  return {
    connection: row,
    accessToken: decryptToken(row.access_token),
    refreshToken: row.refresh_token ? decryptToken(row.refresh_token) : null,
  };
}

export async function updateAccessToken(
  connectionId: string,
  accessToken: string,
  expiresAt: string | null,
): Promise<void> {
  const supabase = await db();
  await supabase
    .from('ad_connections')
    .update({
      access_token: encryptToken(accessToken),
      expires_at: expiresAt,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}

export async function recordSync(
  connectionId: string,
  result: { rows: number; error?: string | null; needsReauth?: boolean },
): Promise<void> {
  const supabase = await db();
  await supabase
    .from('ad_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_rows: result.rows,
      last_sync_error: result.error ?? null,
      // Only the caller knows whether the platform actually refused the token.
      // Guessing from the message text marked a connection dead every time the
      // network hiccuped, and sent the user through consent for nothing.
      status: result.needsReauth ? 'needs_reauth' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}

export async function linkCampaign(input: {
  campaignId: string;
  connectionId: string;
  platformCampaignIds?: string[];
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from('campaign_sources').upsert(
    {
      campaign_id: input.campaignId,
      connection_id: input.connectionId,
      platform_campaign_ids: input.platformCampaignIds ?? [],
    },
    { onConflict: 'campaign_id,connection_id' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from('ad_connections').delete().eq('id', connectionId);
  if (error) throw new Error(error.message);
}

export async function unlinkCampaign(sourceId: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from('campaign_sources').delete().eq('id', sourceId);
  if (error) throw new Error(error.message);
}
