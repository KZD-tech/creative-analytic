'use client';

import { useActionState, useState } from 'react';
import { createCampaignAction, type ActionResult } from '@/app/actions';
import { Field, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function NewCampaignForm({ compact = false }: { compact?: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createCampaignAction, null);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <Field label="Nama ruang kerja">
        <Input
          name="name"
          value={name}
          placeholder="Contoh: Masjid Al-Amin 2026"
          required
          onChange={(event) => {
            setName(event.target.value);
            if (!idTouched) setId(slugify(event.target.value));
          }}
        />
      </Field>

      <Field label="ID" hint="Huruf kecil, nombor dan tanda - sahaja. Muncul dalam URL, dan tidak boleh ditukar.">
        <Input
          name="id"
          value={id}
          placeholder="masjid-al-amin-2026"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          onChange={(event) => {
            setIdTouched(true);
            setId(event.target.value);
          }}
        />
      </Field>

      {compact ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mata wang">
            <Input name="currency" defaultValue="MYR" />
          </Field>
          <Field label="Zon waktu" hint="Menentukan hari mana sesuatu derma dikira.">
            <Input name="timezone" defaultValue="Asia/Kuala_Lumpur" />
          </Field>
        </div>
      )}

      {state ? (
        <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice>
      ) : null}

      <SubmitButton variant="primary" pendingLabel="Membuat…">
        Buat ruang kerja
      </SubmitButton>
    </form>
  );
}
