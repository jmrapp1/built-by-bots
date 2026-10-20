-- Keepsake picker, server side (slice 6e-1): the one way a player chooses which owned keepsake a Print wears.
-- Written, NOT applied. Only the reviewer applies it, after @proof has read the SQL.
-- Purely additive: one new function. No table, column, policy, constraint or existing function is touched.
-- grant_keepsake and margins_unfold are unchanged.
-- Rules, all enforced here and never by the client:
--   * Signed-in accounts only. Anonymous sessions and anon are refused.
--   * The caller must own the Print (creatures.owner = the caller). Another player's Print looks the same as a missing one.
--   * The keepsake must be one the caller owns (a row in owned_cosmetics), or null to take it off. The client never grants.
--   * It sets worn_cosmetic on that one Print and nothing else, and returns the stored value.
--   * Safe to call repeatedly: it stores the same value again, and the Print row is locked so two fast calls cannot interleave.
-- How it fits with the automatic newest-first choice (decision, for review):
--   * An explicit choice sticks. Nothing but a later find changes it.
--   * A later find still wears the newly found keepsake automatically (grant_keepsake, unchanged), so a choice is an override
--     that lasts until the next find. It is not a setting that stops finds from being worn.
--   * null means "wear nothing", not "go back to automatic". There is no stored automatic mode, so nothing else could undo it.
--   * Which Print wears what is per Print (worn_cosmetic lives on creatures). Owning is per player, so any owned keepsake
--     can be worn on any of the player's Prints. The same keepsake may be worn on two Prints at once; that is allowed.

create function public.set_worn_cosmetic(p_creature uuid, p_cosmetic text)
returns table (worn_cosmetic text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'sign in with an account'; end if;

  -- Lock the caller's own Print row; a second call waits here.
  select c.id into cid from public.creatures c where c.id = p_creature and c.owner = uid for update;
  if cid is null then raise exception 'no such Print'; end if;

  if p_cosmetic is not null and not exists (
    select 1 from public.owned_cosmetics o where o.owner = uid and o.cosmetic = p_cosmetic
  ) then raise exception 'you do not have that keepsake'; end if;

  update public.creatures c set worn_cosmetic = p_cosmetic where c.id = cid;
  return query select p_cosmetic;
end $$;

revoke execute on function public.set_worn_cosmetic(uuid, text) from public, anon;
grant execute on function public.set_worn_cosmetic(uuid, text) to authenticated;
