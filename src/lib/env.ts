type EnvState =
  | { ok: true; url: string; serviceKey: string; schema: string }
  | { ok: false; missing: string[] };

/**
 * Reads Supabase config without throwing. The dashboard renders a setup screen
 * when config is incomplete instead of crashing the whole route tree, which is
 * what you want the first time you deploy it.
 */
export function readSupabaseEnv(): EnvState {
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const schema = process.env.SUPABASE_SCHEMA?.trim() || 'creative';

  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, url, serviceKey, schema };
}

export const APP_PASSWORD = process.env.APP_PASSWORD?.trim() ?? '';
export const APP_SESSION_SECRET =
  process.env.APP_SESSION_SECRET?.trim() || 'creative-analytic-dev-secret';
