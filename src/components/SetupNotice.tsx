import { Notice } from '@/components/ui/Notice';
import { Card } from '@/components/ui/primitives';

export function SetupNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const missingEnv = message.includes('Env yang tiada');
  const schemaClosed = message.includes('Exposed schemas');

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-lg font-semibold">Persediaan belum lengkap</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Dashboard tidak dapat bercakap dengan Supabase. Selesaikan langkah di bawah, kemudian muat
        semula halaman ini.
      </p>

      <Notice tone="error" title="Mesej ralat" className="mt-5">
        {message}
      </Notice>

      <Card className="mt-5 px-5 py-4">
        <h2 className="text-sm font-semibold">Senarai semak</h2>
        <ol className="mt-3 space-y-3 text-[13px] text-ink-2">
          <li className={missingEnv ? 'font-medium text-ink' : undefined}>
            <span className="mr-1.5 font-semibold">1.</span>
            Isi <code className="rounded bg-surface-2 px-1">SUPABASE_URL</code> dan{' '}
            <code className="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> dalam{' '}
            <code className="rounded bg-surface-2 px-1">.env.local</code> (atau Environment
            Variables di Vercel).
          </li>
          <li>
            <span className="mr-1.5 font-semibold">2.</span>
            Jalankan kedua-dua fail dalam{' '}
            <code className="rounded bg-surface-2 px-1">supabase/migrations/</code> melalui SQL
            Editor Supabase.
          </li>
          <li className={schemaClosed ? 'font-medium text-ink' : undefined}>
            <span className="mr-1.5 font-semibold">3.</span>
            Supabase Dashboard → Settings → API → <strong>Exposed schemas</strong> → tambah{' '}
            <code className="rounded bg-surface-2 px-1">creative</code>. Tanpa langkah ini
            PostgREST tidak akan hantar sebarang data, walaupun dengan service-role key.
          </li>
        </ol>
      </Card>

      <p className="mt-4 text-[12px] text-ink-muted">
        Butiran penuh ada dalam <code className="rounded bg-surface-2 px-1">README.md</code>.
      </p>
    </div>
  );
}
