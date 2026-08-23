import { NextResponse } from 'next/server';

/**
 * One shape for every reply, so an agent can branch on `ok` rather than on
 * status codes it may not surface.
 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** Reads a JSON body without letting malformed input become a 500. */
export async function readBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}
