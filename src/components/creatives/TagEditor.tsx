'use client';

import { useActionState, useState } from 'react';
import { X } from 'lucide-react';
import {
  bulkTagAction, deleteTagAction, setCreativeTagsAction, type ActionResult,
} from '@/app/actions';
import { TAG_DIMENSION_LABELS, type Tag, type TagDimension } from '@/types/db';
import { Input, Select } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';

export function TagEditor({
  campaignId,
  creativeId,
  available,
  assigned,
}: {
  campaignId: string;
  creativeId: string;
  available: Tag[];
  assigned: Tag[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned.map((tag) => tag.id)));
  const [saveState, saveAction] = useActionState<ActionResult | null, FormData>(
    setCreativeTagsAction,
    null,
  );
  const [createState, createAction] = useActionState<ActionResult | null, FormData>(
    bulkTagAction,
    null,
  );
  const [deleteState, deleteAction] = useActionState<ActionResult | null, FormData>(
    deleteTagAction,
    null,
  );

  const byDimension = new Map<TagDimension, Tag[]>();
  for (const tag of available) {
    const list = byDimension.get(tag.dimension) ?? [];
    list.push(tag);
    byDimension.set(tag.dimension, list);
  }

  return (
    <div className="space-y-3">
      {available.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          Belum ada tag. Cipta yang pertama di bawah — tag inilah yang membolehkan breakdown
          prestasi mengikut hook, format atau angle.
        </p>
      ) : (
        <div className="space-y-2.5">
          {[...byDimension.entries()].map(([dimension, tags]) => (
            <div key={dimension}>
              <div className="mb-1 text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                {TAG_DIMENSION_LABELS[dimension]}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const on = selected.has(tag.id);
                  return (
                    <div key={tag.id} className="group/tag relative inline-flex">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(tag.id)) next.delete(tag.id);
                            else next.add(tag.id);
                            return next;
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                          on
                            ? 'border-line-strong bg-surface-3 font-medium text-ink'
                            : 'border-line text-ink-muted hover:text-ink',
                        )}
                      >
                        {tag.label}
                      </button>
                      {/* A sibling form, not nested inside the save form below —
                          deleting the tag definition is a separate action from
                          toggling it for this one creative, and HTML forms
                          cannot nest. */}
                      <form
                        action={deleteAction}
                        className="contents"
                        onSubmit={(event) => {
                          if (
                            !confirm(
                              `Padam tag "${tag.label}"? Ia akan dibuang daripada semua kreatif yang guna tag ini, bukan setakat kreatif ini sahaja.`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="tag_id" value={tag.id} />
                        <button
                          type="submit"
                          aria-label={`Padam tag ${tag.label}`}
                          className="absolute -right-1.5 -top-1.5 hidden size-4 items-center justify-center rounded-full bg-critical text-white transition-opacity group-hover/tag:flex hover:bg-critical/85"
                        >
                          <X size={10} strokeWidth={3} />
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <form action={saveAction} className="pt-0.5">
            <input type="hidden" name="creative_id" value={creativeId} />
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="tag_id" value={id} />
            ))}
            <SubmitButton size="sm" pendingLabel="Menyimpan…">
              Simpan tag
            </SubmitButton>
          </form>

          {saveState ? <Notice tone={saveState.ok ? 'ok' : 'error'}>{saveState.message}</Notice> : null}
          {deleteState ? (
            <Notice tone={deleteState.ok ? 'ok' : 'error'}>{deleteState.message}</Notice>
          ) : null}
        </div>
      )}

      <form action={createAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <input type="hidden" name="campaign_id" value={campaignId} />
        <input type="hidden" name="creative_id" value={creativeId} />
        <Select name="dimension" defaultValue="hook" aria-label="Dimensi tag baharu" className="w-auto">
          {(Object.keys(TAG_DIMENSION_LABELS) as TagDimension[]).map((dimension) => (
            <option key={dimension} value={dimension}>
              {TAG_DIMENSION_LABELS[dimension]}
            </option>
          ))}
        </Select>
        <Input name="label" placeholder="Tag baharu" aria-label="Nama tag baharu" className="w-40" required />
        <SubmitButton size="sm" variant="secondary" pendingLabel="Menambah…">
          Tambah tag
        </SubmitButton>
        {createState ? (
          <Notice tone={createState.ok ? 'ok' : 'error'} className="w-full">
            {createState.message}
          </Notice>
        ) : null}
      </form>
    </div>
  );
}
