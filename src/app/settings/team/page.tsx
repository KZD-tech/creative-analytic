import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/session';
import { load } from '@/lib/db/safe';
import { SetupNotice } from '@/components/SetupNotice';
import { Card, CardHeader, SectionTitle } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/Notice';
import { InviteForm, InviteList, type InviteRow } from './TeamPanel';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  await requireAdmin();

  const loaded = await load(async () => {
    const supabase = await db();
    const [{ data: invites }, { data: members }] = await Promise.all([
      supabase.from('invites').select('email, role, created_at, accepted_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name, role, created_at'),
    ]);
    return {
      invites: (invites ?? []) as InviteRow[],
      members: (members ?? []) as { id: string; email: string; full_name: string | null; role: string }[],
    };
  });

  if (!loaded.ok) return <SetupNotice error={loaded.error} />;
  const { invites, members } = loaded.data;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink">
        <ArrowLeft size={13} /> Kembali ke dashboard
      </Link>

      <h1 className="mt-4 text-lg font-semibold">Pasukan</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Pendaftaran adalah melalui jemputan sahaja. Emel yang tiada dalam senarai ini tidak boleh
        membuat akaun, sama ada melalui kata laluan atau Google.
      </p>

      <section className="mt-6">
        <SectionTitle>Jemput pengguna</SectionTitle>
        <Card className="px-5 py-4">
          <InviteForm />
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Jemputan</SectionTitle>
        <Card className="px-5 py-4">
          <InviteList invites={invites} />
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Ahli</SectionTitle>
        <Card>
          <CardHeader
            title={`${members.length} akaun aktif`}
            subtitle="Setiap ahli hanya nampak kempen yang mereka sendiri cipta."
          />
          <ul className="divide-y divide-[color:var(--border)] px-5 pb-4">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                <span className="min-w-0 truncate">{member.full_name || member.email}</span>
                <span className="text-[11px] text-ink-muted">
                  {member.role === 'admin' ? 'Admin' : 'Ahli'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Notice tone="info" className="mt-6" title="Menambah pengguna terus dari Supabase">
        Kalau anda cipta pengguna melalui Supabase Dashboard → Authentication, tambah emel itu di
        sini dahulu. Pencetus pangkalan data akan menolak mana-mana akaun yang tiada jemputan,
        termasuk yang dicipta oleh admin.
      </Notice>
    </div>
  );
}
