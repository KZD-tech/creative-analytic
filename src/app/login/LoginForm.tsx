'use client';

import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInAction, signUpAction, signInWithGoogleAction, type AuthResult } from './actions';
import { Field, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import type { AuthProviders } from '@/lib/auth/providers';

type Mode = 'sign-in' | 'sign-up';

export function LoginForm({ providers }: { providers: AuthProviders }) {
  const search = useSearchParams();
  const next = search.get('next') ?? '/';
  const urlError = search.get('error');
  const [mode, setMode] = useState<Mode>('sign-in');

  const [signInState, runSignIn] = useActionState<AuthResult | null, FormData>(signInAction, null);
  const [signUpState, runSignUp] = useActionState<AuthResult | null, FormData>(signUpAction, null);
  const state = mode === 'sign-in' ? signInState : signUpState;

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-0.5 rounded-lg border border-line bg-surface p-0.5">
        {(['sign-in', 'sign-up'] as Mode[]).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              mode === value ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {value === 'sign-in' ? 'Log masuk' : 'Daftar (perlu jemputan)'}
          </button>
        ))}
      </div>

      {providers.google ? (
        <>
          <form action={signInWithGoogleAction}>
            <SubmitButton variant="secondary" className="w-full" pendingLabel="Menghala ke Google…">
              <GoogleMark /> Teruskan dengan Google
            </SubmitButton>
          </form>

          <div className="flex items-center gap-3 text-[11px] text-ink-muted">
            <span className="h-px flex-1 bg-[color:var(--border)]" />
            atau
            <span className="h-px flex-1 bg-[color:var(--border)]" />
          </div>
        </>
      ) : null}

      <form action={mode === 'sign-in' ? runSignIn : runSignUp} className="space-y-3">
        <input type="hidden" name="next" value={next} />

        {mode === 'sign-up' ? (
          <Field label="Nama penuh">
            <Input name="full_name" autoComplete="name" placeholder="Nama anda" />
          </Field>
        ) : null}

        <Field label="Emel">
          <Input name="email" type="email" required autoComplete="email" placeholder="nama@syarikat.com" />
        </Field>

        <Field
          label="Kata laluan"
          hint={mode === 'sign-up' ? 'Minimum 8 aksara.' : undefined}
        >
          <Input
            name="password"
            type="password"
            required
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          />
        </Field>

        {urlError ? <Notice tone="error">{urlError}</Notice> : null}
        {state ? <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice> : null}

        <SubmitButton variant="primary" className="w-full" pendingLabel="Menyemak…">
          {mode === 'sign-in' ? 'Log masuk' : 'Buat akaun'}
        </SubmitButton>
      </form>

      {mode === 'sign-up' ? (
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Pendaftaran adalah melalui jemputan sahaja. Kalau emel anda belum dijemput, akaun tidak
          akan dibuat — minta admin menjemput anda dahulu.
        </p>
      ) : null}

      {!providers.google ? (
        <p className="text-[11px] leading-relaxed text-ink-muted">
          Log masuk Google belum dihidupkan pada projek Supabase ini. Hidupkannya di
          Authentication → Providers → Google, kemudian muat semula halaman ini sekali atau dua
          — butangnya akan muncul di sini.
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z" />
    </svg>
  );
}

