import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db/client';
import { requireUser } from '@/lib/auth/session';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { NewCampaignForm } from '@/components/NewCampaignForm';
import { Card, SectionTitle, Badge } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  await requireUser();

  const loaded = await load(async () => {
    const supabase = await db();
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, currency, timezone, status')
      .order('name');
    return {
      campaigns: (data ?? []) as {
        id: string;
        name: string;
        currency: string;
        timezone: string;
        status: string;
      }[],
    };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  const { campaigns } = loaded.data;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
        <ArrowLeft size={13} /> Kembali ke dashboard
      </Link>

      <h1 className="mt-4 text-lg font-semibold">Ruang kerja</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Satu ruang kerja mengumpulkan data untuk satu usaha — Rumah Padi, contohnya. Kreatif,
        metrik, derma dan sambungan akaun iklan semuanya tergantung padanya.
      </p>

      <div className="mt-4">
        <Notice tone="info" title="Ini bukan kempen Meta">
          Membuat ruang kerja di sini <strong>tidak</strong> mencipta apa-apa dalam Ads Manager, dan
          tidak menyentuh belanja anda. Satu ruang kerja boleh menarik daripada beberapa kempen Meta
          sekaligus — untuk melihatnya berasingan, buka <strong>Laporan</strong> dan pilih{' '}
          <em>Ikut kempen (Meta)</em> pada dropdown kumpulan.
          <br />
          <br />
          Kebanyakan pasukan perlukan satu sahaja. Buat yang kedua hanya apabila datanya patut kekal
          berasingan sepenuhnya — klien lain, atau tahun yang perlu diasingkan.
        </Notice>
      </div>

      <section className="mt-6">
        <SectionTitle>Ruang kerja sedia ada</SectionTitle>
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/c/${encodeURIComponent(campaign.id)}`}
                    className="text-[13px] font-medium text-ink hover:underline"
                  >
                    {campaign.name}
                  </Link>
                  {campaign.status !== 'active' && <Badge>Arkib</Badge>}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  <code>{campaign.id}</code> · {campaign.currency} · {campaign.timezone}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>Ruang kerja baharu</SectionTitle>
        <Card className="px-5 py-4">
          <NewCampaignForm />
        </Card>
      </section>
    </div>
  );
}
