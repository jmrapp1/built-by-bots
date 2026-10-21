-- World spots (W5, server side). Written, NOT applied. @proof reads the SQL first; only then is it applied, with
-- read-backs (supabase/world_spots_readback.sql). No client wiring is in this PR.
-- A claim is now keyed by region and spot. The client says only a region name and a spot number; the server decides
-- what is inside, and nothing the client sends can change the answer.
--   * New data table game_spot_regions: which regions have spots and how many (data, not code). Seeded with the
--     Margins (12, as before) plus the two World regions.
--   * margins_claims gets a region column (existing rows become 'margins') and its key becomes
--     (owner, day, region, spot): one claim per player, day, region and spot. Asking again returns the first answer.
--   * public.world_unfold(region, spot) holds the pick. It is the keepsake-era margins_unfold body with the region
--     added: same UTC day, same per-player lock, same stored first answer, same daily ceiling (counted over ALL
--     regions together, so wandering adds places to look, not more finds), same weighted finds table, same egg rule
--     and starter-egg guard, same keepsake grant, same quiet refusals, no position check.
--   * public.margins_unfold(int) keeps its name, signature, grants and answers; it now calls world_unfold('margins', n).
--     The roll text for the Margins is unchanged, so an unclaimed Margins page rolls what it would have rolled.
--     Other regions add the region name to the roll text, so their spots roll differently from the Margins.
--
-- NOT purely additive, in plain words:
--   1. The live function public.margins_unfold(int) is REPLACED (create or replace) by a thin wrapper.
--   2. The primary key of margins_claims is replaced by one that also holds region, and the old spot range check
--      (0 to 11) is replaced by a wider one; the real range per region is enforced by the function and the data table.
--      Both are supersets for existing rows. No row is touched, deleted or rewritten.
-- Order of use: apply, then merge the client slice. An older client that reads its claims by day and spot only could
-- confuse a new-region row for a Margins page, but no client writes new-region rows until the client slice ships,
-- and that slice filters by region.

create table public.game_spot_regions (
  region text primary key check (region ~ '^[a-z][a-z0-9_]{1,23}$'),
  spots int not null check (spots between 1 and 64)
);
insert into public.game_spot_regions (region, spots) values ('margins', 12), ('meadow', 4), ('inkwood', 8);
alter table public.game_spot_regions enable row level security;
create policy "read spot regions" on public.game_spot_regions for select to authenticated using (true);
revoke all on public.game_spot_regions from anon, authenticated;
grant select on public.game_spot_regions to authenticated;

alter table public.margins_claims add column region text not null default 'margins' references public.game_spot_regions (region);
alter table public.margins_claims drop constraint margins_claims_pkey;
alter table public.margins_claims add primary key (owner, day, region, spot);
alter table public.margins_claims drop constraint margins_claims_spot_check;
alter table public.margins_claims add constraint margins_claims_spot_check check (spot between 0 and 63);

create function public.world_unfold(p_region text, p_spot int) returns public.margins_claims
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  spots int;                    -- spots in this region (data: game_spot_regions)
  seed text;
  ceiling constant int := 10;   -- claims counted per player per day
  egg_gap constant int := 5;    -- at most one found egg in this many days
  c public.margins_claims;
  lock_day date;
  used int;
  roll double precision;
  pick text;
  sp public.game_species;
  e public.eggs;
  g record;
  cos text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  select r.spots into spots from public.game_spot_regions r where r.region = p_region;
  if not found or p_spot is null or p_spot < 0 or p_spot >= spots then raise exception 'no such page'; end if;

  -- Same guard as the daily egg: a brand-new account must collect its starter egg first.
  if not exists (select 1 from public.eggs where owner = uid and kind = 'starter')
     and not exists (select 1 from public.creatures where owner = uid) then
    raise exception 'collect your starter egg first';
  end if;

  -- Same per-player lock as the daily egg, so two tabs cannot both claim. A second call waits here.
  insert into public.daily_egg_claims (owner, claimed_on) values (uid, date '1970-01-01') on conflict do nothing;
  select claimed_on into lock_day from public.daily_egg_claims where owner = uid for update;

  -- Already unfolded today: give back the first answer (naming the same keepsake), create and grant nothing.
  select * into c from public.margins_claims where owner = uid and day = today and region = p_region and spot = p_spot;
  if found then return c; end if;

  select count(*) into used from public.margins_claims where owner = uid and day = today;
  if used >= ceiling then raise exception 'enough pages for today'; end if;

  -- Repeatable roll in [0, 1) from the player, the day, the region and the spot. The Margins keep their old
  -- text exactly, so the gate rolls what it always rolled.
  seed := case when p_region = 'margins' then p_spot::text else p_region || ':' || p_spot::text end;
  roll := (('x' || substr(md5(uid::text || ':' || today::text || ':' || seed), 1, 8))::bit(32)::bigint) / 4294967296.0;
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

  -- A keepsake needs a Print to wear it. Without one, or with all six owned, it becomes food.
  if pick = 'keepsake' then
    if not exists (select 1 from public.creatures where owner = uid) then
      pick := 'ink';
    else
      select * into g from public.grant_keepsake('margins'); -- same transaction as the claim row below
      if g.duplicate then pick := 'glyph'; else cos := g.cosmetic; end if;
    end if;
  end if;

  if pick = 'egg' then
    select * into sp from public.game_species where id = 'blotling'; -- a found egg is always a blotling
    insert into public.eggs (owner, kind, species, hatch_at)
      values (uid, 'found', sp.id, now() + make_interval(secs => sp.hatch_seconds))
      returning * into e;
    insert into public.margins_claims (owner, day, region, spot, result, egg_id) values (uid, today, p_region, p_spot, 'egg', e.id) returning * into c;
  elsif pick = 'keepsake' then
    insert into public.margins_claims (owner, day, region, spot, result, cosmetic) values (uid, today, p_region, p_spot, 'keepsake', cos) returning * into c;
  else
    insert into public.margins_claims (owner, day, region, spot, result) values (uid, today, p_region, p_spot, pick) returning * into c;
  end if;
  return c;
end $$;

revoke execute on function public.world_unfold(text, int) from public, anon;
grant execute on function public.world_unfold(text, int) to authenticated;

create or replace function public.margins_unfold(p_spot int) returns public.margins_claims
language plpgsql security definer set search_path = '' as $$
begin
  return public.world_unfold('margins', p_spot);
end $$;

revoke execute on function public.margins_unfold(int) from public, anon;
grant execute on function public.margins_unfold(int) to authenticated;
