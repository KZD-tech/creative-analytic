-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — aggregation functions
--
-- Aggregation runs in Postgres, not in Node: a campaign can carry tens of
-- thousands of conversion rows and we never want those crossing the wire.
-- Derived *rates* (hook, CTR, CVR, ROAS…) are computed in TypeScript, where
-- they are cheap to change and easy to unit-test.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── helper: pick one granularity per creative ──────────────────────────────
-- If a creative has daily rows in the window we use only those; otherwise we
-- fall back to its range rows. Without this, uploading a daily-breakdown export
-- on top of a summary export would double-count every metric.
create or replace function creative.scoped_metrics(
  p_campaign_id text,
  p_from        date default null,
  p_to          date default null
)
returns setof creative.ad_metrics
language sql
stable
set search_path = ''
as $$
  with scoped as (
    select m.*
      from creative.ad_metrics m
     where m.campaign_id = p_campaign_id
       and (p_from is null or m.date_stop  >= p_from)
       and (p_to   is null or m.date_start <= p_to)
  ),
  pref as (
    select creative_id, bool_or(granularity = 'day') as has_day
      from scoped
     group by creative_id
  )
  select s.*
    from scoped s
    join pref p on p.creative_id = s.creative_id
   where (p.has_day and s.granularity = 'day')
      or (not p.has_day);
$$;

-- ── per-creative totals for a window ───────────────────────────────────────
create or replace function creative.creative_performance(
  p_campaign_id text,
  p_from        date default null,
  p_to          date default null
)
returns table (
  creative_id        uuid,
  ad_name            text,
  adset_name         text,
  platform_campaign  text,
  media_url          text,
  media_kind         text,
  thumbnail_url      text,
  external_ad_id     text,
  first_seen         date,
  last_seen          date,
  spend              numeric,
  impressions        bigint,
  reach              bigint,
  frequency          numeric,
  clicks_all         bigint,
  link_clicks        bigint,
  landing_page_views bigint,
  video_3s_views     bigint,
  video_thruplays    bigint,
  video_p25          bigint,
  video_p50          bigint,
  video_p75          bigint,
  video_p100         bigint,
  results            bigint,
  platform_revenue   numeric,
  conversions        bigint,
  revenue            numeric,
  active_days        integer
)
language sql
stable
set search_path = ''
as $$
  with m as (
    select s.creative_id,
           sum(s.spend)              as spend,
           sum(s.impressions)        as impressions,
           max(s.reach)              as reach,
           avg(s.frequency)          as avg_frequency,
           sum(s.clicks_all)         as clicks_all,
           sum(s.link_clicks)        as link_clicks,
           sum(s.landing_page_views) as landing_page_views,
           sum(s.video_3s_views)     as video_3s_views,
           sum(s.video_thruplays)    as video_thruplays,
           sum(s.video_p25)          as video_p25,
           sum(s.video_p50)          as video_p50,
           sum(s.video_p75)          as video_p75,
           sum(s.video_p100)         as video_p100,
           sum(s.results)            as results,
           sum(s.platform_revenue)   as platform_revenue,
           count(*) filter (where s.granularity = 'day' and s.impressions > 0) as active_days
      from creative.scoped_metrics(p_campaign_id, p_from, p_to) s
     group by s.creative_id
  ),
  c as (
    select v.creative_id,
           count(*)                    as conversions,
           coalesce(sum(v.amount), 0)  as revenue
      from creative.conversions v
     where v.campaign_id = p_campaign_id
       and v.creative_id is not null
       and (p_from is null or v.occurred_at >= p_from::timestamptz)
       and (p_to   is null or v.occurred_at <  (p_to + 1)::timestamptz)
     group by v.creative_id
  )
  select cr.id,
         cr.ad_name,
         cr.adset_name,
         cr.platform_campaign,
         cr.media_url,
         cr.media_kind,
         cr.thumbnail_url,
         cr.external_ad_id,
         cr.first_seen,
         cr.last_seen,
         coalesce(m.spend, 0)::numeric,
         coalesce(m.impressions, 0)::bigint,
         coalesce(m.reach, 0)::bigint,
         -- Reach is not additive across days, so frequency is an estimate:
         -- impressions / best-known reach, else the mean of reported values.
         case
           when coalesce(m.reach, 0) > 0 then (m.impressions::numeric / m.reach)
           else m.avg_frequency
         end::numeric,
         coalesce(m.clicks_all, 0)::bigint,
         coalesce(m.link_clicks, 0)::bigint,
         coalesce(m.landing_page_views, 0)::bigint,
         coalesce(m.video_3s_views, 0)::bigint,
         coalesce(m.video_thruplays, 0)::bigint,
         coalesce(m.video_p25, 0)::bigint,
         coalesce(m.video_p50, 0)::bigint,
         coalesce(m.video_p75, 0)::bigint,
         coalesce(m.video_p100, 0)::bigint,
         coalesce(m.results, 0)::bigint,
         coalesce(m.platform_revenue, 0)::numeric,
         coalesce(c.conversions, 0)::bigint,
         coalesce(c.revenue, 0)::numeric,
         coalesce(m.active_days, 0)::integer
    from creative.creatives cr
    left join m on m.creative_id = cr.id
    left join c on c.creative_id = cr.id
   where cr.campaign_id = p_campaign_id
     and (m.creative_id is not null or c.creative_id is not null);
