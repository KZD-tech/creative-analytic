-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — accounts, invitations and per-owner visibility
--
-- Before this migration every request ran as service_role and the database
-- trusted the application to scope queries. From here the app connects as the
-- signed-in user and the database itself enforces who sees what, so a missing
-- `.eq('owner_id', …)` in application code can no longer leak a campaign.
--
-- Sign-up is invite-only: a trigger refuses any new auth user whose email is
-- not on the invite list.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ───────────────────────────────────────────────────────────────
-- One row per auth user. `role` gates who may invite others; it deliberately
-- does not gate data, which is owned per campaign.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'member'
              check (role in ('admin', 'member')),
  created_at  timestamptz not null default now()
);

-- ── invitations ────────────────────────────────────────────────────────────
create table if not exists public.invites (
  email        text primary key,
  role         text not null default 'member'
               check (role in ('admin', 'member')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

create index if not exists invites_pending_idx on public.invites (created_at desc)
  where accepted_at is null;

-- ── campaign ownership ─────────────────────────────────────────────────────
alter table public.campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists campaigns_owner_idx on public.campaigns (owner_id);

-- ── who is allowed in ──────────────────────────────────────────────────────
-- Runs as the definer so it can read `invites` while the new user has no
-- session yet. It is attached to auth.users, which only Supabase Auth writes to.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
  is_first_user boolean;
begin
  select count(*) = 0 into is_first_user from public.profiles;

  select * into invite from public.invites
   where lower(email) = lower(new.email);

  -- The very first account bootstraps the instance and becomes admin; after
  -- that an invitation is required, whichever sign-in method was used.
  if not is_first_user and invite.email is null then
    raise exception 'Emel ini tiada jemputan. Minta admin menjemput % dahulu.', new.email
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first_user then 'admin' else coalesce(invite.role, 'member') end
  )
  on conflict (id) do nothing;

  if invite.email is not null then
    update public.invites set accepted_at = now() where email = invite.email;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── helpers used by the policies ───────────────────────────────────────────
-- Wrapped in a function so each policy stays readable, and marked stable so
-- Postgres evaluates it once per statement rather than once per row.
create or replace function public.owns_campaign(p_campaign_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.campaigns c
     where c.id = p_campaign_id
       and c.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- ── row level security ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.invites  enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Role escalation is blocked by the column grant below, which lets a user
-- write `full_name` and nothing else — so this policy only has to answer
-- "is this your own row".
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists invites_admin_all on public.invites;
create policy invites_admin_all on public.invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- campaigns: the root of every ownership check
drop policy if exists campaigns_owner_all on public.campaigns;
create policy campaigns_owner_all on public.campaigns
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- everything else reaches ownership through campaign_id
drop policy if exists creatives_owner_all on public.creatives;
create policy creatives_owner_all on public.creatives
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

drop policy if exists ad_metrics_owner_all on public.ad_metrics;
create policy ad_metrics_owner_all on public.ad_metrics
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

drop policy if exists conversions_owner_all on public.conversions;
create policy conversions_owner_all on public.conversions
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

drop policy if exists upload_batches_owner_all on public.upload_batches;
create policy upload_batches_owner_all on public.upload_batches
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

drop policy if exists benchmarks_owner_all on public.benchmarks;
create policy benchmarks_owner_all on public.benchmarks
  for all to authenticated
  using (public.owns_campaign(campaign_id))
  with check (public.owns_campaign(campaign_id));

-- tags may be campaign-scoped or global (campaign_id is null)
drop policy if exists tags_owner_all on public.tags;
create policy tags_owner_all on public.tags
  for all to authenticated
  using (campaign_id is null or public.owns_campaign(campaign_id))
  with check (campaign_id is null or public.owns_campaign(campaign_id));

-- creative_tags has no campaign_id of its own; it inherits through the creative
drop policy if exists creative_tags_owner_all on public.creative_tags;
create policy creative_tags_owner_all on public.creative_tags
  for all to authenticated
  using (exists (
    select 1 from public.creatives cr
     where cr.id = creative_tags.creative_id
       and public.owns_campaign(cr.campaign_id)
  ))
  with check (exists (
    select 1 from public.creatives cr
     where cr.id = creative_tags.creative_id
       and public.owns_campaign(cr.campaign_id)
  ));

-- ── grants ─────────────────────────────────────────────────────────────────
-- `authenticated` now needs table access; RLS above decides which rows. `anon`
-- is granted nothing, so a signed-out visitor still reaches no data at all.
grant select, insert, update, delete on
  public.campaigns, public.creatives, public.tags, public.creative_tags,
  public.upload_batches, public.ad_metrics, public.conversions, public.benchmarks
  to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.invites to authenticated;

grant usage, select on
  public.ad_metrics_id_seq, public.conversions_id_seq
  to authenticated;

grant select, insert, update, delete on public.profiles, public.invites to service_role;

grant execute on function public.owns_campaign(text) to authenticated;
grant execute on function public.is_admin()          to authenticated;

-- Signed-out visitors keep nothing. Supabase grants `anon` table access by
-- default on new projects; RLS already stops it, but a revoked grant means the
-- request never reaches a policy in the first place.
revoke all on
  public.campaigns, public.creatives, public.tags, public.creative_tags,
  public.upload_batches, public.ad_metrics, public.conversions,
  public.benchmarks, public.profiles, public.invites
  from anon;

grant execute on function public.scoped_metrics(text, date, date)         to authenticated;
grant execute on function public.creative_performance(text, date, date)   to authenticated;
grant execute on function public.daily_series(text, date, date)           to authenticated;
grant execute on function public.creative_daily_series(uuid, date, date)  to authenticated;
grant execute on function public.campaign_summary(text, date, date)       to authenticated;

-- Campaigns that predate this migration have no owner and are therefore
-- invisible to everyone. That is the safe direction: claim them deliberately
-- with `update public.campaigns set owner_id = '<uuid>' where owner_id is null`.
