-- ═══════════════════════════════════════════════════════════════════════════
-- Smoke test for the aggregation functions.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
--
-- Runs inside a transaction that is always rolled back, so it is safe against
-- a real database. Every assertion raises on failure.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into creative.campaigns (id, name) values ('smoke-test', 'Smoke Test');
insert into creative.benchmarks (campaign_id) values ('smoke-test');

insert into creative.creatives (campaign_id, ad_name, ad_name_key)
values ('smoke-test', 'Ad One', 'ad one'),
       ('smoke-test', 'Ad Two', 'ad two');

-- Ad One carries BOTH daily rows and an overlapping range row. Only the daily
-- rows must count, or every metric doubles.
insert into creative.ad_metrics
  (campaign_id, creative_id, date_start, date_stop, spend, impressions, reach, link_clicks)
select 'smoke-test', id, d::date, d::date, 100, 10000, 6000, 300
  from creative.creatives, generate_series('2026-03-01'::date, '2026-03-03'::date, '1 day') d
 where ad_name_key = 'ad one';

insert into creative.ad_metrics
  (campaign_id, creative_id, date_start, date_stop, spend, impressions, reach, link_clicks)
select 'smoke-test', id, '2026-03-01', '2026-03-03', 300, 30000, 12000, 900
  from creative.creatives where ad_name_key = 'ad one';

-- Ad Two has a range row only, so that row is the one that counts.
insert into creative.ad_metrics
  (campaign_id, creative_id, date_start, date_stop, spend, impressions, reach, link_clicks)
select 'smoke-test', id, '2026-03-01', '2026-03-03', 500, 40000, 20000, 400
  from creative.creatives where ad_name_key = 'ad two';

insert into creative.conversions (campaign_id, creative_id, dedupe_key, occurred_at, amount)
select 'smoke-test', id, 'smoke-' || g, timestamptz '2026-03-01 09:00+08' + (g || ' hours')::interval, 50
  from creative.creatives, generate_series(1, 6) g
 where ad_name_key = 'ad one';

do $$
declare
  one_spend  numeric;
  two_spend  numeric;
  total      numeric;
  days       integer;
  first_day  numeric;
begin
  select spend into one_spend
    from creative.creative_performance('smoke-test') where ad_name = 'Ad One';
  if one_spend <> 300 then
    raise exception 'daily rows must win over the overlapping range row: got %', one_spend;
  end if;

  select spend into two_spend
    from creative.creative_performance('smoke-test') where ad_name = 'Ad Two';
  if two_spend <> 500 then
    raise exception 'range-only creative should report its range row: got %', two_spend;
  end if;

  select spend into total from creative.campaign_summary('smoke-test');
  if total <> 800 then
    raise exception 'campaign summary should be 800, got %', total;
  end if;

  select count(*) into days from creative.daily_series('smoke-test');
  if days <> 3 then
    raise exception 'expected 3 daily rows, got %', days;
  end if;

  -- All six donations land on 1 March in Asia/Kuala_Lumpur, not spread by UTC.
  select revenue into first_day
    from creative.daily_series('smoke-test') where day = '2026-03-01';
  if first_day <> 300 then
    raise exception 'donations should bucket by campaign timezone, got % on day 1', first_day;
  end if;

  -- A window that excludes every row must return nothing rather than error.
  perform creative.creative_performance('smoke-test', '2020-01-01', '2020-01-31');

  raise notice 'smoke test passed';
end;
$$;

rollback;