$$;

-- ── daily time series for the whole campaign ───────────────────────────────
-- Spend-side numbers only exist for days that were uploaded with a daily
-- breakdown; conversion-side numbers always do, because donations carry a
-- timestamp. Both are returned so the UI can say which half it is missing.
create or replace function creative.daily_series(
  p_campaign_id text,
  p_from        date default null,
  p_to          date default null
)
returns table (
  day                date,
  spend              numeric,
  impressions        bigint,
  link_clicks        bigint,
  landing_page_views bigint,
  video_3s_views     bigint,
  reach              bigint,
  conversions        bigint,
  revenue            numeric
)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce(c.timezone, 'Asia/Kuala_Lumpur') as name
      from creative.campaigns c
     where c.id = p_campaign_id
  ),
  ads as (
    select s.date_start as day,
           sum(s.spend)              as spend,
           sum(s.impressions)        as impressions,
           sum(s.link_clicks)        as link_clicks,
           sum(s.landing_page_views) as landing_page_views,
           sum(s.video_3s_views)     as video_3s_views,
           sum(s.reach)              as reach
      from creative.scoped_metrics(p_campaign_id, p_from, p_to) s
     where s.granularity = 'day'
     group by s.date_start
  ),
  conv as (
    select (v.occurred_at at time zone (select name from tz))::date as day,
           count(*)                   as conversions,
           coalesce(sum(v.amount), 0) as revenue
      from creative.conversions v
     where v.campaign_id = p_campaign_id
       and (p_from is null or v.occurred_at >= p_from::timestamptz)
       and (p_to   is null or v.occurred_at <  (p_to + 1)::timestamptz)
     group by 1
  )
  select coalesce(a.day, c.day)              as day,
         coalesce(a.spend, 0)::numeric,
         coalesce(a.impressions, 0)::bigint,
         coalesce(a.link_clicks, 0)::bigint,
         coalesce(a.landing_page_views, 0)::bigint,
         coalesce(a.video_3s_views, 0)::bigint,
         coalesce(a.reach, 0)::bigint,
         coalesce(c.conversions, 0)::bigint,
         coalesce(c.revenue, 0)::numeric
    from ads a
    full outer join conv c on c.day = a.day
   order by 1;
$$;

