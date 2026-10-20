-- Keepsakes, server side (slice 6d-2): a catalogue of six, what each player owns, and the one worn on the Print.
-- Written, NOT applied. Only the reviewer applies it, after @proof has read the SQL.
-- Additive: new tables, one new nullable column on creatures, one new function. Nothing dropped or rewritten.
-- Rules, all enforced here and never by the client:
--   * The client never names a keepsake. The server picks one the player does not own yet.
--   * Newest found is worn (one slot). The older one stays owned.
--   * A duplicate (all six already owned) gives food instead of a row. The server keeps no food stock (see the
--     Margins migration), so the food is reported in the result for the caller to pass on; nothing is stored.
--   * Players can read their own owned rows only; no client insert/update/delete anywhere; worn_cosmetic is
--     written only by grant_keepsake.
--   * Signed-in accounts only. Anonymous sessions and anon are refused.
-- "Current Print" = the player's oldest creature, the same one the app lists first (order by created_at).
-- NOTE for review: grant_keepsake has no limit of its own; in slice 6d-3 the Margins claim calls it in the same
-- transaction so the daily ceiling applies. Clients cannot call it at all (execute revoked from public, anon, authenticated);
-- until then it is only callable by the owner role, for tests and previews.

create table public.game_cosmetics (
  id text primary key,
  name text not null
);
insert into public.game_cosmetics (id, name) values
  ('leaf_sprig', 'Leaf sprig'), ('ribbon', 'Ribbon'), ('ink_cheeks', 'Ink cheeks'),
  ('paper_crown', 'Paper crown'), ('scarf', 'Scarf'), ('lantern', 'Lantern');

create table public.owned_cosmetics (
  owner uuid not null references auth.users (id) on delete cascade,
  cosmetic text not null references public.game_cosmetics (id),
  found_at timestamptz not null default now(),
  primary key (owner, cosmetic)
);

alter table public.creatures add column worn_cosmetic text references public.game_cosmetics (id);

alter table public.game_cosmetics enable row level security;
alter table public.owned_cosmetics enable row level security;
create policy "read cosmetics" on public.game_cosmetics for select to authenticated using (true);
create policy "own cosmetics" on public.owned_cosmetics for select to authenticated using (owner = (select auth.uid()));
revoke all on public.game_cosmetics, public.owned_cosmetics from anon, authenticated;
grant select on public.game_cosmetics, public.owned_cosmetics to authenticated;
-- creatures already grants select only (no update to clients); this makes the column's rule explicit.
revoke insert (worn_cosmetic), update (worn_cosmetic) on public.creatures from anon, authenticated;

create function public.grant_keepsake(kind text)
returns table (cosmetic text, duplicate boolean, food int)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  pick text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  if kind is distinct from 'margins' then raise exception 'unknown keepsake source'; end if;

  -- Lock the player's current Print: a second call waits here, so two fast calls cannot double-grant.
  select id into cid from public.creatures where owner = uid order by created_at, id limit 1 for update;
  if cid is null then raise exception 'no Print to wear it'; end if;

  select g.id into pick from public.game_cosmetics g
    where not exists (select 1 from public.owned_cosmetics o where o.owner = uid and o.cosmetic = g.id)
    order by random() limit 1;

  if pick is null then
    -- Everything owned: food instead, no row, nothing worn changes.
    return query select null::text, true, 1;
    return;
  end if;

  insert into public.owned_cosmetics (owner, cosmetic) values (uid, pick);
  update public.creatures set worn_cosmetic = pick where id = cid;
  return query select pick, false, 0;
end $$;

-- Not callable by clients: only the 6d-3 security-definer claim function (and the table owner) may call it.
revoke execute on function public.grant_keepsake(text) from public, anon, authenticated;
