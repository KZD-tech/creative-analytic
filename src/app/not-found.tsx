import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <h1 className="text-base font-semibold">Halaman tidak dijumpai</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Kempen atau kreatif ini mungkin sudah dipadam.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-page hover:opacity-90"
        >
          Kembali ke dashboard
        </Link>
      </div>
    </div>
  );
}
