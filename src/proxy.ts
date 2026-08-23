import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
  // The machine API carries its own key in a header and has no cookie session.
  // Redirecting it to /login would answer an agent's POST with a login page and
  // a 200, which reads as success and silently drops the data.
  if (request.nextUrl.pathname.startsWith('/api/v1/')) return NextResponse.next();

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

  // A Supabase outage should land on the login screen, not crash the render.
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (request.nextUrl.pathname === '/login') {
    // Signed in already: no reason to show the form again.
    if (data.user) {
      const home = request.nextUrl.clone();
      home.pathname = '/';
      home.search = '';
      return NextResponse.redirect(home);
    }
    return response;
  }

  if (!data.user) {

    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(target);
  }

  return response;
}
