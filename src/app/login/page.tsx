import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { readSupabaseEnv } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // /login is outside the proxy's auth check, so it has to make the same
  // config call itself — otherwise the form would post into an action that
  // cannot possibly work.
  if (!readSupabaseEnv().ok) redirect('/setup');

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-base font-semibold">Creative Analytic</h1>
        <p className="mt-1 mb-5 text-[12px] text-ink-muted">
          Masukkan kata laluan dashboard untuk teruskan.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
