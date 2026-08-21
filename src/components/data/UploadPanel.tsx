'use client';

import { useActionState, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { uploadCsvAction, type ActionResult } from '@/app/actions';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Card } from '@/components/ui/primitives';

const KINDS = [
  {
    id: 'fb_ads',
    title: 'Meta Ads export',
    blurb:
      'Eksport Ads Manager di peringkat iklan. Pilih Breakdown → By Day untuk mengaktifkan semua graf trend.',
  },
  {
    id: 'conversions',
    title: 'Derma (Onpay)',
    blurb:
      'Eksport transaksi. Nama dan emel penderma tidak disimpan — hanya jumlah, masa dan rujukan iklan.',
  },
  {
    id: 'media_links',
    title: 'Pautan video',
    blurb: 'Dua lajur: ad_name dan youtube_url. Ini yang mengisi thumbnail pada grid kreatif.',
  },
] as const;

export function UploadPanel({ campaignId }: { campaignId: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {KINDS.map((kind) => (
        <UploadCard key={kind.id} campaignId={campaignId} kind={kind} />
      ))}
    </div>
  );
}

function UploadCard({
  campaignId,
  kind,
}: {
  campaignId: string;
  kind: (typeof KINDS)[number];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(uploadCsvAction, null);
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="flex flex-col px-4 py-4">
      <h3 className="text-[13px] font-semibold">{kind.title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{kind.blurb}</p>

      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="campaign_id" value={campaignId} />
        <input type="hidden" name="kind" value={kind.id} />
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="hidden"
          onChange={(event) => setFilename(event.target.files?.[0]?.name ?? '')}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
        >
          <Upload size={14} />
          {filename || 'Pilih fail CSV'}
        </button>

        <div className="flex items-center gap-2">
          <SubmitButton variant="primary" size="sm" pendingLabel="Memproses…">
            Muat naik
          </SubmitButton>
          <a
            href={`/api/templates/${kind.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
          >
            <Download size={12} /> Template
          </a>
        </div>
      </form>

      {state ? (
        <div className="mt-3 space-y-2">
          <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice>
          {state.warnings && state.warnings.length > 0 ? (
            <Notice tone="warning" title="Amaran">
              <ul className="list-inside list-disc space-y-0.5">
                {state.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
