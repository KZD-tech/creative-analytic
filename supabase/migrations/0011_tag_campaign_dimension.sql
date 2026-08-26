-- Adds "campaign" as a valid tag dimension ("Kempen" in the UI), alongside
-- hook/format/angle/offer/persona/cta/custom.
alter table public.tags drop constraint if exists tags_dimension_check;
alter table public.tags add constraint tags_dimension_check
  check (dimension in ('hook', 'format', 'angle', 'offer', 'persona', 'cta', 'campaign', 'custom'));
