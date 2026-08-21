'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { inviteAction, revokeInviteAction, type InviteResult } from './actions';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Badge } from '@/components/ui/primitives';
import { dateTime } from '@/lib/format';

export interface InviteRow {
  email: string;
  role: string;
  created_at: string;
  accepted_at: string | null;
}

export function InviteForm() {
  const [state, action] = useActionState<InviteResult | null, FormData>(inviteAction, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="Emel" className="min-w-56 flex-1">
        <Input name="email" type="email" required placeholder="rakan@syarikat.com" />
      </Field>
      <Field label="Peranan">
        <Select name="role" defaultValue="member" className="w-auto">
          <option value="member">Ahli</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <SubmitButton variant="primary" pendingLabel="Menjemput…">
        Jemput
      </SubmitButton>
      {state ? (
        <Notice tone={state.ok ? 'ok' : 'error'} className="w-full">
          {state.message}
        </Notice>
      ) : null}
    </form>
  );
}

export function InviteList({ invites }: { invites: InviteRow[] }) {
  const [state, action] = useActionState<InviteResult | null, FormData>(revokeInviteAction, null);

  if (invites.length === 0) {
    return <p className="text-[12px] text-ink-muted">Belum ada jemputan.</p>;
  }

  return (
    <div>
      {state ? (
        <Notice tone={state.ok ? 'ok' : 'error'} className="mb-3">
          {state.message}
        </Notice>
      ) : null}

      <ul className="divide-y divide-[color:var(--border)]">
        {invites.map((invite) => (
          <li key={invite.email} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium">{invite.email}</div>
              <div className="text-[11px] text-ink-muted">
                {invite.role === 'admin' ? 'Admin' : 'Ahli'} · dijemput {dateTime(invite.created_at)}
              </div>
            </div>

            {invite.accepted_at ? (
              <Badge tone="good" icon={<span aria-hidden>✓</span>}>
                Diterima
              </Badge>
            ) : (
              <>
                <Badge tone="neutral">Menunggu</Badge>
                <form action={action}>
                  <input type="hidden" name="email" value={invite.email} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Batalkan jemputan ${invite.email}`}>
                    <Trash2 size={13} />
                  </Button>
                </form>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
