-- Keepsakes from the Margins (slice 6d-3a, server side). Written, NOT applied. @proof reads the SQL first;
-- only then is it applied, with read-backs (supabase/margins_keepsakes_readback.sql).
-- A folded page can now hold a keepsake. The server decides; the client still sends only the page number.
--   * A keepsake is a fifth kind in the weighted finds table, so it is picked by the same repeatable roll as
--     every other find (tuning numbers live in data, not in public text).
--   * It is granted through public.grant_keepsake('margins') in the same transaction as the claim row, so the
--     daily ceiling counts it, and a failed claim rolls the grant back too.
--   * The claim row remembers which keepsake it was (new nullable column "cosmetic"), so asking again returns the
--     stored first answer, naming the same keepsake, and grants nothing.
--   * If all six are owned, or the player has no Print to wear it yet, the pick becomes food, exactly like a found
--     egg that cannot arrive. No dead end.
--   * The found-egg rule, the daily egg and claim_daily_egg are not touched. The care economy is not touched.
--
-- NOT purely additive, in plain words:
--   1. Two check constraints are replaced by supersets that also allow 'keepsake': the one on
--      game_margins_finds.kind and the one on margins_claims.result. No row is touched.
--   2. The live function public.margins_unfold(int) is REPLACED (create or replace). Every existing rule is kept:
--      the server's UTC day, one claim per (owner, day, page), the ceiling, the stored first answer, the egg rule, the
--      starter-egg guard, the signed-in-only refusals, security definer with an empty search_path, and execute for
--      signed-in accounts only (revoked from public and anon).
--   3. Because the roll is spread over a new total, a page that was NOT yet claimed today may now roll to a different
--      find than before. Pages already claimed keep their stored answer.
-- Nothing is dropped except those two old constraints, and no data is deleted or rewritten.
-- Order of use: apply this together with the client slice 6d-3b. An older client that has not heard of keepsakes
-- would treat that one answer as a quiet refusal and leave the page folded.

alter table public.game_margins_finds drop constraint game_margins_finds_kind_check;
alter table public.game_margins_finds add constraint game_margins_finds_kind_check check (kind in ('ink', 'glyph', 'scrap', 'egg', 'keepsake'));
insert into public.game_margins_finds (kind, weight) values ('keepsake', 5);

alter table public.margins_claims drop constraint margins_claims_result_check;
alter table public.margins_claims add constraint margins_claims_result_check check (result in ('ink', 'glyph', 'scrap', 'egg', 'keepsake'));
alter table public.margins_claims add column cosmetic text references public.game_cosmetics (id);
alter table public.margins_claims add constraint margins_claims_cosmetic_check check ((result = 'keepsake') = (cosmetic is not null));

create or replace function public.margins_unfold(p_spot int) returns public.margins_claims
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
  g record;
  cos text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  if p_spot is null or p_spot < 0 or p_spot >= spots then raise exception 'no such page'; end if;

  -- Same guard as the daily egg: a brand-new account must collect its starter egg first.
  if not exists (select 1 from public.eggs where owner = uid and kind = 'starter')
     and not exists (select 1 from public.creatures where owner = uid) then
    raise exception 'collect your starter egg first';
  end if;

  -- Same per-player lock as the daily egg, so two tabs cannot both claim. A second call waits here.
  insert into public.daily_egg_claims (owner, claimed_on) values (uid, date '1970-01-01') on conflict do nothing;
  select claimed_on into lock_day from public.daily_egg_claims where owner = uid for update;

  -- Already unfolded today: give back the first answer (naming the same keepsake), create and grant nothing.
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
    insert into public.margins_claims (owner, day, spot, result, egg_id) values (uid, today, p_spot, 'egg', e.id) returning * into c;
  elsif pick = 'keepsake' then
    insert into public.margins_claims (owner, day, spot, result, cosmetic) values (uid, today, p_spot, 'keepsake', cos) returning * into c;
  else
    insert into public.margins_claims (owner, day, spot, result) values (uid, today, p_spot, pick) returning * into c;
  end if;
  return c;
end $$;

revoke execute on function public.margins_unfold(int) from public, anon;
grant execute on function public.margins_unfold(int) to authenticated;
