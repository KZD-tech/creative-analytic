import 'server-only';
import { readSupabaseEnv } from '@/lib/env';

export interface AuthProviders {
  google: boolean;
  /** Email + password. Always offered: it is the fallback when nothing else is. */
  email: boolean;
}

/**
 * Asks Supabase which sign-in methods are actually turned on.
 *
 * Without this the app would happily render a Google button for a project
 * where the provider is disabled, and clicking it drops the visitor on a raw
 * GoTrue JSON error at a Supabase URL — a dead end with no way back. Better to
 * offer only what will work.
 *
 * Cached briefly so enabling the provider in the dashboard shows up quickly
 * without asking Supabase on every page load. The cache serves the stale value
 * once while refreshing, so the first load after enabling it can still show the
 * old state — hence the "muat semula" in the hint on the login screen.
 */
export async function enabledProviders(): Promise<AuthProviders> {
  const env = readSupabaseEnv();
  if (!env.ok) return { google: false, email: true };

  try {
    const response = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.anonKey },
      next: { revalidate: 30 },
    });
    if (!response.ok) return { google: false, email: true };

    const settings = (await response.json()) as {
      external?: Record<string, boolean>;
      external_email_enabled?: boolean;
    };

    return {
      google: settings.external?.google === true,
      email: settings.external?.email !== false,
    };
  } catch {
    // Cannot tell: hide Google rather than offer a button that may dead-end.
    return { google: false, email: true };
  }
}
