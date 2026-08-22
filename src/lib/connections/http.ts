/**
 * Shared response handling for the ad platforms.
 *
 * Two things kept going wrong without it. A proxy or an outage answers with
 * HTML or a bare string, and `response.json()` then reports a JSON syntax
 * error — which says nothing about what actually happened, and whose wording
 * ("Unexpected token …") used to trip the reauth heuristic. And "does this
 * connection need reconnecting?" was being decided by searching the message
 * for the word "token", which is true of far more failures than it should be.
 */

export class PlatformError extends Error {
  readonly status: number;
  /** True only for a refusal the user can fix by connecting the account again. */
  readonly needsReauth: boolean;

  constructor(message: string, options: { status?: number; needsReauth?: boolean } = {}) {
    super(message);
    this.name = 'PlatformError';
    this.status = options.status ?? 0;
    this.needsReauth = options.needsReauth ?? false;
  }
}

export function needsReauth(error: unknown): boolean {
  return error instanceof PlatformError && error.needsReauth;
}

/** Long bodies are truncated: this ends up in the UI, next to the account name. */
function excerpt(body: string): string {
  const clean = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

/**
 * Reads a platform response as JSON, or throws a `PlatformError` that says what
 * came back instead. `label` names the platform for the message.
 */
export async function readJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.ok) {
      throw new PlatformError(`${label} memulangkan jawapan yang tidak difahami: ${excerpt(text)}`);
    }
    throw new PlatformError(
      `${label} gagal (HTTP ${response.status}): ${excerpt(text) || 'tiada butiran'}`,
      { status: response.status, needsReauth: response.status === 401 },
    );
  }
}

/**
 * A platform call that hangs is worse than one that fails: the whole request
 * runs out of time, and a serverless timeout carries no message at all — the
 * user is told an unknown error occurred. Failing on our own terms keeps the
 * reason attached.
 */
export const PLATFORM_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new PlatformError(
      timedOut
        ? `${label} tidak menjawab dalam ${PLATFORM_TIMEOUT_MS / 1000} saat. Cuba tempoh yang lebih pendek.`
        : `${label} tidak dapat dihubungi: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
