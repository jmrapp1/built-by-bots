-- The Margins, server side (slice 6b): "I unfolded page N today".
-- The client only says which page (a number). The server decides what was inside, and nothing the client
-- sends can change the answer. Rules, all enforced here and never by the client:
--   * The day is the server's UTC date (now() only).
--   * One claim per player, day and page. Asking again returns the first answer and creates nothing, so a
--     retry, a refresh or a double click cannot reroll.
--   * What is inside is a repeatable pick: the same player, day and page always roll the same number,
--     weighted by the data table game_margins_finds.
--   * A daily ceiling on claims. Past it the call is refused and nothing is written.
--   * A found egg is always a blotling. It only arrives when no egg is waiting and none was found in the
--     last few days; otherwise the pick becomes food. The daily egg stays the only source of a leaflet and
--     the daily pool is not touched.
--   * Food and scraps are only reported. The server keeps no food stock, so the care economy, the feed
--     cooldown, the daily feed cap and the elder pace are unchanged. feed_creature is not touched.
--   * No position check: the server cannot see where the player stands. With no trading or shared economy
--     the ceiling bounds what a hacked client could do.
--   * Signed-in accounts only, like every other function. Anonymous sessions are refused.
-- Keepsakes (cosmetics) are a later slice and are not part of this migration.
--
-- One unavoidable change to an existing object: eggs.kind is limited by a check constraint, so it is
-- replaced by one that also allows 'found'. No row is touched, and the new check is a superset of the old.
-- Everything else is new objects only. Nothing is dropped, deleted or rewritten.

alter table public.eggs drop constraint eggs_kind_check;
alter table public.eggs add constraint eggs_kind_check check (kind in ('starter', 'daily', 'found'));

-- What a page can hold, with weights (data, not code). Tuning numbers; not for public text.
create table public.game_margins_finds (
  kind text primary key check (kind in ('ink', 'glyph', 'scrap', 'egg')),
  weight int not null check (weight > 0)
);
insert into public.game_margins_finds values ('ink', 34), ('glyph', 24), ('scrap', 39), ('egg', 3);

-- One row per player, UTC day and page. The primary key is the "no double claim" rule.
create table public.margins_claims (
  owner uuid not null references auth.users (id) on delete cascade,
  day date not null,
  spot int not null check (spot between 0 and 11),
  result text not null check (result in ('ink', 'glyph', 'scrap', 'egg')),
  egg_id uuid references public.eggs (id),
  claimed_at timestamptz not null default now(),
  primary key (owner, day, spot),
  check ((result = 'egg') = (egg_id is not null))
);

alter table public.game_margins_finds enable row level security;
alter table public.margins_claims enable row level security;
create policy "read margins finds" on public.game_margins_finds for select to authenticated using (true);
create policy "own margins claims" on public.margins_claims for select to authenticated using (owner = auth.uid());
revoke all on public.game_margins_finds, public.margins_claims from anon, authenticated;
grant select on public.game_margins_finds, public.margins_claims to authenticated;

create function public.margins_unfold(p_spot int) returns public.margins_claims
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  spots constant int := 12;     -- pages scattered each day (the client lays out the same number)
  ceiling constant int := 10;   -- claims counted per player per day
  egg_gap constant int := 5;    -- at most one found egg in this many days
  c public.margins_claims;
  lock_day date;
  used int;
  roll double precision;
  pick text;
  sp public.game_species;
  e public.eggs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  if p_spot is null or p_spot < 0 or p_spot >= spots then raise exception 'no such page'; end if;

  -- Same guard as the daily egg: a brand-new account must collect its starter egg first.
  if not exists (select 1 from public.eggs where owner = uid and kind = 'starter')
     and not exists (select 1 from public.creatures where owner = uid) then
    raise exception 'collect your starter egg first';
  end if;

  -- Take the same per-player lock the daily egg takes, so a found egg and a daily egg can never both
  -- arrive while the nest is empty, and two tabs cannot both claim. A second call waits here.
  insert into public.daily_egg_claims (owner, claimed_on) values (uid, date '1970-01-01') on conflict do nothing;
  select claimed_on into lock_day from public.daily_egg_claims where owner = uid for update;

  -- Already unfolded today: give back the first answer, create nothing.
  select * into c from public.margins_claims where owner = uid and day = today and spot = p_spot;
  if found then return c; end if;

  select count(*) into used from public.margins_claims where owner = uid and day = today;
  if used >= ceiling then raise exception 'enough pages for today'; end if;

  -- Repeatable roll in [0, 1) from the player, the day and the page.
  roll := (('x' || substr(md5(uid::text || ':' || today::text || ':' || p_spot::text), 1, 8))::bit(32)::bigint) / 4294967296.0;
  select f.kind into pick
    from (select kind, sum(weight) over (order by kind) as hi, sum(weight) over () as total from public.game_margins_finds) f
    where roll * f.total < f.hi
    order by f.hi limit 1;
  if pick is null then raise exception 'nothing to find'; end if;

  -- An egg only when the nest is free and none was found lately; otherwise it becomes food.
  if pick = 'egg' and (
       exists (select 1 from public.eggs where owner = uid and hatched_at is null)
       or exists (select 1 from public.margins_claims where owner = uid and result = 'egg' and day > today - egg_gap)
     ) then
    pick := 'glyph';
  end if;

  if pick = 'egg' then
    select * into sp from public.game_species where id = 'blotling'; -- a found egg is always a blotling
    insert into public.eggs (owner, kind, species, hatch_at)
      values (uid, 'found', sp.id, now() + make_interval(secs => sp.hatch_seconds))
      returning * into e;
    insert into public.margins_claims (owner, day, spot, result, egg_id) values (uid, today, p_spot, 'egg', e.id) returning * into c;
  else
    insert into public.margins_claims (owner, day, spot, result) values (uid, today, p_spot, pick) returning * into c;
  end if;
  return c;
end $$;

revoke execute on function public.margins_unfold(int) from public, anon;
grant execute on function public.margins_unfold(int) to authenticated;
