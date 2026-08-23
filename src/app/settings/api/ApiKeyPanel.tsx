'use client';

import { useActionState, useState } from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { createKeyAction, revokeKeyAction, type KeyResult } from './actions';
import type { ApiKeyRow } from '@/lib/db/apiKeys';
import { Field, Input, Select } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Badge } from '@/components/ui/primitives';
import { dateTime } from '@/lib/format';

export function CreateKeyForm({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const [state, action] = useActionState<KeyResult | null, FormData>(createKeyAction, null);

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <Field label="Nama" hint="Untuk mengenalinya kemudian — contohnya “Hermes — Onpay”.">
          <Input name="name" required placeholder="Hermes — Onpay" />
        </Field>

        <Field label="Kempen" hint="Hadkan kunci kepada satu kempen, atau biarkan terbuka.">
          <Select name="campaign_id" defaultValue="">
            <option value="">Semua kempen saya</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-medium text-ink-2">Kebenaran</legend>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" name="scopes" value="read" defaultChecked className="accent-ink" />
            Baca — senarai kempen, kreatif dan metrik
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" name="scopes" value="write" defaultChecked className="accent-ink" />
            Tulis — hantar derma
          </label>
        </fieldset>

        <SubmitButton>
          <KeyRound size={14} /> Cipta kunci
        </SubmitButton>
      </form>

      {state?.key && <RevealedKey value={state.key} />}
      {state && !state.key && (
        <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice>
      )}
    </div>
  );
}

/**
 * The one moment the key is readable. It is shown with a copy button rather
 * than as plain text to select, because a key half-selected by a mouse drag is
 * a support conversation waiting to happen.
 */
function RevealedKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the key is on screen either way.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-warning-soft p-3">
      <p className="text-[12px] font-medium text-ink">
        Salin sekarang — kunci ini tidak akan dipaparkan lagi.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-2.5 py-2 text-[12px] text-ink">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] font-medium text-ink hover:bg-surface-2"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Disalin' : 'Salin'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Hanya cincangannya disimpan, jadi kami sendiri tidak boleh membacanya semula. Kalau ia
        hilang, batalkan kunci ini dan cipta yang baharu.
      </p>
    </div>
  );
}

export function KeyList({ keys }: { keys: ApiKeyRow[] }) {
  const [state, action] = useActionState<KeyResult | null, FormData>(revokeKeyAction, null);

  if (keys.length === 0) {
    return <p className="text-[13px] text-ink-2">Belum ada kunci API.</p>;
  }

  return (
    <div className="space-y-2">
      {state && <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice>}

      {keys.map((key) => (
        <div
          key={key.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-ink">{key.name}</span>
              {key.revoked_at ? (
                <Badge tone="critical">Dibatalkan</Badge>
              ) : (
                <Badge tone="good">Aktif</Badge>
              )}
              {key.campaign_id && <Badge>{key.campaign_id}</Badge>}
              {key.scopes.map((scope) => (
                <Badge key={scope}>{scope}</Badge>
              ))}
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">
              <code>{key.prefix}…</code> ·{' '}
              {key.last_used_at
                ? `terakhir digunakan ${dateTime(key.last_used_at)}`
                : 'belum pernah digunakan'}
            </p>
          </div>

          {!key.revoked_at && (
            <form action={action}>
              <input type="hidden" name="key_id" value={key.id} />
              <SubmitButton variant="danger">
                <Trash2 size={13} /> Batalkan
              </SubmitButton>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
