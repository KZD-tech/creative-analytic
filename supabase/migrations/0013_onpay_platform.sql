-- Onpay joins Meta and Google Ads as a platform ad_connections can hold — not
-- an ad platform, but the same encrypted-token storage and sync bookkeeping
-- fit a direct-token donation source just as well.
alter table ad_connections drop constraint ad_connections_platform_check;
alter table ad_connections add constraint ad_connections_platform_check
  check (platform = any (array['meta'::text, 'google_ads'::text, 'onpay'::text]));
