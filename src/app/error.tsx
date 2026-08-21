'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md">
        <h1 className="text-base font-semibold">Ada sesuatu yang tidak kena</h1>
        <p className="mt-1 text-[13px] text-ink-2">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-page hover:opacity-90"
        >
          Cuba lagi
        </button>
      </div>
    </div>
  );
}
