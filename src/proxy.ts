import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, safeEqual, sessionToken } from '@/lib/auth';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
};

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  // No password configured means the dashboard runs open — fine locally, and
  // the deploy docs call it out as a must-set for anything public.
  if (!password) return NextResponse.next();

  const secret = process.env.APP_SESSION_SECRET?.trim() || 'creative-analytic-dev-secret';
  const expected = await sessionToken(password, secret);
  const provided = request.cookies.get(SESSION_COOKIE)?.value ?? '';

  if (safeEqual(provided, expected)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}
