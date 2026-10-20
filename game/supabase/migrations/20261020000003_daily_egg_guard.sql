-- Guard for claim_daily_egg: the daily egg requires the starter egg first.
-- Without it, someone calling the API directly with a brand-new account could
-- end up with one extra waiting egg. The UI never offered that, so this only
-- closes the direct-API gap.
--
-- Everything else is the same as 20261020000002: security definer, empty
-- search_path, UTC day from now(), the row lock, one waiting egg, and the
-- weighted species pick. The only new lines are the guard below. A player who
-- has a starter egg or a Print is never locked out by it.
-- No table, constraint, data or other function changes.
-- create or replace keeps the existing grants; they are restated anyway.

create or replace function public.claim_daily_egg() returns public.eggs
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  last_day date;
  sp public.game_species;
  pick text;
  e public.eggs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  -- New guard: the daily egg comes after the starter egg. A starter egg or a Print must already
  -- exist. Checked before anything is written, so a refused call leaves no trace.
  if not exists (select 1 from public.eggs where owner = uid and kind = 'starter')
     and not exists (select 1 from public.creatures where owner = uid) then
    raise exception 'collect your starter egg first';
  end if;

  -- Make sure the player has a claim row, then lock it. A second call waits here
  -- until the first has finished and then sees its result.
  insert into public.daily_egg_claims (owner, claimed_on) values (uid, date '1970-01-01') on conflict do nothing;
  select claimed_on into last_day from public.daily_egg_claims where owner = uid for update;

  if last_day >= today then raise exception 'already claimed today'; end if;
  if exists (select 1 from public.eggs where owner = uid and hatched_at is null) then
    raise exception 'hatch your egg first';
  end if;

  select species into pick from public.game_daily_pool order by -ln(1 - random()) / weight limit 1;
  if pick is null then raise exception 'no egg available'; end if;
  select * into sp from public.game_species where id = pick;

  insert into public.eggs (owner, kind, species, hatch_at)
    values (uid, 'daily', sp.id, now() + make_interval(secs => sp.hatch_seconds))
    returning * into e;
  update public.daily_egg_claims set claimed_on = today where owner = uid;
  return e;
end $$;

revoke execute on function public.claim_daily_egg() from public, anon;
grant execute on function public.claim_daily_egg() to authenticated;
