import { getBenchmarks, getCampaign, listBatches, listSnapshots } from '@/lib/db/queries';
import { listCampaignSources, listConnections } from '@/lib/db/connections';
import { platformStatus, systemUserConfig } from '@/lib/connections/config';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { UploadPanel } from '@/components/data/UploadPanel';
import { RollbackList } from '@/components/data/RollbackList';
import { BenchmarkForm } from '@/components/data/BenchmarkForm';
import { NewCampaignForm } from '@/components/NewCampaignForm';
import {
  ConnectButtons, ConnectFeedback, ImportSystemUserButton, LastSyncLine, LinkedSources,
  SyncButton,
} from '@/components/data/ConnectionsPanel';
import { Card, CardHeader, SectionTitle, Badge } from '@/components/ui/primitives';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Server actions on this page inherit this. Pulling a month of ad-level daily
// rows, paging through the platform and writing them, does not fit in the
// default limit — and running out of time surfaces as an unexplained failure
// rather than a timeout.
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = {
  fb_ads: 'Meta Ads',
  conversions: 'Derma',
  media_links: 'Pautan video',
  meta_api: 'Meta API',
  google_ads: 'Google Ads',
  rollback: 'Rollback',
};

const STATUS_TONE = {
  ok: 'good',
  partial: 'warning',
  error: 'critical',
  rolled_back: 'neutral',
} as const;

export default async function DataPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { campaignId } = await params;
  const query = await searchParams;

  const loaded = await load(async () => {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return null;

    const [batches, snapshots, benchmarks, connections, sources] = await Promise.all([
      listBatches(campaignId),
      listSnapshots(campaignId),
      getBenchmarks(campaignId),
      listConnections(),
      listCampaignSources(campaignId),
    ]);
    return { batches, snapshots, benchmarks, connections, sources };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  if (!loaded.data) return null;

  const { batches, snapshots, benchmarks, connections, sources } = loaded.data;
  const statuses = [platformStatus('meta'), platformStatus('google_ads')];
  const connectOk = typeof query.connect_ok === 'string' ? query.connect_ok : undefined;
  const connectError = typeof query.connect_error === 'string' ? query.connect_error : undefined;

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Akaun iklan bersambung</SectionTitle>
        <Card>
          <CardHeader
            title="Tarik data terus, tanpa CSV"
            subtitle="Sambungan baca-sahaja. Token disulitkan sebelum disimpan, dan hanya akaun anda boleh melihatnya."
          />
          <div className="space-y-4 px-5 pb-4">
            <ConnectFeedback ok={connectOk} error={connectError} />
            <ConnectButtons campaignId={campaignId} statuses={statuses} />
            {systemUserConfig().token !== '' && (
              <ImportSystemUserButton campaignId={campaignId} />
            )}
            <LinkedSources campaignId={campaignId} sources={sources} connections={connections} />
            {sources.length > 0 ? (
              <div className="space-y-2 border-t border-line pt-3">
                <SyncButton campaignId={campaignId} />
                <LastSyncLine connections={connections} />
              </div>
            ) : null}
          </div>
        </Card>
      </section>

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
        <SectionTitle>Kempen baharu</SectionTitle>
        <Card className="max-w-md px-5 py-4">
          <NewCampaignForm />
        </Card>
      </section>
    </div>
  );
}
