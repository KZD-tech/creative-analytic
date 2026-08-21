import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db/client';

/**
 * Where Supabase returns after Google sign-in or an email confirmation link.
 * The code-for-session exchange happens here, on the server, and the session
 * lands in an httpOnly cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  // Supabase reports a refused sign-in — an uninvited Google account trips the
  // database trigger — by redirecting back here with an error, not a code.
  const errorDescription = searchParams.get('error_description');
  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Pautan tidak sah atau sudah luput.')}`);
  }

  const supabase = await db();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
