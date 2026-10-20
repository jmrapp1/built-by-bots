-- Growth stages: blot -> sprout -> full form -> elder.
-- The server decides every stage change, from care points (earned by feeding)
-- and age, using the server clock only. Players can read their own creatures
-- but cannot write stage, care or age. Nothing is deleted or lowered: poor care
-- only slows progress, and a stage never goes backwards.
-- Anonymous sessions are still refused.

-- Stage rules live in a data table, like game_rules.
create table public.game_stages (
  id text primary key,
  ord int not null unique check (ord >= 0),
  min_care int not null check (min_care >= 0),
  min_age_seconds int not null check (min_age_seconds >= 0)
);
insert into public.game_stages values
  ('blot', 0, 0, 0),
  ('sprout', 1, 6, 600),
  ('full', 2, 20, 3600),
  ('elder', 3, 60, 86400);

alter table public.game_stages enable row level security;
create policy "read stages" on public.game_stages for select to authenticated using (true);
revoke all on public.game_stages from anon, authenticated;
grant select on public.game_stages to authenticated;

-- Care earned per food, and the cap on how much away-time counts per check.
alter table public.game_foods add column care int not null default 1 check (care >= 0);
update public.game_foods set care = 1 where id = 'ink';
update public.game_foods set care = 2 where id = 'glyph';
insert into public.game_rules values ('catchup_cap_seconds', 259200);

-- New columns on creatures. Existing creatures start as a blot with no care and
-- keep the age they already have (capped like any catch-up).
alter table public.creatures
  add column stage text not null default 'blot' references public.game_stages (id),
  add column care int not null default 0 check (care >= 0),
  add column age_seconds bigint not null default 0 check (age_seconds >= 0),
  add column last_grown_at timestamptz not null default now(),
  add column stage_changed_at timestamptz;

update public.creatures set
  age_seconds = least(
    extract(epoch from (now() - created_at)),
    (select value from public.game_rules where key = 'catchup_cap_seconds')
  )::bigint,
  last_grown_at = now();

-- Internal helper: credit elapsed time (capped) and advance through every stage
-- whose care and age requirements are met. Never goes backwards. Not callable by clients.
create function public.grow_creature_row(p_creature_id uuid) returns public.creatures
language plpgsql security definer set search_path = '' as $$
declare
  c public.creatures;
  cur public.game_stages;
  nxt public.game_stages;
  cap int;
  elapsed numeric;
  new_age bigint;
  new_stage text;
begin
  select * into c from public.creatures where id = p_creature_id for update;
  if not found then raise exception 'creature not found'; end if;
  select value into cap from public.game_rules where key = 'catchup_cap_seconds';
  elapsed := greatest(0, extract(epoch from (now() - c.last_grown_at)));
  new_age := c.age_seconds + least(elapsed, cap)::bigint;
  new_stage := c.stage;
  select * into cur from public.game_stages where id = c.stage;
  loop
    select * into nxt from public.game_stages where ord = cur.ord + 1;
    exit when not found or c.care < nxt.min_care or new_age < nxt.min_age_seconds;
    cur := nxt;
    new_stage := nxt.id;
  end loop;
  update public.creatures set
    age_seconds = new_age,
    last_grown_at = now(),
    stage = new_stage,
    stage_changed_at = case when new_stage <> c.stage then now() else c.stage_changed_at end
  where id = c.id returning * into c;
  return c;
end $$;

revoke execute on function public.grow_creature_row(uuid) from public, anon, authenticated;

-- Called when the player returns (and now and then while they play).
create function public.grow_creature(p_creature_id uuid) returns public.creatures
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creatures;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  select * into c from public.creatures where id = p_creature_id and owner = uid;
  if not found then raise exception 'creature not found'; end if;
  return public.grow_creature_row(c.id);
end $$;

revoke execute on function public.grow_creature(uuid) from public, anon;
grant execute on function public.grow_creature(uuid) to authenticated;

-- Feeding now also earns care and may advance the stage. Same rules as before:
-- cooldown, daily cap, stats only go up, anonymous sessions refused.
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
    care = care + f.care,
    last_fed_at = now(),
    feed_day = c.feed_day,
    feeds_today = c.feeds_today + 1
  where id = c.id returning * into c;
  return public.grow_creature_row(c.id);
end $$;
