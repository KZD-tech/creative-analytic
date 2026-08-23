import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db/client';
import { requireUser } from '@/lib/auth/session';
import { load } from '@/lib/db/safe';
import { listApiKeys } from '@/lib/db/apiKeys';
import { SetupNotice } from '@/components/SetupNotice';
import { Card, CardHeader, SectionTitle } from '@/components/ui/primitives';
import { CreateKeyForm, KeyList } from './ApiKeyPanel';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requireUser();

  const loaded = await load(async () => {
    const supabase = await db();
    const [keys, { data: campaigns }] = await Promise.all([
      listApiKeys(),
      supabase.from('campaigns').select('id, name').order('name'),
    ]);
    return { keys, campaigns: (campaigns ?? []) as { id: string; name: string }[] };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  const { keys, campaigns } = loaded.data;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
        <ArrowLeft size={13} /> Kembali ke dashboard
      </Link>

      <h1 className="mt-4 text-lg font-semibold">Kunci API</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Untuk ejen dan skrip yang menghantar data ke dashboard ini — contohnya menarik derma dari
        Onpay, memadankannya dengan iklan, dan menghantarnya masuk. Kunci mewakili akaun anda, jadi
        ia hanya nampak kempen yang anda miliki.
      </p>

      <section className="mt-6">
        <SectionTitle>Kunci baharu</SectionTitle>
        <Card className="px-5 py-4">
          <CreateKeyForm campaigns={campaigns} />
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Kunci sedia ada</SectionTitle>
        <KeyList keys={keys} />
      </section>

      <section className="mt-8">
        <SectionTitle>Cara menggunakannya</SectionTitle>
        <Card className="px-5 py-4">
          <CardHeader
            title="Tiga endpoint"
            subtitle="Semua memerlukan header Authorization: Bearer <kunci>."
          />
          <div className="mt-3 space-y-3 text-[12.5px] text-ink-2">
            <p>
              <code className="rounded bg-surface-2 px-1.5 py-0.5">GET /api/v1/campaigns</code>
              {' — '}kempen yang kunci ini boleh capai.
            </p>
            <p>
              <code className="rounded bg-surface-2 px-1.5 py-0.5">GET /api/v1/creatives?campaign=…</code>
              {' — '}senarai iklan untuk dipadankan. Guna <code>ad_name_key</code>; itulah bentuk
              ternormal yang dashboard sendiri padankan, jadi ejen anda tidak perlu meneka
              peraturannya.
            </p>
            <p>
              <code className="rounded bg-surface-2 px-1.5 py-0.5">POST /api/v1/conversions</code>
              {' — '}hantar derma yang sudah dipadankan. Sertakan <code>external_id</code> supaya
              menghantar semula tidak menggandakan apa-apa.
            </p>
            <p className="text-ink-3">
              Butiran penuh dan contoh ada dalam <code>docs/api.md</code>.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
