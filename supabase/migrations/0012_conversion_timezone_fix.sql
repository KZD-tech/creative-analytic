-- Bug: campaign_summary(), creative_performance() and daily_series() all
-- filter conversions.occurred_at against p_from/p_to by casting the date
-- parameters straight to timestamptz — which Postgres resolves using the
-- session's TimeZone (UTC on Supabase), not the campaign's own timezone.
--
-- For a Malaysia campaign (UTC+8) that shifts every date-range boundary by
-- 8 hours: a donation at 2026-08-24 05:49 MYT is stored as
-- 2026-08-23 21:49 UTC, so a query for "24/8" silently excludes it — it
-- reads as belonging to the 23rd instead. daily_series() already computes
-- its day *label* in the campaign's timezone (`at time zone tz.name`) but
-- filtered rows with the same buggy UTC cutoff first, so a donation could
-- be dropped by the filter before it ever reached the correctly-timezoned
-- grouping. Verified live: 209 of 504 conversions on campaign "im-1"
-- (RM8,080) sit on the wrong side of a UTC day boundary versus their real
-- Malaysia-local day.
--
-- Fix: resolve p_from/p_to against the campaign's own timezone (falling
-- back to Asia/Kuala_Lumpur, matching the app-side default), the same way
-- daily_series() already does for its grouping.

create or replace function public.campaign_summary(
  p_campaign_id text,
  p_from date default null,
  p_to date default null
)
returns table (
  spend numeric,
  impressions bigint,
  link_clicks bigint,
  landing_page_views bigint,
  video_3s_views bigint,
  results bigint,
  conversions bigint,
  revenue numeric,
  creative_count integer,
  first_day date,
  last_day date
)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce(c.timezone, 'Asia/Kuala_Lumpur') as name
      from public.campaigns c
     where c.id = p_campaign_id
  ),
  m as (
    select coalesce(sum(s.spend), 0)              as spend,
           coalesce(sum(s.impressions), 0)        as impressions,
           coalesce(sum(s.link_clicks), 0)        as link_clicks,
           coalesce(sum(s.landing_page_views), 0) as landing_page_views,
           coalesce(sum(s.video_3s_views), 0)     as video_3s_views,
           coalesce(sum(s.results), 0)            as results,
           count(distinct s.creative_id)          as creative_count,
           min(s.date_start)                      as first_day,
           max(s.date_stop)                       as last_day
      from public.scoped_metrics(p_campaign_id, p_from, p_to) s
  ),
  c as (
    select count(*) as conversions, coalesce(sum(v.amount), 0) as revenue
      from public.conversions v, tz
     where v.campaign_id = p_campaign_id
       and (p_from is null or v.occurred_at >= (p_from::timestamp at time zone tz.name))
       and (p_to   is null or v.occurred_at <  ((p_to + 1)::timestamp at time zone tz.name))
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

create or replace function public.creative_performance(
  p_campaign_id text,
  p_from date default null,
  p_to date default null
)
returns table (
  creative_id uuid,
  ad_name text,
  adset_name text,
  platform_campaign text,
  media_url text,
  media_kind text,
  thumbnail_url text,
  preview_url text,
  external_ad_id text,
  headline text,
  body_copy text,
  landing_url text,
  landing_key text,
  first_seen date,
  last_seen date,
  spend numeric,
  impressions bigint,
  reach bigint,
  frequency numeric,
  clicks_all bigint,
  link_clicks bigint,
  landing_page_views bigint,
  video_3s_views bigint,
  video_thruplays bigint,
  video_p25 bigint,
  video_p50 bigint,
  video_p75 bigint,
  video_p100 bigint,
  results bigint,
  platform_revenue numeric,
  conversions bigint,
  revenue numeric,
  active_days integer
)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce(c.timezone, 'Asia/Kuala_Lumpur') as name
      from public.campaigns c
     where c.id = p_campaign_id
  ),
  m as (
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
      from public.scoped_metrics(p_campaign_id, p_from, p_to) s
     group by s.creative_id
  ),
  c as (
    select v.creative_id,
           count(*)                    as conversions,
           coalesce(sum(v.amount), 0)  as revenue
      from public.conversions v, tz
     where v.campaign_id = p_campaign_id
       and v.creative_id is not null
       and (p_from is null or v.occurred_at >= (p_from::timestamp at time zone tz.name))
       and (p_to   is null or v.occurred_at <  ((p_to + 1)::timestamp at time zone tz.name))
     group by v.creative_id
  )
  select cr.id,
         cr.ad_name,
         cr.adset_name,
         cr.platform_campaign,
         cr.media_url,
         cr.media_kind,
         cr.thumbnail_url,
         cr.preview_url,
         cr.external_ad_id,
         cr.headline,
         cr.body_copy,
         cr.landing_url,
         cr.landing_key,
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
    from public.creatives cr
    left join m on m.creative_id = cr.id
    left join c on c.creative_id = cr.id
   where cr.campaign_id = p_campaign_id
     and (m.creative_id is not null or c.creative_id is not null);
$$;

create or replace function public.daily_series(
  p_campaign_id text,
  p_from date default null,
  p_to date default null
)
returns table (
  day date,
  spend numeric,
  impressions bigint,
  link_clicks bigint,
  landing_page_views bigint,
  video_3s_views bigint,
  reach bigint,
  conversions bigint,
  revenue numeric
)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce(c.timezone, 'Asia/Kuala_Lumpur') as name
      from public.campaigns c
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
      from public.scoped_metrics(p_campaign_id, p_from, p_to) s
     where s.granularity = 'day'
     group by s.date_start
  ),
  conv as (
    select (v.occurred_at at time zone tz.name)::date as day,
           count(*)                   as conversions,
           coalesce(sum(v.amount), 0) as revenue
      from public.conversions v, tz
     where v.campaign_id = p_campaign_id
       and (p_from is null or v.occurred_at >= (p_from::timestamp at time zone tz.name))
       and (p_to   is null or v.occurred_at <  ((p_to + 1)::timestamp at time zone tz.name))
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
