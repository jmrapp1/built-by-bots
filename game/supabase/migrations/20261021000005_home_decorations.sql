-- Decor S3, server side: placed decorations on the Home plots persist per account.
-- Written, NOT applied. Only the reviewer applies it, after @proof has read the SQL.
-- Purely additive: four new tables and two new functions. No existing table, column, policy or function is touched.
-- Ids mirror game/data/decor.json (plots and decorations). A later weekly drop adds rows by a new migration.
-- Rules, all enforced here and never by the client:
--   * Signed-in accounts only. Anonymous sessions and anon are refused.
--   * Clients can only SELECT their own rows. All writes go through the two functions below (no insert/update/delete grants).
--   * set_home_decoration: the plot must exist, the piece must exist, fit the plot's kind (floor/wall) and be owned by the caller,
--     or null to clear the plot. One piece per plot per account (primary key owner+plot). The same owned piece may stand on
--     several plots (owning is per account, not used up by placing).
--   * claim_starter_decorations: idempotent. Gives the caller the starter pieces (game_decorations.starter) and nothing else.
--     Starters are free, so this is not a reward path. No other grant path exists yet.
--   * The caller's own placed rows are locked while changing, so two fast calls cannot interleave.

create table public.game_plots (
  id text primary key,
  kind text not null check (kind in ('floor', 'wall'))
);
create table public.game_decorations (
  id text primary key,
  name text not null,
  fits text not null check (fits in ('floor', 'wall')),
  starter boolean not null default false
);
insert into public.game_plots (id, kind) values
  ('north-left', 'floor'), ('north-mid', 'floor'), ('north-right', 'floor'),
  ('floor-left', 'floor'), ('floor-right', 'floor'), ('west-wall', 'wall');
insert into public.game_decorations (id, name, fits, starter) values
  ('lantern-post', 'Paper lantern post', 'floor', true), ('bench', 'Bench', 'floor', true),
  ('books', 'Stack of books', 'floor', true), ('ink-rug', 'Ink-blot rug', 'floor', true),
  ('flower-patch', 'Flower patch', 'floor', true), ('framed-page', 'Framed page', 'wall', true);

create table public.owned_decorations (
  owner uuid not null references auth.users (id) on delete cascade,
  decoration text not null references public.game_decorations (id),
  found_at timestamptz not null default now(),
  primary key (owner, decoration)
);
create table public.home_decorations (
  owner uuid not null references auth.users (id) on delete cascade,
  plot text not null references public.game_plots (id),
  decoration text not null references public.game_decorations (id),
  placed_at timestamptz not null default now(),
  primary key (owner, plot)
);

alter table public.game_plots enable row level security;
alter table public.game_decorations enable row level security;
alter table public.owned_decorations enable row level security;
alter table public.home_decorations enable row level security;
create policy "read plots" on public.game_plots for select to authenticated using (true);
create policy "read decorations" on public.game_decorations for select to authenticated using (true);
create policy "own decorations" on public.owned_decorations for select to authenticated using (owner = (select auth.uid()));
create policy "own home decorations" on public.home_decorations for select to authenticated using (owner = (select auth.uid()));
revoke all on public.game_plots, public.game_decorations, public.owned_decorations, public.home_decorations from anon, authenticated;
grant select on public.game_plots, public.game_decorations, public.owned_decorations, public.home_decorations to authenticated;

create function public.claim_starter_decorations()
returns table (decoration text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;
  insert into public.owned_decorations (owner, decoration)
    select uid, d.id from public.game_decorations d where d.starter
    on conflict do nothing;
  return query select o.decoration from public.owned_decorations o where o.owner = uid order by o.decoration;
end $$;

create function public.set_home_decoration(p_plot text, p_decoration text)
returns table (plot text, decoration text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pkind text;
  dfits text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  select g.kind into pkind from public.game_plots g where g.id = p_plot;
  if pkind is null then raise exception 'no such plot'; end if;

  -- Serialise this account's placements (advisory lock on the account; released at transaction end).
  perform pg_advisory_xact_lock(hashtextextended('home_decor:' || uid::text, 0));

  if p_decoration is null then
    delete from public.home_decorations h where h.owner = uid and h.plot = p_plot;
    return query select p_plot, null::text;
    return;
  end if;

  select d.fits into dfits from public.game_decorations d where d.id = p_decoration;
  if dfits is null then raise exception 'no such decoration'; end if;
  if dfits <> pkind then raise exception 'that does not fit this spot'; end if;
  if not exists (select 1 from public.owned_decorations o where o.owner = uid and o.decoration = p_decoration) then
    raise exception 'you do not have that decoration';
  end if;

  insert into public.home_decorations (owner, plot, decoration) values (uid, p_plot, p_decoration)
    on conflict (owner, plot) do update set decoration = excluded.decoration, placed_at = now();
  return query select p_plot, p_decoration;
end $$;

revoke execute on function public.claim_starter_decorations() from public, anon;
grant execute on function public.claim_starter_decorations() to authenticated;
revoke execute on function public.set_home_decoration(text, text) from public, anon;
grant execute on function public.set_home_decoration(text, text) to authenticated;
