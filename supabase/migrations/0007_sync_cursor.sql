-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — remember how far a connection has been pulled
--
-- Every sync re-pulled the same thirty days, so the work grew with the window
-- rather than with what had actually changed, and a first pull large enough to
-- exceed the request budget could never finish — each attempt started over.
--
-- With the covered range recorded, a sync does the small recent overlap first
-- and then walks backwards one chunk at a time. An interrupted backfill resumes
-- where it stopped instead of restarting.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ad_connections
  add column if not exists synced_from    date,
  add column if not exists synced_through date;

comment on column public.ad_connections.synced_from is
  'Earliest day pulled so far. Null means nothing has been pulled yet.';
comment on column public.ad_connections.synced_through is
  'Latest day pulled so far.';
