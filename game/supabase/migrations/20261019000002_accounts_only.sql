-- Accounts only (email + password). Anonymous sessions are refused even if
-- anonymous sign-ins were ever switched on. Functions are replaced in place, so
-- existing grants (authenticated only) are kept.

-- Award the starter egg (once per player).
create or replace function public.claim_starter_egg() returns public.eggs
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sp public.game_species;
  e public.eggs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  select * into sp from public.game_species where id = 'blotling';
  insert into public.eggs (owner, kind, species, hatch_at)
    values (uid, 'starter', sp.id, now() + make_interval(secs => sp.hatch_seconds))
    on conflict do nothing;
  select * into e from public.eggs where owner = uid and kind = 'starter';
  return e;
end $$;

-- Hatch an egg once its server-side timer has passed. Genes are rolled here.
create or replace function public.hatch_egg(p_egg_id uuid) returns public.creatures
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.eggs;
  sp public.game_species;
  c public.creatures;
  start_stat int;
  g jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  select * into e from public.eggs where id = p_egg_id and owner = uid for update;
  if not found then raise exception 'egg not found'; end if;
  select * into c from public.creatures where egg_id = e.id;
  if found then return c; end if;
  if now() < e.hatch_at then raise exception 'egg is not ready yet'; end if;
  select * into sp from public.game_species where id = e.species;
  select value into start_stat from public.game_rules where key = 'start_stat';
  g := jsonb_build_object(
    'hue', floor(random() * 360)::int,
    'shape', sp.shapes[1 + floor(random() * array_length(sp.shapes, 1))::int],
    'parts', (select to_jsonb(array_agg(p)) from (
        select p from unnest(sp.parts) p order by random() limit 2) s)
  );
  update public.eggs set hatched_at = now() where id = e.id;
  insert into public.creatures (owner, egg_id, species, genes, fullness, mood)
    values (uid, e.id, e.species, g, start_stat, start_stat)
    returning * into c;
  return c;
end $$;

-- Feed a creature. Cooldown and daily cap are enforced here. Stats only go up.
create or replace function public.feed_creature(p_creature_id uuid, p_food_id text) returns public.creatures
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creatures;
  f public.game_foods;
  cooldown int; daily int; maxs int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  select * into c from public.creatures where id = p_creature_id and owner = uid for update;
  if not found then raise exception 'creature not found'; end if;
  select * into f from public.game_foods where id = p_food_id;
  if not found then raise exception 'unknown food'; end if;
  select value into cooldown from public.game_rules where key = 'feed_cooldown_seconds';
  select value into daily from public.game_rules where key = 'feeds_per_day';
  select value into maxs from public.game_rules where key = 'max_stat';
  if c.last_fed_at is not null and now() < c.last_fed_at + make_interval(secs => cooldown) then
    raise exception 'too soon';
  end if;
  if c.feed_day is distinct from current_date then
    c.feed_day := current_date; c.feeds_today := 0;
  end if;
  if c.feeds_today >= daily then raise exception 'fed enough for today'; end if;
  update public.creatures set
    fullness = least(maxs, fullness + f.fullness),
    mood = least(maxs, mood + f.mood),
    last_fed_at = now(),
    feed_day = c.feed_day,
    feeds_today = c.feeds_today + 1
  where id = c.id returning * into c;
  return c;
end $$;


-- Reads: signed-in, non-anonymous players, own rows only.
drop policy "own eggs" on public.eggs;
drop policy "own creatures" on public.creatures;
create policy "own eggs" on public.eggs for select to authenticated
  using (owner = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
create policy "own creatures" on public.creatures for select to authenticated
  using (owner = (select auth.uid()) and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
