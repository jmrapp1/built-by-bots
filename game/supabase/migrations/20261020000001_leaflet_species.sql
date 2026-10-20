-- Second species: leaflet. Purely additive.
-- There is still no way to obtain a leaflet egg: claim_starter_egg stays
-- blotling-only and is NOT touched here. A later change (the daily egg) will
-- be the source.
-- No existing row is updated or deleted. No grants change.

-- Optional colour range per species. The defaults reproduce today's behaviour
-- (any hue 0..359), so the existing blotling row needs no update.
alter table public.game_species
  add column hue_min int not null default 0 check (hue_min between 0 and 359),
  add column hue_max int not null default 359 check (hue_max between 0 and 359),
  add constraint game_species_hue_order check (hue_min <= hue_max);

insert into public.game_species (id, hatch_seconds, shapes, parts, hue_min, hue_max)
values ('leaflet', 45, array['round','tall','wide'], array['tabs','fold','spine'], 80, 170);

-- hatch_egg already reads species rows from the table (shapes and parts). This
-- replacement is identical to the accounts-only version except that the hue is
-- rolled inside the species' own range. Existing grants (authenticated only)
-- are kept by create or replace.
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
    'hue', sp.hue_min + floor(random() * (sp.hue_max - sp.hue_min + 1))::int,
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
