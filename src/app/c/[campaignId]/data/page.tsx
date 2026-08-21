import { getBenchmarks, getCampaign, listBatches, listSnapshots } from '@/lib/db/queries';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { UploadPanel } from '@/components/data/UploadPanel';
import { RollbackList } from '@/components/data/RollbackList';
import { BenchmarkForm } from '@/components/data/BenchmarkForm';
import { NewCampaignForm } from '@/components/NewCampaignForm';
import { Card, CardHeader, SectionTitle, Badge } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  fb_ads: 'Meta Ads',
  conversions: 'Derma',
  media_links: 'Pautan video',
  meta_api: 'Meta API',
  rollback: 'Rollback',
};

const STATUS_TONE = {
  ok: 'good',
  partial: 'warning',
  error: 'critical',
  rolled_back: 'neutral',
} as const;

export default async function DataPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [batches, snapshots, benchmarks] = await Promise.all([
      listBatches(campaignId),
      listSnapshots(campaignId),
      getBenchmarks(campaignId),
    ]);
    return { batches, snapshots, benchmarks };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { batches, snapshots, benchmarks } = loaded.data;

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Muat naik data</SectionTitle>
        <UploadPanel campaignId={campaignId} />
      </section>

      <section>
        <SectionTitle>Log muat naik</SectionTitle>
        <Card className="overflow-x-auto">
          {batches.length === 0 ? (
            <p className="px-5 py-6 text-[12px] text-ink-muted">Belum ada muat naik.</p>
          ) : (
            <table className="w-full min-w-[720px] text-[12px]">
              <thead>
                <tr className="border-b border-line">
                  {['Masa', 'Jenis', 'Fail', 'Baris', 'Status', 'Nota'].map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 text-left font-medium text-ink-muted">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">
                      {dateTime(batch.created_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-medium">
                      {KIND_LABEL[batch.kind] ?? batch.kind}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-ink-2" title={batch.filename ?? ''}>
                      {batch.filename ?? '—'}
                    </td>
                    <td className="tnum px-4 py-2 whitespace-nowrap text-ink-2">
                      +{batch.inserted_count} / ~{batch.updated_count} / −{batch.skipped_count}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[batch.status]}>{batch.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-ink-2">
                      {batch.message ?? '—'}
                      {batch.warnings.length > 0 ? (
                        <ul className="mt-1 list-inside list-disc text-[11px] text-ink-muted">
                          {batch.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Rollback</SectionTitle>
        <Card>
          <CardHeader
            title="Snapshot automatik"
            subtitle="Keadaan data sebelum setiap muat naik. Lima yang terkini dikekalkan bagi setiap jenis."
          />
          <RollbackList campaignId={campaignId} snapshots={snapshots} />
        </Card>
      </section>

      <section>
        <SectionTitle>Benchmark kempen</SectionTitle>
        <Card>
          <CardHeader
            title="Ambang funnel"
            subtitle="Nombor ini menentukan warna funnel, label winner, dan peringkat mana yang dikira bocor."
          />
          <BenchmarkForm benchmarks={benchmarks} />
        </Card>
      </section>

      <section>
        <SectionTitle>Sambungan Meta API</SectionTitle>
        <Notice tone="info" title="Fasa 2 — belum aktif">
          Lapisan data sudah agnostik: jadual metrik menyimpan{' '}
          <code className="rounded bg-surface-2 px-1">source</code> dan{' '}
          <code className="rounded bg-surface-2 px-1">external_ad_id</code>, jadi tarikan
          automatik daripada Meta Marketing API boleh menulis ke jadual yang sama tanpa mengubah
          UI. Yang tinggal ialah Meta App, token, dan kelulusan permission{' '}
          <code className="rounded bg-surface-2 px-1">ads_read</code>. Lihat{' '}
          <code className="rounded bg-surface-2 px-1">docs/meta-api.md</code>.
        </Notice>
      </section>

      <section>
        <SectionTitle>Kempen baharu</SectionTitle>
        <Card className="max-w-md px-5 py-4">
          <NewCampaignForm />
        </Card>
      </section>
    </div>
  );
}
