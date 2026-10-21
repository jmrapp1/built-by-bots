-- Fix for 20261021000005 set_home_decoration: 'on conflict (owner, plot)' raised 42702 (column reference "plot" is ambiguous)
-- because the returns-table output column "plot" is also a variable in scope. The conflict target is now the primary key by name.
-- Same signature, same body otherwise, same grants. Additive (CREATE OR REPLACE of one function). Written, NOT applied; only the reviewer applies it.
-- claim_starter_decorations was checked: its only conflict clause is a bare 'on conflict do nothing', so it is not affected.

create or replace function public.set_home_decoration(p_plot text, p_decoration text)
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
    on conflict on constraint home_decorations_pkey do update set decoration = excluded.decoration, placed_at = now();
  return query select p_plot, p_decoration;
end $$;

revoke execute on function public.set_home_decoration(text, text) from public, anon;
grant execute on function public.set_home_decoration(text, text) to authenticated;
