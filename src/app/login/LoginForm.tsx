'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loginAction } from './actions';
import { Field, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

export function LoginForm() {
  const [error, action] = useActionState<string | null, FormData>(loginAction, null);
  const next = useSearchParams().get('next') ?? '/';

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="Kata laluan">
        <Input name="password" type="password" autoFocus required autoComplete="current-password" />
      </Field>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <SubmitButton variant="primary" className="w-full" pendingLabel="Menyemak…">
        Masuk
      </SubmitButton>
    </form>
  );
}
