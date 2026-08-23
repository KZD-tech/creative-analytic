'use client';

import { useActionState, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { updateCampaignAction } from '@/app/actions';
import type { ActionResult } from '@/app/actions';
import { Field, Input } from '@/components/ui/Field';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Badge } from '@/components/ui/primitives';

export interface WorkspaceRow {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
}

export function WorkspaceList({ workspaces }: { workspaces: WorkspaceRow[] }) {
  if (workspaces.length === 0) {
    return <p className="text-[13px] text-ink-2">Belum ada ruang kerja.</p>;
  }

  return (
    <div className="space-y-2">
      {workspaces.map((workspace) => (
        <WorkspaceCard key={workspace.id} workspace={workspace} />
      ))}
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await updateCampaignAction(prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    null,
  );

  return (
    <div className="rounded-xl border border-line px-3.5 py-3">
      {editing ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={workspace.id} />

          <Field label="Nama">
            <Input name="name" defaultValue={workspace.name} required autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mata wang">
              <Input name="currency" defaultValue={workspace.currency} />
            </Field>
            <Field label="Zon waktu" hint="Menentukan hari mana sesuatu derma dikira.">
              <Input name="timezone" defaultValue={workspace.timezone} />
            </Field>
          </div>

          <p className="text-[11px] text-ink-3">
            ID <code className="rounded bg-surface-2 px-1">{workspace.id}</code> kekal. Ia ada dalam
            setiap URL dan setiap panggilan API, jadi menukarnya akan memutuskan pautan tersimpan.
          </p>

          <div className="flex items-center gap-2">
            <SubmitButton variant="primary" pendingLabel="Menyimpan…">
              <Check size={14} /> Simpan
            </SubmitButton>
            <Button type="button" onClick={() => setEditing(false)}>
              <X size={14} /> Batal
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/c/${encodeURIComponent(workspace.id)}`}
                className="text-[13px] font-medium text-ink hover:underline"
              >
                {workspace.name}
              </a>
              {workspace.status !== 'active' && <Badge>Arkib</Badge>}
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">
              <code>{workspace.id}</code> · {workspace.currency} · {workspace.timezone}
            </p>
          </div>

          <Button type="button" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </Button>
        </div>
      )}

      {state && !state.ok && (
        <div className="mt-2">
          <Notice tone="error">{state.message}</Notice>
        </div>
      )}
      {state?.ok && !editing && (
        <div className="mt-2">
          <Notice tone="ok">{state.message}</Notice>
        </div>
      )}
    </div>
  );
}
