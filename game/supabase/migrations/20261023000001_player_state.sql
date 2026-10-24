-- S36 step 1: save where the player and their Prints stand. NOT applied yet: proof reads this file first, then reviewer applies it.
--
-- Purely additive: two new tables (player_state, print_state) and one new function (save_state).
-- Nothing is dropped, altered, updated or deleted. No client change ships with this file.
--
-- Clients may only SELECT their own rows (RLS). There is no insert/update/delete policy or grant.
-- The only way to write is public.save_state(), which is security definer, refuses anon/anonymous sessions,
-- takes the owner from auth.uid() (never a parameter), writes only Prints the caller owns, and has a server-side flood guard.
-- The server checks only finite / in-bounds / known zone and mode. It cannot see colliders; the client checks the spot on load.

create table public.player_state (
  owner uuid primary key references auth.users (id) on delete cascade,
  zone text not null check (zone in ('garden', 'margins', 'home', 'reading')),
  x double precision not null check (x = x and abs(x) <= 140),
  z double precision not null check (z = z and abs(z) <= 140),
  heading double precision not null check (heading = heading and abs(heading) <= 32),
  yaw double precision not null check (yaw = yaw and abs(yaw) <= 32),
  updated_at timestamptz not null default now()
);

create table public.print_state (
  creature_id uuid primary key references public.creatures (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  x double precision not null check (x = x and abs(x) <= 140),
  z double precision not null check (z = z and abs(z) <= 140),
  heading double precision not null check (heading = heading and abs(heading) <= 32),
  mode text not null check (mode in ('rest', 'wander')),
  updated_at timestamptz not null default now()
);

create index print_state_owner_idx on public.print_state (owner);

alter table public.player_state enable row level security;
alter table public.print_state enable row level security;

create policy player_state_select_own on public.player_state for select to authenticated using (owner = (select auth.uid()));
create policy print_state_select_own on public.print_state for select to authenticated using (owner = (select auth.uid()));

revoke all on public.player_state from anon, authenticated;
revoke all on public.print_state from anon, authenticated;
grant select on public.player_state to authenticated;
grant select on public.print_state to authenticated;

create function public.save_state(p_zone text, p_x float8, p_z float8, p_heading float8, p_yaw float8, p_prints jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_bound constant float8 := 140;
  v_turns constant float8 := 32;
  v_max_prints constant int := 24;
  v_min_gap constant interval := interval '5 seconds';
  v_last timestamptz;
  v_el jsonb;
  v_id uuid;
  v_px float8;
  v_pz float8;
  v_ph float8;
  v_pm text;
  v_list jsonb[] := '{}';
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  -- Player fields: finite (x = x rejects NaN), within bounds (rejects infinity and huge values), known zone.
  if p_zone is null or p_zone not in ('garden', 'margins', 'home', 'reading') then raise exception 'bad state'; end if;
  if p_x is null or p_z is null or p_heading is null or p_yaw is null then raise exception 'bad state'; end if;
  if not (p_x = p_x and abs(p_x) <= v_bound and p_z = p_z and abs(p_z) <= v_bound) then raise exception 'bad state'; end if;
  if not (p_heading = p_heading and abs(p_heading) <= v_turns and p_yaw = p_yaw and abs(p_yaw) <= v_turns) then raise exception 'bad state'; end if;

  -- Prints: an array of at most 24 objects {id, x, z, h, m}. Every element is validated before anything is written.
  if p_prints is null or jsonb_typeof(p_prints) <> 'array' then raise exception 'bad state'; end if;
  if jsonb_array_length(p_prints) > v_max_prints then raise exception 'bad state'; end if;
  for v_el in select e from jsonb_array_elements(p_prints) as t(e) loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'id') <> 'string' or jsonb_typeof(v_el -> 'm') <> 'string'
       or jsonb_typeof(v_el -> 'x') <> 'number' or jsonb_typeof(v_el -> 'z') <> 'number' or jsonb_typeof(v_el -> 'h') <> 'number'
    then raise exception 'bad state'; end if;
    v_px := (v_el ->> 'x')::float8;
    v_pz := (v_el ->> 'z')::float8;
    v_ph := (v_el ->> 'h')::float8;
    v_pm := v_el ->> 'm';
    if not (v_px = v_px and abs(v_px) <= v_bound and v_pz = v_pz and abs(v_pz) <= v_bound and v_ph = v_ph and abs(v_ph) <= v_turns)
    then raise exception 'bad state'; end if;
    if v_pm not in ('rest', 'wander') then raise exception 'bad state'; end if;
    v_id := (v_el ->> 'id')::uuid;
  end loop;

  -- Serialise this account's saves (advisory lock on the account; released at transaction end), then the flood guard.
  perform pg_advisory_xact_lock(hashtextextended('player_state:' || v_uid::text, 0));
  select s.updated_at into v_last from public.player_state s where s.owner = v_uid;
  if v_last is not null and clock_timestamp() - v_last < v_min_gap then return 'skipped'; end if;

  insert into public.player_state as ps (owner, zone, x, z, heading, yaw, updated_at)
  values (v_uid, p_zone, p_x, p_z, p_heading, p_yaw, clock_timestamp())
  on conflict on constraint player_state_pkey do update
    set zone = excluded.zone, x = excluded.x, z = excluded.z, heading = excluded.heading, yaw = excluded.yaw, updated_at = excluded.updated_at;

  -- Only ids that join to creatures.owner = the caller are written; any other id is silently skipped.
  for v_el in select e from jsonb_array_elements(p_prints) as t(e) loop
    v_id := (v_el ->> 'id')::uuid;
    if exists (select 1 from public.creatures c where c.id = v_id and c.owner = v_uid) then
      insert into public.print_state as pr (creature_id, owner, x, z, heading, mode, updated_at)
      values (v_id, v_uid, (v_el ->> 'x')::float8, (v_el ->> 'z')::float8, (v_el ->> 'h')::float8, v_el ->> 'm', clock_timestamp())
      on conflict on constraint print_state_pkey do update
        set x = excluded.x, z = excluded.z, heading = excluded.heading, mode = excluded.mode, updated_at = excluded.updated_at;
    end if;
  end loop;

  return 'saved';
end $$;

revoke execute on function public.save_state(text, float8, float8, float8, float8, jsonb) from public, anon;
grant execute on function public.save_state(text, float8, float8, float8, float8, jsonb) to authenticated;
