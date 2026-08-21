-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — connected ad accounts
--
-- Replaces the CSV round trip with a direct pull from Meta and Google Ads.
-- A connection belongs to one user and holds their OAuth tokens; a campaign
-- points at a connection to say "these numbers come from there".
--
-- Tokens are stored already encrypted by the application (AES-256-GCM, key in
-- the environment). The database never sees plaintext, so a table dump does
-- not hand over anybody's ad account.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ad_connections (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  platform            text not null check (platform in ('meta', 'google_ads')),

  -- The advertiser account as the platform names it: act_1234… for Meta, a
  -- ten-digit customer id for Google Ads.
  external_account_id text not null,
  account_name        text,
  currency            text,
  timezone            text,
  -- Google Ads calls through a manager account need the MCC id alongside.
  login_customer_id   text,

  access_token        text not null,
  refresh_token       text,
  expires_at          timestamptz,

  status              text not null default 'active'
                      check (status in ('active', 'needs_reauth', 'disabled')),
  last_sync_at        timestamptz,
  last_sync_error     text,
  last_sync_rows      integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (owner_id, platform, external_account_id)
);

create index if not exists ad_connections_owner_idx on public.ad_connections (owner_id);

-- ── which campaign pulls from which connection ─────────────────────────────
-- An ad account usually holds more platform campaigns than the one being
-- analysed here, so a source can narrow to specific platform campaign ids.
-- Empty means "everything in the account".
create table if not exists public.campaign_sources (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          text not null references public.campaigns(id) on delete cascade,
  connection_id        uuid not null references public.ad_connections(id) on delete cascade,
  platform_campaign_ids text[] not null default '{}',
  created_at           timestamptz not null default now(),
  unique (campaign_id, connection_id)
);

create index if not exists campaign_sources_campaign_idx
  on public.campaign_sources (campaign_id);

-- ── the fact tables learn about the new source ─────────────────────────────
alter table public.ad_metrics    drop constraint if exists ad_metrics_source_check;
alter table public.ad_metrics    add  constraint ad_metrics_source_check
  check (source in ('csv', 'meta_api', 'google_ads'));

alter table public.conversions   drop constraint if exists conversions_source_check;
alter table public.conversions   add  constraint conversions_source_check
  check (source in ('csv', 'meta_api', 'google_ads', 'manual'));

alter table public.upload_batches drop constraint if exists upload_batches_kind_check;
alter table public.upload_batches add  constraint upload_batches_kind_check
  check (kind in ('fb_ads', 'conversions', 'media_links', 'meta_api', 'google_ads', 'rollback'));

alter table public.upload_batches drop constraint if exists upload_batches_source_check;
alter table public.upload_batches add  constraint upload_batches_source_check
  check (source in ('csv', 'meta_api', 'google_ads', 'manual'));

-- ── row level security ─────────────────────────────────────────────────────
alter table public.ad_connections   enable row level security;
alter table public.campaign_sources enable row level security;

-- A connection carries a credential to somebody's ad spend. It is visible to
-- exactly one account and nobody else, including other members.
drop policy if exists ad_connections_owner_all on public.ad_connections;
create policy ad_connections_owner_all on public.ad_connections
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists campaign_sources_owner_all on public.campaign_sources;
create policy campaign_sources_owner_all on public.campaign_sources
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (
    public.owns_campaign(campaign_id)
    -- and you cannot point your campaign at somebody else's connection
    and exists (
      select 1 from public.ad_connections c
       where c.id = campaign_sources.connection_id
         and c.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete
  on public.ad_connections, public.campaign_sources to authenticated;

revoke all on public.ad_connections, public.campaign_sources from anon;
