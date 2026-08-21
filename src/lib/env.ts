type EnvState =
  | { ok: true; url: string; anonKey: string; serviceKey: string | null; schema: string }
  | { ok: false; missing: string[] };

/**
 * Reads Supabase config without throwing. The dashboard renders a setup screen
 * when config is incomplete instead of crashing the whole route tree, which is
 * what you want the first time you deploy it.
 *
 * None of these are NEXT_PUBLIC_. Sign-in — including the Google redirect — is
 * driven from server actions, so no Supabase credential ever reaches the
 * browser and the browser never talks to Supabase directly.
 */
export function readSupabaseEnv(): EnvState {
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const schema = process.env.SUPABASE_SCHEMA?.trim() || 'public';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!anonKey) missing.push('SUPABASE_ANON_KEY');

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, url, anonKey, serviceKey: serviceKey || null, schema };
}

/** Where Supabase sends the browser back after a Google sign-in. */
export function siteUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
