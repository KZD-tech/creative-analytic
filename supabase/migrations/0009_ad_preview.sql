-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — Meta's own ad preview
--
-- A stored image shows what the creative looks like. Meta's preview shows what
-- the *ad* looks like: the page name, the primary text, the call-to-action
-- button, the placement's own framing. For judging a creative, the difference
-- matters — a strong image inside a weak ad still loses.
--
-- The URL is a signed iframe endpoint and expires, so it is refreshed on every
-- sync. The stored thumbnail stays the fallback, which is why the two are kept
-- in separate columns.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.creatives
  add column if not exists preview_url text;

comment on column public.creatives.preview_url is
  'Meta-hosted iframe preview of the whole ad. Signed and expiring; refreshed each sync.';

-- The function has to be dropped rather than replaced: adding an OUT column
-- changes its return type, and Postgres refuses that in place.
drop function if exists public.creative_performance(text, date, date);

create or replace function public.creative_performance(
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
  preview_url        text,
  external_ad_id     text,
  headline           text,
  body_copy          text,
  landing_url        text,
  landing_key        text,
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
      from public.scoped_metrics(p_campaign_id, p_from, p_to) s
     group by s.creative_id
  ),
  c as (
    select v.creative_id,
           count(*)                    as conversions,
           coalesce(sum(v.amount), 0)  as revenue
      from public.conversions v
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

-- ── daily time series for the whole campaign ───────────────────────────────

revoke execute on function public.creative_performance(text, date, date) from public;
grant execute on function public.creative_performance(text, date, date) to service_role, authenticated;
