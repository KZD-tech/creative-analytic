import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseEnv } from '@/lib/env';

// The schema is chosen at runtime from an env var, so the client cannot be
// typed against a literal schema name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export class SupabaseNotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Supabase belum dikonfigurasi. Env yang tiada: ${missing.join(', ')}`);
    this.name = 'SupabaseNotConfiguredError';
  }
}

/**
 * The client every query goes through. It carries the signed-in user's session
 * from the request cookies, so Postgres sees `authenticated` with a real
 * `auth.uid()` and the row-level policies decide what is visible.
 *
 * This is the whole ownership boundary: a forgotten `.eq('owner_id', …)` in
 * application code cannot leak another account's campaign, because the
 * database never returns those rows in the first place.
 */
export async function db(): Promise<Db> {
  const env = readSupabaseEnv();
  if (!env.ok) throw new SupabaseNotConfiguredError(env.missing);

  const store = await cookies();

  return createServerClient(env.url, env.anonKey, {
    db: { schema: env.schema },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies. Session refresh happens in
          // the proxy, which can, so losing the write here is harmless.
        }
      },
    },
  }) as Db;
}

/**
 * Service-role client. Bypasses RLS, so it is reserved for the few operations
 * that are genuinely about the account system rather than about one user's
 * data: reading the invite list during sign-up checks, and admin user
 * management. Never use it to serve campaign data.
 */
export function adminDb(): Db {
  const env = readSupabaseEnv();
  if (!env.ok) throw new SupabaseNotConfiguredError(env.missing);
  if (!env.serviceKey) {
    throw new SupabaseNotConfiguredError(['SUPABASE_SERVICE_ROLE_KEY']);
  }

  return createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: env.schema },
  }) as Db;
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
