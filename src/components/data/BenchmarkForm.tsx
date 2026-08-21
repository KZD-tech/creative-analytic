'use client';

import { useActionState } from 'react';
import { saveBenchmarksAction, type ActionResult } from '@/app/actions';
import { Field, Input } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { Benchmarks } from '@/types/db';

const GROUPS: { label: string; hint: string; good: keyof Benchmarks; ok: keyof Benchmarks }[] = [
  { label: 'Hook rate', hint: 'pecahan, cth 0.20 = 20%', good: 'hook_rate_good', ok: 'hook_rate_ok' },
  { label: 'Hold rate', hint: 'pecahan', good: 'hold_rate_good', ok: 'hold_rate_ok' },
  { label: 'CTR (link)', hint: 'pecahan, cth 0.03 = 3%', good: 'ctr_good', ok: 'ctr_ok' },
  { label: 'Kadar LPV', hint: 'pecahan daripada klik', good: 'lpv_rate_good', ok: 'lpv_rate_ok' },
  { label: 'CVR', hint: 'pecahan daripada LPV', good: 'cvr_good', ok: 'cvr_ok' },
  { label: 'ROAS', hint: 'gandaan, cth 1.0', good: 'roas_good', ok: 'roas_ok' },
];

export function BenchmarkForm({ benchmarks }: { benchmarks: Benchmarks }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveBenchmarksAction, null);

  return (
    <form action={action} className="space-y-3 px-5 pb-4">
      <input type="hidden" name="campaign_id" value={benchmarks.campaign_id} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg border border-line px-3 py-2.5">
            <div className="text-[12px] font-medium">{group.label}</div>
            <div className="mt-0.5 text-[10px] text-ink-muted">{group.hint}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Baik">
                <Input
                  name={group.good}
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={String(benchmarks[group.good])}
                />
              </Field>
              <Field label="Sederhana">
                <Input
                  name={group.ok}
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={String(benchmarks[group.ok])}
                />
              </Field>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-line px-3 py-2.5">
          <div className="text-[12px] font-medium">Ambang belanja</div>
          <div className="mt-0.5 text-[10px] text-ink-muted">
            Di bawah ini kreatif dilabel &ldquo;belum cukup data&rdquo;.
          </div>
          <div className="mt-2">
            <Field label="Belanja minimum">
              <Input name="min_spend" type="number" step="1" min="0" defaultValue={String(benchmarks.min_spend)} />
            </Field>
          </div>
        </div>
      </div>

      {state ? <Notice tone={state.ok ? 'ok' : 'error'}>{state.message}</Notice> : null}
      <SubmitButton variant="primary" size="sm" pendingLabel="Menyimpan…">
        Simpan benchmark
      </SubmitButton>
    </form>
  );
}
