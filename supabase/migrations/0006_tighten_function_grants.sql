-- ═══════════════════════════════════════════════════════════════════════════
-- Creative Analytic — narrow who may call the helper functions
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which on
-- Supabase means anon and authenticated can call anything in `public` through
-- /rest/v1/rpc. Two of ours were never meant to be reachable that way.
--
-- Nothing here changes behaviour: `handle_new_user` is only ever run by its
-- trigger, and `is_admin` keeps the grant the policies actually need.
-- ═══════════════════════════════════════════════════════════════════════════

-- A trigger function. Called through /rest/v1/rpc it has no NEW row and simply
-- errors, but a SECURITY DEFINER function that strangers can invoke is not
-- something to leave standing on the strength of "it would fail anyway".
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Answers "am I an admin" about the caller and nobody else. Signed-in users
-- need it because `invites_admin_all` evaluates it as them; signed-out
-- visitors have no reason to ask.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- `owns_campaign` is SECURITY INVOKER, so it can only ever see what the caller
-- could already see for themselves; it keeps its grant unchanged.
