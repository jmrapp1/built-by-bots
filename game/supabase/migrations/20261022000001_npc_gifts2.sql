-- NPC gifts N5 step 1, server side: a second small piece from each Margins neighbour, for coming back on a later day.
-- Written, NOT applied. Only the reviewer applies it, after @proof has read the SQL.
-- Additive: one new table, three seed rows in game_decorations, one new function. The N4 table npc_gifts and
-- claim_npc_gift are not touched. No existing table, column, policy or function changes; nothing is dropped.
-- Rules, all enforced here and never by the client:
--   * Signed-in accounts only. Anonymous sessions and anon are refused.
--   * Clients can only SELECT their own npc_gifts2 rows. The only write path is claim_npc_gift2 (no insert/update/delete grants).
--   * The neighbour-to-decoration map is fixed inside the function. The client sends a neighbour id, never a decoration.
--   * Unlock is decided from server data only, with the server clock (UTC date); no client time is sent:
--       binder      : her first gift (npc_gifts) was claimed on an earlier UTC day than today.
--       proofreader : her first gift was claimed on an earlier UTC day, and the binder's second piece is claimed.
--       wanderer    : his first gift was claimed on an earlier UTC day, and the proofreader's second piece is claimed.
--     If not met, state = 'waiting' and nothing is written (no error).
--   * Idempotent: a second call, double click, retry or second tab returns the same row with is_new = false and changes nothing.
--   * The function cannot see where the player stands, so a hand-made call can claim a gift without visiting. Accepted for
--     three cosmetic pieces of no value (same limit as N4).
-- Conflict targets are the primary keys BY NAME (npc_gifts2_pkey, owned_decorations_pkey), because the returns-table output
-- columns npc and decoration share names with table columns (the 42702 lesson from migration 000006).
-- Ids mirror game/data/decor.json (the client PR adds the matching looks later; until then the pieces are only rows).
-- Note: 'pressed-leaf-frame' fits the single wall plot, so it swaps with the starter framed page there.

insert into public.game_decorations (id, name, fits, starter) values
  ('page-stack', 'Stack of pages', 'floor', false),
  ('reading-lamp', 'Reading lamp', 'floor', false),
  ('pressed-leaf-frame', 'Pressed-leaf frame', 'wall', false);

create table public.npc_gifts2 (
  owner uuid not null references auth.users (id) on delete cascade,
  npc text not null check (npc in ('binder', 'proofreader', 'wanderer')),
  decoration text not null references public.game_decorations (id),
  claimed_at timestamptz not null default now(),
  constraint npc_gifts2_pkey primary key (owner, npc)
);

alter table public.npc_gifts2 enable row level security;
create policy "own npc gifts2" on public.npc_gifts2 for select to authenticated using (owner = (select auth.uid()));
revoke all on public.npc_gifts2 from anon, authenticated;
grant select on public.npc_gifts2 to authenticated;

create function public.claim_npc_gift2(p_npc text)
returns table (npc text, decoration text, is_new boolean, state text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gift text;
  prev text;
  today date := (now() at time zone 'utc')::date;
  inserted_rows integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  -- Fixed maps, inside the function. Anything else is refused.
  gift := case p_npc
    when 'binder' then 'page-stack'
    when 'proofreader' then 'reading-lamp'
    when 'wanderer' then 'pressed-leaf-frame'
    else null
  end;
  if gift is null then raise exception 'no such neighbour'; end if;
  -- The neighbour whose second piece must be claimed first (null for the first in the chain).
  prev := case p_npc
    when 'proofreader' then 'binder'
    when 'wanderer' then 'proofreader'
    else null
  end;

  -- Serialise this account's gift claims (advisory lock on the account; released at transaction end).
  perform pg_advisory_xact_lock(hashtextextended('npc_gift2:' || uid::text, 0));

  -- Already claimed: return the stored row, change nothing.
  if exists (select 1 from public.npc_gifts2 g where g.owner = uid and g.npc = p_npc) then
    return query select g.npc, g.decoration, false, 'claimed'::text
      from public.npc_gifts2 g where g.owner = uid and g.npc = p_npc;
    return;
  end if;

  -- Unlock check from server data only; not met means 'waiting' and no write.
  if not exists (
      select 1 from public.npc_gifts f
      where f.owner = uid and f.npc = p_npc and (f.claimed_at at time zone 'utc')::date < today
    )
    or (prev is not null and not exists (
      select 1 from public.npc_gifts2 p where p.owner = uid and p.npc = prev
    )) then
    return query select p_npc, null::text, false, 'waiting'::text;
    return;
  end if;

  insert into public.npc_gifts2 (owner, npc, decoration) values (uid, p_npc, gift)
    on conflict on constraint npc_gifts2_pkey do nothing;
  get diagnostics inserted_rows = row_count;

  insert into public.owned_decorations (owner, decoration) values (uid, gift)
    on conflict on constraint owned_decorations_pkey do nothing;

  return query select g.npc, g.decoration, (inserted_rows = 1), 'claimed'::text
    from public.npc_gifts2 g where g.owner = uid and g.npc = p_npc;
end $$;

revoke execute on function public.claim_npc_gift2(text) from public, anon;
grant execute on function public.claim_npc_gift2(text) to authenticated;
