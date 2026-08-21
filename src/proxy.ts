import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Everything except the sign-in surfaces and Next's own assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|login|auth/callback).*)'],
};

/**
 * Two jobs on every request: refresh the Supabase session so a long-lived tab
 * does not silently expire, and bounce signed-out visitors to /login.
 *
 * The refresh has to happen here rather than in a server component, because
 * only middleware can write the rotated cookies back to the response.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  // Not configured yet: let the request through so the setup screen can explain
  // what is missing instead of redirecting to a login that cannot work either.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(target);
  }

  return response;
}
