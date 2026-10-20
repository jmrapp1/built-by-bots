-- Blotty solo slice: starter egg, hatching, feeding.
-- The server decides every outcome. Clients can only read their own rows
-- and call the functions below. No insert/update/delete grants on game tables.

create table public.game_species (
  id text primary key,
  hatch_seconds int not null check (hatch_seconds > 0),
  shapes text[] not null,
  parts text[] not null
);

create table public.game_foods (
  id text primary key,
  fullness int not null check (fullness >= 0),
  mood int not null check (mood >= 0)
);

create table public.game_rules (
  key text primary key,
  value int not null
);

insert into public.game_species values
  ('blotling', 45, array['round','tall','wide'], array['ears','tail','fins']);
insert into public.game_foods values ('ink', 20, 5), ('glyph', 10, 12);
insert into public.game_rules values
  ('feed_cooldown_seconds', 3), ('feeds_per_day', 50), ('max_stat', 100), ('start_stat', 50);

create table public.eggs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('starter')),
  species text not null references public.game_species (id),
  awarded_at timestamptz not null default now(),
  hatch_at timestamptz not null,
  hatched_at timestamptz
);
create unique index eggs_one_starter_per_owner on public.eggs (owner) where kind = 'starter';

create table public.creatures (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  egg_id uuid not null unique references public.eggs (id),
  species text not null references public.game_species (id),
  genes jsonb not null,
  fullness int not null default 50 check (fullness between 0 and 100),
  mood int not null default 50 check (mood between 0 and 100),
  last_fed_at timestamptz,
  feed_day date,
  feeds_today int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.game_species enable row level security;
alter table public.game_foods enable row level security;
alter table public.game_rules enable row level security;
alter table public.eggs enable row level security;
alter table public.creatures enable row level security;

create policy "read species" on public.game_species for select to authenticated using (true);
create policy "read foods" on public.game_foods for select to authenticated using (true);
create policy "read rules" on public.game_rules for select to authenticated using (true);
create policy "own eggs" on public.eggs for select to authenticated using (owner = (select auth.uid()));
create policy "own creatures" on public.creatures for select to authenticated using (owner = (select auth.uid()));

revoke all on public.game_species, public.game_foods, public.game_rules, public.eggs, public.creatures from anon, authenticated;
grant select on public.game_species, public.game_foods, public.game_rules, public.eggs, public.creatures to authenticated;

-- Award the starter egg (once per player).
create function public.claim_starter_egg() returns public.eggs
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sp public.game_species;
  e public.eggs;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into sp from public.game_species where id = 'blotling';
  insert into public.eggs (owner, kind, species, hatch_at)
    values (uid, 'starter', sp.id, now() + make_interval(secs => sp.hatch_seconds))
    on conflict do nothing;
  select * into e from public.eggs where owner = uid and kind = 'starter';
  return e;
end $$;

-- Hatch an egg once its server-side timer has passed. Genes are rolled here.
create function public.hatch_egg(p_egg_id uuid) returns public.creatures
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
create function public.feed_creature(p_creature_id uuid, p_food_id text) returns public.creatures
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creatures;
  f public.game_foods;
  cooldown int; daily int; maxs int;
begin
  if uid is null then raise exception 'not signed in'; end if;
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

revoke execute on function public.claim_starter_egg(), public.hatch_egg(uuid), public.feed_creature(uuid, text) from public, anon;
grant execute on function public.claim_starter_egg(), public.hatch_egg(uuid), public.feed_creature(uuid, text) to authenticated;
