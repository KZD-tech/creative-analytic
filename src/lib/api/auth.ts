import 'server-only';
import { adminDb } from '@/lib/db/client';
import { hashKey, keyFromHeader } from './keys';

/**
 * Who is calling, and what they may touch.
 *
 * These routes run as the service role, because a machine caller has no session
 * for row-level security to work from. That makes the scope returned here the
 * only thing standing between one account's key and another account's data —
 * so every query built from it must filter by `ownerId`, without exception.
 */
export interface ApiCaller {
  keyId: string;
  ownerId: string;
  /** Null means every campaign this account owns. */
  campaignId: string | null;
  scopes: string[];
}

export type AuthResult =
  | { ok: true; caller: ApiCaller }
  | { ok: false; status: number; error: string };

export async function authenticate(request: Request): Promise<AuthResult> {
  const key = keyFromHeader(request.headers.get('authorization'));
  if (!key) {
    return {
      ok: false,
      status: 401,
      error: 'Kunci API tiada. Hantar header: Authorization: Bearer ca_live_…',
    };
  }

  const supabase = adminDb();
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, owner_id, campaign_id, scopes, revoked_at')
    .eq('key_hash', hashKey(key))
    .maybeSingle();

  // A wrong key and a revoked key get the same answer on purpose: telling them
  // apart tells an attacker which keys once existed.
  if (error || !data || data.revoked_at) {
    return { ok: false, status: 401, error: 'Kunci API tidak sah atau sudah dibatalkan.' };
  }

  // Deliberately not awaited. A failed bookkeeping write must not fail the
  // request it was only meant to record.
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    ok: true,
    caller: {
      keyId: data.id as string,
      ownerId: data.owner_id as string,
      campaignId: (data.campaign_id as string | null) ?? null,
      scopes: (data.scopes as string[]) ?? [],
    },
  };
}

/**
 * Confirms the caller may act on this campaign — that it exists, that their
 * account owns it, and that a campaign-pinned key was not pointed elsewhere.
 */
export async function authoriseCampaign(
  caller: ApiCaller,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (caller.campaignId && caller.campaignId !== campaignId) {
    return {
      ok: false,
      status: 403,
      error: `Kunci ini terhad kepada kempen ${caller.campaignId}.`,
    };
  }

  const { data } = await adminDb()
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('owner_id', caller.ownerId)
    .maybeSingle();

  // Same answer for "does not exist" and "belongs to someone else", so the API
  // cannot be used to discover which campaign ids are taken.
  if (!data) {
    return { ok: false, status: 404, error: `Kempen ${campaignId} tidak dijumpai.` };
  }
  return { ok: true };
}

export function requireScope(
  caller: ApiCaller,
  scope: 'read' | 'write',
): { ok: true } | { ok: false; status: number; error: string } {
  if (!caller.scopes.includes(scope)) {
    return { ok: false, status: 403, error: `Kunci ini tiada kebenaran '${scope}'.` };
  }
  return { ok: true };
}
