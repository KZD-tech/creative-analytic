-- ═══════════════════════════════════════════════════════════════════════════
-- Proves that ownership is enforced by the database, not by application code.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- Runs as `authenticated` with a forged subject claim, exactly as PostgREST
-- does for a signed-in request. Ends by raising, so nothing is persisted.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  alice uuid;
  bob   uuid;
  seen  integer;
  spend numeric;
begin
  -- Everything here runs inside a transaction that is rolled back at the end,
  -- so the test can clear existing accounts and still be safe to run against a
  -- database that already has users. Alice is then genuinely the first account
  -- and should bootstrap the instance as admin.
  delete from public.profiles;
  delete from public.invites;

  insert into auth.users (email) values ('alice@example.com') returning id into alice;

  -- Bob needs an invitation; without one the trigger refuses the account.
  begin
    insert into auth.users (email) values ('uninvited@example.com');
    raise exception 'FAIL: an uninvited email was allowed to sign up';
  exception when check_violation then
    null;  -- expected
  end;

  insert into public.invites (email, invited_by) values ('bob@example.com', alice);
  insert into auth.users (email) values ('bob@example.com') returning id into bob;

  if not exists (select 1 from public.invites
                  where email = 'bob@example.com' and accepted_at is not null) then
    raise exception 'FAIL: the invitation was not marked accepted';
  end if;

  if (select role from public.profiles where id = alice) <> 'admin' then
    raise exception 'FAIL: the first account should be admin';
  end if;
  if (select role from public.profiles where id = bob) <> 'member' then
    raise exception 'FAIL: an invited account should default to member';
  end if;

  insert into public.campaigns (id, name, owner_id)
  values ('alice-camp', 'Alice', alice), ('bob-camp', 'Bob', bob);

  insert into public.creatives (campaign_id, ad_name, ad_name_key)
  values ('alice-camp', 'Alice Ad', 'alice ad'), ('bob-camp', 'Bob Ad', 'bob ad');

  insert into public.ad_metrics
    (campaign_id, creative_id, date_start, date_stop, spend, impressions)
  select c.campaign_id, c.id, '2026-03-01', '2026-03-01', 100, 1000
    from public.creatives c;

  -- ── as Alice ────────────────────────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', alice::text, true);

  select count(*) into seen from public.campaigns;
  if seen <> 1 then raise exception 'FAIL: Alice sees % campaigns, expected 1', seen; end if;

  select count(*) into seen from public.campaigns where id = 'bob-camp';
  if seen <> 0 then raise exception 'FAIL: Alice can read Bob''s campaign'; end if;

  select count(*) into seen from public.creatives;
  if seen <> 1 then raise exception 'FAIL: Alice sees % creatives, expected 1', seen; end if;

  select count(*) into seen from public.ad_metrics;
  if seen <> 1 then raise exception 'FAIL: Alice sees % metric rows, expected 1', seen; end if;

  -- The aggregation functions run as invoker, so they inherit the same limits.
  select count(*) into seen from public.creative_performance('bob-camp');
  if seen <> 0 then raise exception 'FAIL: creative_performance leaked Bob''s campaign'; end if;

  select coalesce(sum(cp.spend), 0) into spend from public.creative_performance('alice-camp') cp;
  if spend <> 100 then raise exception 'FAIL: Alice should see 100 spend, got %', spend; end if;

  -- Writing into someone else's campaign must be refused, not silently ignored.
  begin
    insert into public.creatives (campaign_id, ad_name, ad_name_key)
    values ('bob-camp', 'Injected', 'injected');
    raise exception 'FAIL: Alice inserted a creative into Bob''s campaign';
  exception when insufficient_privilege then
    null;  -- expected
  end;

  -- Re-pointing her own campaign at Bob must fail too.
  begin
    update public.campaigns set owner_id = bob where id = 'alice-camp';
    if found then raise exception 'FAIL: Alice reassigned her campaign to Bob'; end if;
  exception when insufficient_privilege then
    null;  -- expected
  end;

  -- ── as Bob ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', bob::text, true);

  select count(*) into seen from public.campaigns;
  if seen <> 1 then raise exception 'FAIL: Bob sees % campaigns, expected 1', seen; end if;

  select count(*) into seen from public.creatives where campaign_id = 'alice-camp';
  if seen <> 0 then raise exception 'FAIL: Bob can read Alice''s creatives'; end if;

  -- ── signed out ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into seen from public.campaigns;
  if seen <> 0 then raise exception 'FAIL: an unauthenticated request saw % campaigns', seen; end if;

  reset role;
  raise exception 'RLS TEST PASSED - transaction rolled back, nothing persisted';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Connections carry a credential to somebody's ad spend, so they get their own
-- isolation check rather than riding on the campaign one.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  alice uuid; bob uuid; seen integer;
begin
  delete from public.profiles;
  delete from public.invites;

  insert into auth.users (email) values ('alice2@example.com') returning id into alice;
  insert into public.invites (email) values ('bob2@example.com');
  insert into auth.users (email) values ('bob2@example.com') returning id into bob;

  insert into public.campaigns (id, name, owner_id) values ('alice2-camp', 'Alice', alice);

  insert into public.ad_connections
    (owner_id, platform, external_account_id, account_name, access_token)
  values
    (alice, 'meta', 'act_111', 'Alice Ads', 'v1.ciphertext-alice'),
    (bob,   'meta', 'act_222', 'Bob Ads',   'v1.ciphertext-bob');

  set local role authenticated;

  -- ── as Alice ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', alice::text, true);

  select count(*) into seen from public.ad_connections;
  if seen <> 1 then raise exception 'FAIL: Alice sees % connections, expected 1', seen; end if;

  select count(*) into seen from public.ad_connections where external_account_id = 'act_222';
  if seen <> 0 then raise exception 'FAIL: Alice can read Bob''s ad account credential'; end if;

  -- Pointing her own campaign at Bob's connection must be refused: otherwise a
  -- campaign could pull data using somebody else's token. Alice cannot even
  -- read that row, so the insert has nothing to reference and fails either on
  -- the policy or on the null it produces — both are a refusal.
  begin
    insert into public.campaign_sources (campaign_id, connection_id)
    values ('alice2-camp', (select id from public.ad_connections where owner_id = bob));
    raise exception 'FAIL: Alice linked her campaign to Bob''s connection';
  exception when insufficient_privilege or not_null_violation then
    null;  -- expected
  end;

  -- ── as Bob ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.ad_connections;
  if seen <> 1 then raise exception 'FAIL: Bob sees % connections, expected 1', seen; end if;

  -- ── signed out ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into seen from public.ad_connections;
  if seen <> 0 then raise exception 'FAIL: signed-out request saw % connections', seen; end if;

  reset role;
  raise exception 'CONNECTION RLS TEST PASSED - rolled back';
end;
$$;
