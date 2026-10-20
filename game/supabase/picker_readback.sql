-- Read-back checks for 20261020000008_set_worn_cosmetic.sql. Run by the reviewer AFTER applying.
-- Part A is read-only and safe on the live database. Part B writes, so it runs only inside a transaction that is rolled back,
-- and only for a test account (never a real player).
-- A1. The function exists once, is security definer, with an empty search_path.
select proname, prosecdef as should_be_true, proconfig as should_contain_search_path_empty
  from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_worn_cosmetic';
-- A2. Privileges: anon false, authenticated true. grant_keepsake is still not callable by clients (both false).
select has_function_privilege('anon','public.set_worn_cosmetic(uuid,text)','execute') as anon_exec_should_be_false,
       has_function_privilege('authenticated','public.set_worn_cosmetic(uuid,text)','execute') as authed_exec_should_be_true,
       has_function_privilege('authenticated','public.grant_keepsake(text)','execute') as grant_authed_should_be_false,
       has_function_privilege('anon','public.grant_keepsake(text)','execute') as grant_anon_should_be_false;
-- A3. Nothing else changed: clients still cannot write worn_cosmetic directly (false), creatures unchanged.
select has_column_privilege('authenticated','public.creatures','worn_cosmetic','update') as col_upd_should_be_false;
select count(*) as creatures_unchanged from public.creatures;
-- Part B (test account only; begin; ... rollback;). With: set local role authenticated; set local request.jwt.claims = '{"sub":"<test uid>"}';
--   select * from public.set_worn_cosmetic('<test creature>', null);          -- ok, returns null (wear nothing)
--   select * from public.set_worn_cosmetic('<test creature>', 'lantern');     -- must fail: you do not have that keepsake (if not owned)
--   (as owner role, claims still set) insert into public.owned_cosmetics (owner, cosmetic) values ('<test uid>', 'lantern');
--   select * from public.set_worn_cosmetic('<test creature>', 'lantern');     -- ok, returns lantern; call twice: same result
--   select * from public.set_worn_cosmetic('<test creature>', null);          -- ok, back to nothing
--   select * from public.set_worn_cosmetic('<someone else''s creature>', null); -- must fail: no such Print
--   select * from public.set_worn_cosmetic('00000000-0000-0000-0000-000000000000', null); -- must fail: no such Print
--   set local request.jwt.claims = '{}'; select * from public.set_worn_cosmetic('<test creature>', null); -- must fail: not signed in
--   rollback;
