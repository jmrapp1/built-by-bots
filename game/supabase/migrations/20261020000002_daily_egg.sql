-- Daily egg: one free egg per player per UTC day, species picked by the server.
-- Rules, all enforced here and never by the client:
--   * The day is the server's UTC date (now() only).
--   * At most one egg per UTC day. Missed days never pile up.
--   * At most one waiting egg in total: if the player has any egg that has not
--     hatched yet, the daily egg is refused ("hatch your egg first") and the
--     day's claim is NOT used up, so it is still there once the nest is free.
--   * Race-safe: the claim row is locked, so two tabs or a double click cannot
--     create two eggs.
-- claim_starter_egg is not touched. Players can read their own rows only.
--
-- One unavoidable change to an existing object: eggs.kind is limited to
-- 'starter' by a check constraint, so it is replaced by one that also allows
-- 'daily'. No row is touched, and the new check is a superset of the old one.

alter table public.eggs drop constraint eggs_kind_check;
alter table public.eggs add constraint eggs_kind_check check (kind in ('starter', 'daily'));

-- Which species the daily egg can give, with weights (data, not code).
create table public.game_daily_pool (
  species text primary key references public.game_species (id),
  weight int not null check (weight > 0)
);
insert into public.game_daily_pool values ('blotling', 1), ('leaflet', 1);

-- The last UTC day each player collected their daily egg.
create table public.daily_egg_claims (
  owner uuid primary key references auth.users (id) on delete cascade,
  claimed_on date not null
);

alter table public.game_daily_pool enable row level security;
alter table public.daily_egg_claims enable row level security;
create policy "read daily pool" on public.game_daily_pool for select to authenticated using (true);
create policy "own daily claim" on public.daily_egg_claims for select to authenticated using (owner = auth.uid());
revoke all on public.game_daily_pool, public.daily_egg_claims from anon, authenticated;
grant select on public.game_daily_pool, public.daily_egg_claims to authenticated;

create function public.claim_daily_egg() returns public.eggs
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
