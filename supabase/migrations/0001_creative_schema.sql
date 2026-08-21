-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — core schema
--
-- Everything lives in a dedicated `creative` schema so it never collides with
-- an existing `public` schema (e.g. a donor CRM in the same project).
--
-- ONE-TIME MANUAL STEP after running this migration:
--   Supabase Dashboard → Settings → API → "Exposed schemas" → add `creative`
-- PostgREST only routes to exposed schemas, service-role key included.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists creative;

grant usage on schema creative to anon, authenticated, service_role;

-- ── campaigns ──────────────────────────────────────────────────────────────
create table if not exists creative.campaigns (
  id          text primary key
              check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text        not null,
  currency    text        not null default 'MYR',
  timezone    text        not null default 'Asia/Kuala_Lumpur',
  objective   text,
  status      text        not null default 'active'
              check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── creatives (one row per ad, source-agnostic identity) ───────────────────
create table if not exists creative.creatives (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       text not null references creative.campaigns(id) on delete cascade,
  ad_name           text not null,
  ad_name_key       text not null,          -- normalised, used for matching
  adset_name        text,
  platform_campaign text,                   -- campaign name as it appears in Meta
  external_ad_id    text,                   -- Meta ad id, once the API is wired up
  media_url         text,
  media_kind        text not null default 'none'
                    check (media_kind in ('none', 'youtube', 'video', 'image')),
  thumbnail_url     text,
  notes             text,
  first_seen        date,
  last_seen         date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (campaign_id, ad_name_key)
);

create unique index if not exists creatives_external_ad_id_key
  on creative.creatives (campaign_id, external_ad_id)
  where external_ad_id is not null;

-- ── tags (hook / format / angle / offer / …) ───────────────────────────────
create table if not exists creative.tags (
  id          uuid primary key default gen_random_uuid(),
  campaign_id text references creative.campaigns(id) on delete cascade,
  dimension   text not null
              check (dimension in ('hook', 'format', 'angle', 'offer', 'persona', 'cta', 'custom')),
  label       text not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists tags_scope_key
  on creative.tags (coalesce(campaign_id, '*'), dimension, lower(label));

create table if not exists creative.creative_tags (
  creative_id uuid not null references creative.creatives(id) on delete cascade,
  tag_id      uuid not null references creative.tags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (creative_id, tag_id)
);

-- ── ingestion batches (also doubles as the upload log + rollback store) ────
create table if not exists creative.upload_batches (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     text not null references creative.campaigns(id) on delete cascade,
  kind            text not null
                  check (kind in ('fb_ads', 'conversions', 'media_links', 'meta_api', 'rollback')),
  source          text not null default 'csv'
                  check (source in ('csv', 'meta_api', 'manual')),
  filename        text,
  row_count       integer not null default 0,
  inserted_count  integer not null default 0,
  updated_count   integer not null default 0,
  skipped_count   integer not null default 0,
  status          text not null default 'ok'
                  check (status in ('ok', 'partial', 'error', 'rolled_back')),
  message         text,
  warnings        jsonb not null default '[]'::jsonb,
  -- rows as they existed *before* this batch was applied, for one-click rollback
  snapshot        jsonb,
  snapshot_rows   integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists upload_batches_campaign_created_idx
  on creative.upload_batches (campaign_id, created_at desc);

-- ── ad metrics (the source-agnostic fact table) ────────────────────────────
-- One row per creative per reporting window per source.
-- date_start = date_stop  → a daily row (enables trends)
-- date_start < date_stop  → an aggregate row for a reporting range
create table if not exists creative.ad_metrics (
  id                  bigint generated always as identity primary key,
  campaign_id         text not null references creative.campaigns(id) on delete cascade,
  creative_id         uuid not null references creative.creatives(id) on delete cascade,
  date_start          date not null,
  date_stop           date not null,
  granularity         text generated always as
                      (case when date_start = date_stop then 'day' else 'range' end) stored,
  source              text not null default 'csv'
                      check (source in ('csv', 'meta_api')),
  batch_id            uuid references creative.upload_batches(id) on delete set null,

  spend               numeric(14, 2) not null default 0,
  impressions         bigint  not null default 0,
  reach               bigint  not null default 0,
  frequency           numeric(10, 4),
  clicks_all          bigint  not null default 0,
  link_clicks         bigint  not null default 0,
  landing_page_views  bigint  not null default 0,
  video_3s_views      bigint  not null default 0,
  video_thruplays     bigint  not null default 0,
  video_p25           bigint  not null default 0,
  video_p50           bigint  not null default 0,
  video_p75           bigint  not null default 0,
  video_p100          bigint  not null default 0,
  results             bigint  not null default 0,
  platform_purchases  bigint  not null default 0,
  platform_revenue    numeric(14, 2) not null default 0,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint ad_metrics_window_valid check (date_stop >= date_start),
  unique (creative_id, date_start, date_stop, source)
);

create index if not exists ad_metrics_campaign_window_idx
  on creative.ad_metrics (campaign_id, date_start, date_stop);
create index if not exists ad_metrics_batch_idx
  on creative.ad_metrics (batch_id);

-- ── conversions (donations / purchases) ────────────────────────────────────
-- Deliberately holds NO donor PII: creative analytics never needs a name or an
-- email, and keeping them out means this schema is not a second copy of the CRM.
create table if not exists creative.conversions (
  id               bigint generated always as identity primary key,
  campaign_id      text not null references creative.campaigns(id) on delete cascade,
  creative_id      uuid references creative.creatives(id) on delete set null,
  external_id      text,                  -- receipt / transaction number, as received
  -- Stable identity for de-duplication. Falls back to a digest of the row's
  -- own content when the export carries no receipt number, so re-uploading the
  -- same file never doubles the revenue.
  dedupe_key       text not null,
  occurred_at      timestamptz not null,
  amount           numeric(14, 2) not null default 0,
  channel          text,                  -- e.g. "Facebook (new)"
  attribution_raw  text,                  -- "Campaign | Adset | Ad" as received
  matched_ad_name  text,
  match_method     text not null default 'unmatched'
                   check (match_method in ('external_id', 'exact', 'normalized', 'fuzzy', 'unmatched')),
  source           text not null default 'csv'
                   check (source in ('csv', 'meta_api', 'manual')),
  batch_id         uuid references creative.upload_batches(id) on delete set null,
  created_at       timestamptz not null default now()
);

create unique index if not exists conversions_dedupe_key
  on creative.conversions (campaign_id, source, dedupe_key);
create index if not exists conversions_campaign_time_idx
  on creative.conversions (campaign_id, occurred_at);
create index if not exists conversions_creative_idx
  on creative.conversions (creative_id);
create index if not exists conversions_batch_idx
  on creative.conversions (batch_id);

-- ── per-campaign benchmark thresholds (drive the funnel colours + diagnosis) ─
create table if not exists creative.benchmarks (
  campaign_id    text primary key references creative.campaigns(id) on delete cascade,
  hook_rate_good numeric not null default 0.20,
  hook_rate_ok   numeric not null default 0.15,
  hold_rate_good numeric not null default 0.05,
  hold_rate_ok   numeric not null default 0.03,
  ctr_good       numeric not null default 0.03,
  ctr_ok         numeric not null default 0.02,
  lpv_rate_good  numeric not null default 0.60,
  lpv_rate_ok    numeric not null default 0.40,
  cvr_good       numeric not null default 0.10,
  cvr_ok         numeric not null default 0.05,
  roas_good      numeric not null default 1.00,
  roas_ok        numeric not null default 0.50,
  min_spend      numeric not null default 50,   -- below this a creative is "Belum cukup data"
  updated_at     timestamptz not null default now()
);

-- ── row level security: locked shut. All access is server-side service-role. ─
alter table creative.campaigns      enable row level security;
alter table creative.creatives      enable row level security;
alter table creative.tags           enable row level security;
alter table creative.creative_tags  enable row level security;
alter table creative.upload_batches enable row level security;
alter table creative.ad_metrics     enable row level security;
alter table creative.conversions    enable row level security;
alter table creative.benchmarks     enable row level security;

-- No policies are created on purpose: anon and authenticated get nothing.
-- service_role bypasses RLS, and only the Next.js server holds that key.
grant select, insert, update, delete on all tables in schema creative to service_role;
grant usage, select on all sequences in schema creative to service_role;

alter default privileges in schema creative
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema creative
  grant usage, select on sequences to service_role;
