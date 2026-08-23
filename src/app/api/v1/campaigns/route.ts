import { authenticate, requireScope } from '@/lib/api/auth';
import { adminDb } from '@/lib/db/client';
import { fail, ok } from '../_respond';

export const dynamic = 'force-dynamic';

/** Lets an agent discover which campaigns its key can reach. */
export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const scope = requireScope(auth.caller, 'read');
  if (!scope.ok) return fail(scope.status, scope.error);

  let query = adminDb()
    .from('campaigns')
    .select('id, name, currency, timezone, status')
    .eq('owner_id', auth.caller.ownerId)
    .order('name');

  // A key pinned to one campaign sees only that one, even here.
  if (auth.caller.campaignId) query = query.eq('id', auth.caller.campaignId);

  const { data, error } = await query;
  if (error) return fail(500, error.message);

  return ok({ campaigns: data ?? [] });
}
