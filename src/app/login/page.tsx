import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
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