-- ── daily series for a single creative (detail page + fatigue curve) ───────
create or replace function creative.creative_daily_series(
  p_creative_id uuid,
  p_from        date default null,
  p_to          date default null
)
returns table (
  day                date,
  spend              numeric,
  impressions        bigint,
  reach              bigint,
  frequency          numeric,
  clicks_all         bigint,
  link_clicks        bigint,
  landing_page_views bigint,
  video_3s_views     bigint,
  video_thruplays    bigint,
  conversions        bigint,
  revenue            numeric
)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce(c.timezone, 'Asia/Kuala_Lumpur') as name
      from creative.creatives cr
      join creative.campaigns c on c.id = cr.campaign_id
     where cr.id = p_creative_id
  ),
  ads as (
    select m.date_start as day,
           sum(m.spend)              as spend,
           sum(m.impressions)        as impressions,
           sum(m.reach)              as reach,
           avg(m.frequency)          as frequency,
           sum(m.clicks_all)         as clicks_all,
           sum(m.link_clicks)        as link_clicks,
           sum(m.landing_page_views) as landing_page_views,
           sum(m.video_3s_views)     as video_3s_views,
           sum(m.video_thruplays)    as video_thruplays
      from creative.ad_metrics m
     where m.creative_id = p_creative_id
       and m.granularity = 'day'
       and (p_from is null or m.date_start >= p_from)
       and (p_to   is null or m.date_start <= p_to)
     group by m.date_start
  ),
  conv as (
    select (v.occurred_at at time zone (select name from tz))::date as day,
           count(*)                   as conversions,
           coalesce(sum(v.amount), 0) as revenue
      from creative.conversions v
     where v.creative_id = p_creative_id
       and (p_from is null or v.occurred_at >= p_from::timestamptz)
       and (p_to   is null or v.occurred_at <  (p_to + 1)::timestamptz)
     group by 1
  )
  select coalesce(a.day, c.day) as day,
         coalesce(a.spend, 0)::numeric,
         coalesce(a.impressions, 0)::bigint,
         coalesce(a.reach, 0)::bigint,
         a.frequency::numeric,
         coalesce(a.clicks_all, 0)::bigint,
         coalesce(a.link_clicks, 0)::bigint,
         coalesce(a.landing_page_views, 0)::bigint,
         coalesce(a.video_3s_views, 0)::bigint,
         coalesce(a.video_thruplays, 0)::bigint,
         coalesce(c.conversions, 0)::bigint,
         coalesce(c.revenue, 0)::numeric
    from ads a
    full outer join conv c on c.day = a.day
   order by 1;
$$;

-- ── campaign-level roll-up (KPI row), one round trip ───────────────────────
create or replace function creative.campaign_summary(
  p_campaign_id text,
  p_from        date default null,
  p_to          date default null
)
returns table (
  spend              numeric,
  impressions        bigint,
  link_clicks        bigint,
  landing_page_views bigint,
  video_3s_views     bigint,
  results            bigint,
  conversions        bigint,
  revenue            numeric,
  creative_count     integer,
  first_day          date,
  last_day           date
)
language sql
stable
set search_path = ''
as $$
  with m as (
    select coalesce(sum(s.spend), 0)              as spend,
           coalesce(sum(s.impressions), 0)        as impressions,
           coalesce(sum(s.link_clicks), 0)        as link_clicks,
           coalesce(sum(s.landing_page_views), 0) as landing_page_views,
           coalesce(sum(s.video_3s_views), 0)     as video_3s_views,
           coalesce(sum(s.results), 0)            as results,
           count(distinct s.creative_id)          as creative_count,
           min(s.date_start)                      as first_day,
           max(s.date_stop)                       as last_day
      from creative.scoped_metrics(p_campaign_id, p_from, p_to) s
  ),
  c as (
    select count(*) as conversions, coalesce(sum(v.amount), 0) as revenue
      from creative.conversions v
     where v.campaign_id = p_campaign_id
       and (p_from is null or v.occurred_at >= p_from::timestamptz)
       and (p_to   is null or v.occurred_at <  (p_to + 1)::timestamptz)
  )
  select m.spend::numeric,
         m.impressions::bigint,
         m.link_clicks::bigint,
         m.landing_page_views::bigint,
         m.video_3s_views::bigint,
         m.results::bigint,
         c.conversions::bigint,
         c.revenue::numeric,
         m.creative_count::integer,
         m.first_day,
         m.last_day
    from m cross join c;
$$;

grant execute on function creative.scoped_metrics(text, date, date)         to service_role;
grant execute on function creative.creative_performance(text, date, date)   to service_role;
grant execute on function creative.daily_series(text, date, date)           to service_role;
grant execute on function creative.creative_daily_series(uuid, date, date)  to service_role;
grant execute on function creative.campaign_summary(text, date, date)       to service_role;
