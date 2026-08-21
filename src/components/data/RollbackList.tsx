'use client';

import { useActionState } from 'react';
import { Undo2 } from 'lucide-react';
import { rollbackAction, type ActionResult } from '@/app/actions';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { dateTime } from '@/lib/format';
import type { UploadBatch } from '@/types/db';

const KIND_LABEL: Record<string, string> = {
  fb_ads: 'Meta Ads',
  conversions: 'Derma',
  media_links: 'Pautan video',
  meta_api: 'Meta API',
  rollback: 'Rollback',
};

export function RollbackList({
  campaignId,
  snapshots,
}: {
  campaignId: string;
  snapshots: UploadBatch[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(rollbackAction, null);

  if (snapshots.length === 0) {
    return (
      <p className="px-5 pb-4 text-[12px] text-ink-muted">
        Tiada snapshot lagi. Setiap muat naik Meta Ads atau derma menyimpan keadaan sebelumnya
        secara automatik; lima yang terkini dikekalkan.
      </p>
    );
  }

  return (
    <div className="px-5 pb-4">
      {state ? (
        <Notice tone={state.ok ? 'ok' : 'error'} className="mb-3">
          {state.message}
        </Notice>
      ) : null}

      <ul className="divide-y divide-[color:var(--border)]">
        {snapshots.map((snapshot) => (
          <li key={snapshot.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium">
                {KIND_LABEL[snapshot.kind] ?? snapshot.kind} · {snapshot.snapshot_rows} rekod
              </div>
              <div className="text-[11px] text-ink-muted">
                {dateTime(snapshot.created_at)}
                {snapshot.filename ? ` · ${snapshot.filename}` : ''}
              </div>
            </div>
            <form
              action={action}
              onSubmit={(event) => {
                if (
                  !confirm(
                    'Rollback akan menggantikan data semasa dengan keadaan sebelum muat naik ini. Teruskan?',
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="campaign_id" value={campaignId} />
              <input type="hidden" name="batch_id" value={snapshot.id} />
              <Button type="submit" variant="danger" size="sm">
                <Undo2 size={12} /> Rollback
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
