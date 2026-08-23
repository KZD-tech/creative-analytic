-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — let a workspace id be renamed
--
-- Eight tables reference campaigns(id), all with ON UPDATE NO ACTION, so the
-- id was effectively permanent: any attempt to change it was refused by the
-- first foreign key that noticed.
--
-- Switching them to ON UPDATE CASCADE makes a rename one statement, with
-- Postgres propagating it. DELETE behaviour is deliberately left as CASCADE —
-- this changes what happens on rename, and nothing about what happens on
-- delete.
--
-- The id is still not offered in the UI. It appears in every URL and in the
-- payload every API caller sends, so renaming it breaks live integrations
-- until they are updated. This migration makes the operation possible and
-- safe; it does not make it routine.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.creatives        drop constraint creatives_campaign_id_fkey;
alter table public.creatives        add  constraint creatives_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.ad_metrics       drop constraint ad_metrics_campaign_id_fkey;
alter table public.ad_metrics       add  constraint ad_metrics_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.conversions      drop constraint conversions_campaign_id_fkey;
alter table public.conversions      add  constraint conversions_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.upload_batches   drop constraint upload_batches_campaign_id_fkey;
alter table public.upload_batches   add  constraint upload_batches_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.benchmarks       drop constraint benchmarks_campaign_id_fkey;
alter table public.benchmarks       add  constraint benchmarks_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.tags             drop constraint tags_campaign_id_fkey;
alter table public.tags             add  constraint tags_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.campaign_sources drop constraint campaign_sources_campaign_id_fkey;
alter table public.campaign_sources add  constraint campaign_sources_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;

alter table public.api_keys         drop constraint api_keys_campaign_id_fkey;
alter table public.api_keys         add  constraint api_keys_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on update cascade on delete cascade;
