import 'server-only';

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: unknown };

/**
 * Page components stay straight-line: they await one loader and branch on the
 * result, rather than wrapping their own JSX in a try/catch (which React's
 * lint rules rightly object to, and which swallows render-time errors along
 * with the intended data-layer ones).
 */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}
