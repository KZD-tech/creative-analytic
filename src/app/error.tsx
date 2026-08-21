'use client';

import { useEffect } from 'react';

/**
 * React withholds server-side error messages from the browser in production
 * and substitutes a numbered placeholder, so repeating that number back at the
 * reader is a dead end. What actually helps is naming where the real message
 * lives and giving them the digest to search for.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const hidden = /Minified React error|omitted in production/i.test(error.message);

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-lg">
        <h1 className="text-base font-semibold">Ada sesuatu yang tidak kena</h1>

        {hidden ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              Ralat ini berlaku di pelayan, dan React menyembunyikan mesejnya daripada pelayar demi
              keselamatan. Mesej sebenar ada dalam log pelayan — terminal tempat anda menjalankan{' '}
              <code className="rounded bg-surface-2 px-1">npm run start</code>, atau tab{' '}
              <strong>Logs</strong> pada Vercel.
            </p>
            {error.digest ? (
              <p className="mt-2 text-[12px] text-ink-muted">
                Cari digest ini dalam log:{' '}
                <code className="rounded bg-surface-2 px-1 font-semibold">{error.digest}</code>
              </p>
            ) : null}
            <p className="mt-2 text-[12px] text-ink-muted">
              Punca paling biasa: satu environment variable belum diisi. Semak{' '}
              <code className="rounded bg-surface-2 px-1">SUPABASE_URL</code>,{' '}
              <code className="rounded bg-surface-2 px-1">SUPABASE_ANON_KEY</code> dan{' '}
              <code className="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code>.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{error.message}</p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-page hover:opacity-90"
        >
          Cuba lagi
        </button>
      </div>
    </div>
  );
}
