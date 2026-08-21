'use client';

import { useActionState } from 'react';
import { Link2, PlugZap, RefreshCw, Unlink } from 'lucide-react';
import {
  disconnectAction, linkConnectionAction, syncCampaignAction, unlinkConnectionAction,
  type ConnectionResult,
} from '@/app/connections-actions';
import type { AdConnection, CampaignSource } from '@/lib/db/connections';
import type { PlatformStatus } from '@/lib/connections/config';
import { Button, SubmitButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Badge } from '@/components/ui/primitives';
import { dateTime, relativeDays } from '@/lib/format';

const PLATFORM_LABEL: Record<string, string> = { meta: 'Meta Ads', google_ads: 'Google Ads' };

export function ConnectButtons({
  campaignId,
  statuses,
}: {
  campaignId: string;
  statuses: PlatformStatus[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => {
        const label = PLATFORM_LABEL[status.platform];
        const path = status.platform === 'meta' ? 'meta' : 'google-ads';

        if (!status.ready) {
          return (
            <div key={status.platform} className="w-full">
              <Notice tone="info" title={`${label} belum boleh disambung`}>
                Env yang belum diisi: <code className="rounded bg-surface-2 px-1">
                  {status.missing.join(', ')}
                </code>
              </Notice>
            </div>
          );
        }

        return (
          <a
            key={status.platform}
            href={`/api/connect/${path}/start?campaign=${encodeURIComponent(campaignId)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            <PlugZap size={14} /> Sambung {label}
          </a>
        );
      })}
    </div>
  );
}

export function SyncButton({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState<ConnectionResult | null, FormData>(syncCampaignAction, null);

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="campaign_id" value={campaignId} />
        <SubmitButton variant="primary" pendingLabel="Menarik data…">
          <RefreshCw size={13} /> Segerak sekarang
        </SubmitButton>
      </form>

      {state ? (
        <div className="mt-3 space-y-2">
          <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice>
          {state.warnings && state.warnings.length > 0 ? (
            <Notice tone="warning" title="Amaran">
              <ul className="list-inside list-disc space-y-0.5">
                {[...new Set(state.warnings)].map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LinkedSources({
  campaignId,
  sources,
  connections,
}: {
  campaignId: string;
  sources: CampaignSource[];
  connections: AdConnection[];
}) {
  const [linkState, link] = useActionState<ConnectionResult | null, FormData>(linkConnectionAction, null);
  const [unlinkState, unlink] = useActionState<ConnectionResult | null, FormData>(unlinkConnectionAction, null);
  const [dropState, drop] = useActionState<ConnectionResult | null, FormData>(disconnectAction, null);

  const linkedIds = new Set(sources.map((source) => source.connection_id));
  const available = connections.filter((connection) => !linkedIds.has(connection.id));

  return (
    <div className="space-y-4">
      {sources.length > 0 ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12px] font-medium">
                  {source.connection.account_name ?? source.connection.external_account_id}
                  <Badge tone="neutral">{PLATFORM_LABEL[source.connection.platform]}</Badge>
                  {source.connection.status === 'needs_reauth' ? (
                    <Badge tone="critical" icon={<span aria-hidden>!</span>}>Perlu sambung semula</Badge>
                  ) : null}
                </div>
                <div className="text-[11px] text-ink-muted">
                  {source.connection.external_account_id}
                  {source.platform_campaign_ids.length > 0
                    ? ` · dihadkan kepada ${source.platform_campaign_ids.length} kempen platform`
                    : ' · seluruh akaun'}
                  {source.connection.last_sync_at
                    ? ` · segerak terakhir ${relativeDays(source.connection.last_sync_at)} (${source.connection.last_sync_rows} baris)`
                    : ' · belum pernah disegerak'}
                </div>
                {source.connection.last_sync_error ? (
                  <div className="mt-1 text-[11px] text-critical">
                    {source.connection.last_sync_error}
                  </div>
                ) : null}
              </div>

              <form action={unlink}>
                <input type="hidden" name="source_id" value={source.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Unlink size={12} /> Buang dari kempen
                </Button>
              </form>

              <form action={drop}>
                <input type="hidden" name="connection_id" value={source.connection_id} />
                <Button type="submit" variant="danger" size="sm">
                  Putuskan akaun
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-muted">
          Belum ada akaun iklan disambungkan ke kempen ini.
        </p>
      )}

      {available.length > 0 ? (
        <form action={link} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <Field label="Akaun yang sudah disambung" className="min-w-56 flex-1">
            <Select name="connection_id" required>
              {available.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {PLATFORM_LABEL[connection.platform]} · {connection.account_name ?? connection.external_account_id}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Had kepada kempen platform (pilihan)"
            hint="ID kempen Meta atau Google, dipisah koma. Kosongkan untuk seluruh akaun."
            className="min-w-56 flex-1"
          >
            <Input name="platform_campaign_ids" placeholder="23850000000000001, 23850000000000002" />
          </Field>
          <SubmitButton pendingLabel="Menyambung…">
            <Link2 size={13} /> Sambung ke kempen
          </SubmitButton>
        </form>
      ) : null}

      {[linkState, unlinkState, dropState].map((state, index) =>
        state ? (
          <Notice key={index} tone={state.ok ? 'ok' : 'error'}>
            {state.message}
          </Notice>
        ) : null,
      )}
    </div>
  );
}

export function ConnectFeedback({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <Notice tone={error ? 'error' : 'ok'} className="mb-3">
      {error ?? ok}
    </Notice>
  );
}

export function LastSyncLine({ connections }: { connections: AdConnection[] }) {
  const latest = connections
    .map((connection) => connection.last_sync_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();

  if (!latest) return null;
  return <p className="text-[11px] text-ink-muted">Penarikan terakhir: {dateTime(latest)}</p>;
}
