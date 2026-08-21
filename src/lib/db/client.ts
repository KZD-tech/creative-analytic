import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseEnv } from '@/lib/env';

// The schema is chosen at runtime from an env var, so the client cannot be
// typed against a literal schema name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = ReturnType<typeof createClient<any, any, any>>;

let cached: Db | null = null;

/**
 * Service-role client, server-side only. RLS is enabled with zero policies on
 * every table in the schema, so this key is the only way in — it must never
 * reach the browser.
 */
export function db(): Db {
  if (cached) return cached;

  const env = readSupabaseEnv();
  if (!env.ok) {
    throw new SupabaseNotConfiguredError(env.missing);
  }

  const client = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: env.schema },
  }) as Db;

  cached = client;
  return client;
}

export class SupabaseNotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Supabase belum dikonfigurasi. Env yang tiada: ${missing.join(', ')}`);
    this.name = 'SupabaseNotConfiguredError';
  }
}

/** True when the schema is missing from PostgREST's exposed-schema list. */
export function isSchemaNotExposed(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST106' ||
    msg.includes('schema must be one of the following') ||
    msg.includes('does not exist in the schema cache')
  );
}
