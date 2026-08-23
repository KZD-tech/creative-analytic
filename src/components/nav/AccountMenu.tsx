'use client';

import Link from 'next/link';
import { KeyRound, LogOut, Users } from 'lucide-react';
import { signOutAction } from '@/app/login/actions';
import type { SessionUser } from '@/lib/auth/session';

export function AccountMenu({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-1 border-t border-line pt-3">
      <div className="px-1 pb-1">
        <div className="truncate text-[12px] font-medium text-ink" title={user.email}>
          {user.fullName || user.email}
        </div>
        <div className="truncate text-[10px] text-ink-muted">
          {user.fullName ? user.email : user.role === 'admin' ? 'Admin' : 'Ahli'}
        </div>
      </div>

      {user.role === 'admin' ? (
        <Link
          href="/settings/team"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Users size={13} /> Pasukan
        </Link>
      ) : null}

      <Link
        href="/settings/api"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <KeyRound size={13} /> Kunci API
      </Link>

      <form action={signOutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <LogOut size={13} /> Log keluar
        </button>
      </form>
    </div>
  );
}
