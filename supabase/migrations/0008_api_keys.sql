-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — machine access
--
-- An agent has no browser session, so it cannot use the cookie-based login the
-- dashboard uses. It gets a key instead: issued to one account, optionally
-- pinned to one campaign, and revocable without disturbing anyone else.
--
-- Only the hash is stored. A key that cannot be read back out of the database
-- cannot be leaked by a table dump, and losing it means issuing a new one
-- rather than looking the old one up.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,

  -- sha256 of the presented key. Unique so a lookup is a single index hit
  -- rather than a scan comparing every row.
  key_hash     text not null unique,
  -- The first few characters, kept in clear so a key can be recognised in a
  -- list without revealing anything usable.
  prefix       text not null,

  -- Null means every campaign this account owns.
  campaign_id  text references public.campaigns(id) on delete cascade,

  scopes       text[] not null default '{read,write}',

  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists api_keys_owner_idx on public.api_keys (owner_id);
create index if not exists api_keys_active_idx on public.api_keys (key_hash)
  where revoked_at is null;

-- ── the API is a source in its own right ───────────────────────────────────
-- Sharing 'csv' would put agent-written donations inside the snapshot a CSV
-- upload takes, so rolling back a spreadsheet would silently delete them.
alter table public.conversions drop constraint if exists conversions_source_check;
alter table public.conversions add  constraint conversions_source_check
  check (source in ('csv', 'meta_api', 'google_ads', 'manual', 'api'));

alter table public.upload_batches drop constraint if exists upload_batches_source_check;
alter table public.upload_batches add  constraint upload_batches_source_check
  check (source in ('csv', 'meta_api', 'google_ads', 'manual', 'api'));

alter table public.upload_batches drop constraint if exists upload_batches_kind_check;
alter table public.upload_batches add  constraint upload_batches_kind_check
  check (kind in ('fb_ads', 'conversions', 'media_links', 'meta_api', 'google_ads', 'rollback'));

-- ── row level security ─────────────────────────────────────────────────────
alter table public.api_keys enable row level security;

-- A key belongs to one account and is visible to nobody else. The hash is
-- included: there is no reason for one member to read another's, even hashed.
drop policy if exists api_keys_owner_all on public.api_keys;
create policy api_keys_owner_all on public.api_keys
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.api_keys to authenticated;

-- The API routes run as the service role: a machine caller has no session for
-- RLS to work from, so the key itself has to be looked up before there is any
-- identity at all. Without this grant every key reads as invalid.
grant select, insert, update, delete on public.api_keys to service_role;

revoke all on public.api_keys from anon;
