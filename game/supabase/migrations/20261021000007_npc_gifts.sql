-- NPC gifts N4, server side: each of the three Margins neighbours gives one small decoration, once ever, per account.
-- Written, NOT applied. Only the reviewer applies it, after @proof has read the SQL.
-- Additive: one new table, three seed rows in game_decorations, one new function. No existing table, column, policy or function is touched.
-- Ids mirror game/data/decor.json (the client PR adds the matching looks later; until then the pieces are only rows).
-- Rules, all enforced here and never by the client:
--   * Signed-in accounts only. Anonymous sessions and anon are refused.
--   * Clients can only SELECT their own npc_gifts rows. The only write path is claim_npc_gift (no insert/update/delete grants).
--   * The neighbour-to-decoration map is fixed inside the function. The client sends a neighbour id, never a decoration.
--   * Idempotent: a second call, double click, retry or second tab returns the same row with is_new = false and changes nothing.
--   * The function cannot see where the player stands, so a hand-made call can claim a gift without visiting. Accepted for three
--     cosmetic pieces of no value; add a server-held condition first if gifts ever become scarce.
-- Conflict targets are the primary keys BY NAME (npc_gifts_pkey, owned_decorations_pkey), because the returns-table output
-- columns npc and decoration share names with table columns (the 42702 lesson from migration 000006).

insert into public.game_decorations (id, name, fits, starter) values
  ('bookmark-ribbon', 'Bookmark ribbon', 'wall', false),
  ('quill-stand', 'Quill stand', 'floor', false),
  ('travelling-lantern', 'Travelling lantern', 'floor', false);

create table public.npc_gifts (
  owner uuid not null references auth.users (id) on delete cascade,
  npc text not null check (npc in ('binder', 'proofreader', 'wanderer')),
  decoration text not null references public.game_decorations (id),
  claimed_at timestamptz not null default now(),
  constraint npc_gifts_pkey primary key (owner, npc)
);

alter table public.npc_gifts enable row level security;
create policy "own npc gifts" on public.npc_gifts for select to authenticated using (owner = (select auth.uid()));
revoke all on public.npc_gifts from anon, authenticated;
grant select on public.npc_gifts to authenticated;

create function public.claim_npc_gift(p_npc text)
returns table (npc text, decoration text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gift text;
  inserted_rows integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  -- Fixed map, inside the function. Anything else is refused.
  gift := case p_npc
    when 'binder' then 'bookmark-ribbon'
    when 'proofreader' then 'quill-stand'
    when 'wanderer' then 'travelling-lantern'
    else null
  end;
  if gift is null then raise exception 'no such neighbour'; end if;

  -- Serialise this account's gift claims (advisory lock on the account; released at transaction end).
  perform pg_advisory_xact_lock(hashtextextended('npc_gift:' || uid::text, 0));

  insert into public.npc_gifts (owner, npc, decoration) values (uid, p_npc, gift)
    on conflict on constraint npc_gifts_pkey do nothing;
  get diagnostics inserted_rows = row_count;

  -- Also covers a gift row whose piece was somehow removed: owning is restored, never duplicated.
  insert into public.owned_decorations (owner, decoration) values (uid, gift)
    on conflict on constraint owned_decorations_pkey do nothing;

  return query select g.npc, g.decoration, (inserted_rows = 1)
    from public.npc_gifts g where g.owner = uid and g.npc = p_npc;
end $$;

revoke execute on function public.claim_npc_gift(text) from public, anon;
grant execute on function public.claim_npc_gift(text) to authenticated;
