-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — ad copy and destination
--
-- Meta's ad-level export can carry the headline, the primary text and the
-- destination URL. Storing them turns three more template reports on:
-- Top Headlines, Top Body Copy and Top Landing Pages. All three are optional —
-- an export without these columns simply leaves them null, and the reports say
-- so rather than showing an empty grid.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.creatives
  add column if not exists headline     text,
  add column if not exists body_copy    text,
  add column if not exists landing_url  text,
  -- Query and group on the origin + path, ignoring the tracking parameters
  -- that make every row look unique.
  add column if not exists landing_key  text;

create index if not exists creatives_landing_key_idx
  on public.creatives (campaign_id, landing_key)
  where landing_key is not null;

-- The report grid reads copy and destination straight off the performance row,
-- so the function has to return them. Widening the OUT parameters means the
-- old signature must go first; `create or replace` cannot change a result type.
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
