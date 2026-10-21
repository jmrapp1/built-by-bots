-- Read-back checks for 20261021000001_world_spots.sql. Run AFTER applying. NOT run by the builder.
-- Part A is read-only. Part B WRITES, so it is wrapped in a transaction that ends in ROLLBACK, and it needs a
-- signed-in TEST account. Do not run Part B against a real player's account.

-- ===== Part A: read-only =====
-- A1. Three regions: margins 12, meadow 4, inkwood 8.
select region, spots from public.game_spot_regions order by region;
-- A2. margins_claims has the region column; every existing row is 'margins'; the row count is unchanged.
select region, count(*) from public.margins_claims group by region;
-- A3. The key is (owner, day, region, spot); the spot check is 0..63.
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.margins_claims'::regclass order by 1;
-- A4. Privileges: authenticated may execute both functions, anon and public may not; clients have select only.
select has_function_privilege('authenticated','public.world_unfold(text,int)','execute') as authed_world_true,
       has_function_privilege('anon','public.world_unfold(text,int)','execute') as anon_world_false,
       has_function_privilege('authenticated','public.margins_unfold(int)','execute') as authed_margins_true,
       has_function_privilege('anon','public.margins_unfold(int)','execute') as anon_margins_false,
       has_table_privilege('authenticated','public.margins_claims','insert') as claims_insert_false,
       has_table_privilege('authenticated','public.game_spot_regions','insert') as regions_insert_false;
-- A5. Both functions are definer with an empty search_path.
select proname, prosecdef, proconfig from pg_proc where proname in ('margins_unfold','world_unfold');

-- ===== Part B: WRITES, inside a rolled-back transaction, test account only =====
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<test uid>","role":"authenticated"}';
--   -- B1. The gate still works: select * from public.margins_unfold(3);   -- region 'margins', spot 3
--   --     A repeat returns the same row and adds none.
--   -- B2. A World spot: select * from public.world_unfold('inkwood', 3);  -- region 'inkwood'
--   --     The same spot number in 'meadow' is a separate claim; a repeat of either returns its first row.
--   -- B3. Unknown region, null region, spot out of range (meadow 4, inkwood 8, margins 12) each raise 'no such page'
--   --     and write nothing.
--   -- B4. The ceiling counts all regions together: after the daily number of claims across margins, meadow and inkwood,
--   --     the next one raises 'enough pages for today' and writes nothing.
--   -- B5. As anon / not signed in: both functions raise 'not signed in' / permission denied.
-- rollback;
