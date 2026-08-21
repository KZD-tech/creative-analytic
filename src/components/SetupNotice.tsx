import { Notice } from '@/components/ui/Notice';
import { Card } from '@/components/ui/primitives';

export function SetupNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const missingEnv = message.includes('Env yang tiada');
  const schemaClosed = message.includes('Exposed schemas');
  // The error carries the schema it actually tried, which is the one the
  // reader has to act on — not whatever the docs happen to name.
  const schema = /Skema "([^"]+)"/.exec(message)?.[1] ?? 'public';

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
            Isi <code className="rounded bg-surface-2 px-1">SUPABASE_URL</code>,{' '}
            <code className="rounded bg-surface-2 px-1">SUPABASE_ANON_KEY</code> dan{' '}
            <code className="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> dalam{' '}
            <code className="rounded bg-surface-2 px-1">.env.local</code> (atau Environment
            Variables di Vercel).
          </li>
          <li>
            <span className="mr-1.5 font-semibold">2.</span>
            Jalankan ketiga-tiga fail dalam{' '}
            <code className="rounded bg-surface-2 px-1">supabase/migrations/</code> mengikut
            turutan, melalui SQL Editor Supabase.
          </li>
          {schemaClosed ? (
            <li className="font-medium text-ink">
              <span className="mr-1.5 font-semibold">3.</span>
              {schema === 'public' ? (
                <>
                  Schema <code className="rounded bg-surface-2 px-1">public</code> sepatutnya
                  terdedah secara lalai. Semak Supabase Dashboard → Settings → API →{' '}
                  <strong>Exposed schemas</strong> dan pastikan{' '}
                  <code className="rounded bg-surface-2 px-1">public</code> ada dalam senarai.
                </>
              ) : (
                <>
                  <code className="rounded bg-surface-2 px-1">SUPABASE_SCHEMA</code> ditetapkan
                  kepada <code className="rounded bg-surface-2 px-1">{schema}</code>. Sama ada
                  buang pemboleh ubah itu (jadual berada dalam{' '}
                  <code className="rounded bg-surface-2 px-1">public</code>), atau tambah{' '}
                  <code className="rounded bg-surface-2 px-1">{schema}</code> di Supabase
                  Dashboard → Settings → API → <strong>Exposed schemas</strong>.
                </>
              )}
            </li>
          ) : null}
        </ol>
      </Card>

      <p className="mt-4 text-[12px] text-ink-muted">
        Butiran penuh ada dalam <code className="rounded bg-surface-2 px-1">README.md</code>.
      </p>
    </div>
  );
}
