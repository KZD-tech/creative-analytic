import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Everything except the sign-in surfaces and Next's own assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|setup|auth/callback).*)'],
};

/**
 * Two jobs on every request: refresh the Supabase session so a long-lived tab
 * does not silently expire, and bounce signed-out visitors to /login.
 *
 * The refresh has to happen here rather than in a server component, because
 * only middleware can write the rotated cookies back to the response.
 */
export async function proxy(request: NextRequest) {
  // Machine-called routes carry their own auth (an API key, or CRON_SECRET)
  // and never have a cookie session — Vercel's own scheduler calls
  // /api/sync/cron with no browser behind it at all. Redirecting either to
  // /login would answer a POST or a cron invocation with a login page and a
  // 200/307, which reads as success while silently dropping the request
  // before the route's own auth check ever runs.
  if (request.nextUrl.pathname.startsWith('/api/v1/')) return NextResponse.next();
  if (request.nextUrl.pathname === '/api/sync/cron') return NextResponse.next();

  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  // Not configured yet. Send everything to the setup screen: letting the
  // request through means `requireUser()` throws deep inside a server
  // component, and React replaces that message with a bare error code in
  // production — a dead end for whoever is doing the deploy.
  if (!url || !anonKey) {
    const setup = request.nextUrl.clone();
    setup.pathname = '/setup';
    setup.search = '';
    return NextResponse.rewrite(setup);
  }

  // Collected separately from the response so rotating a refreshed session
  // cookie never depends on which branch below builds the final response.
  let rotatedCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        rotatedCookies = list;
      },
    },
  });

  // A Supabase outage should land on the login screen, not crash the render.
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  const finish = (res: NextResponse) => {
    for (const { name, value, options } of rotatedCookies) res.cookies.set(name, value, options);
    return res;
  };

  if (request.nextUrl.pathname === '/login') {
    // Signed in already: no reason to show the form again.
    if (data.user) {
      const home = request.nextUrl.clone();
      home.pathname = '/';
      home.search = '';
      return finish(NextResponse.redirect(home));
    }
    return finish(NextResponse.next({ request }));
  }

  if (!data.user) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return finish(NextResponse.redirect(target));
  }

  // Relay the identity just validated above via request headers, so server
  // components can read it instead of paying for a second `getUser()` round
  // trip to Supabase Auth for the same check on every single navigation.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', data.user.id);
  requestHeaders.set('x-user-email', data.user.email ?? '');
  return finish(NextResponse.next({ request: { headers: requestHeaders } }));
}
