import 'server-only';
import { db } from './client';
import { generateKey } from '@/lib/api/keys';

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  campaign_id: string | null;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Never selects key_hash: a page has no use for it, so it should not carry it. */
const SAFE = 'id, name, prefix, campaign_id, scopes, last_used_at, revoked_at, created_at';

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('api_keys')
    .select(SAFE)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ApiKeyRow[];
}

/** Returns the key in clear exactly once — it cannot be recovered afterwards. */
export async function createApiKey(input: {
  ownerId: string;
  name: string;
  campaignId: string | null;
  scopes: string[];
}): Promise<{ key: string; row: ApiKeyRow }> {
  const supabase = await db();
  const generated = generateKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      key_hash: generated.hash,
      prefix: generated.prefix,
      campaign_id: input.campaignId,
      scopes: input.scopes,
    })
    .select(SAFE)
    .single();

  if (error) throw new Error(error.message);
  return { key: generated.key, row: data as unknown as ApiKeyRow };
}

/**
 * Revoked rather than deleted: a key that stops working should still be
 * explicable afterwards, and the row records when it was last used.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId);
  if (error) throw new Error(error.message);
}
