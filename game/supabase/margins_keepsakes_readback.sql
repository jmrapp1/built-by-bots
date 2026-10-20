-- Read-back checks for 20261020000007_margins_keepsakes.sql. Run AFTER applying. NOT run by the builder.
-- Part A is read-only. Part B WRITES, so it is wrapped in a transaction that ends in ROLLBACK (it touches no
-- permanent data), and it needs a signed-in TEST account. Do not run Part B against a real player's account.

-- ===== Part A: read-only =====
-- A1. Both constraints now allow 'keepsake' (and the old four).
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid in ('public.game_margins_finds'::regclass, 'public.margins_claims'::regclass) and contype = 'c' order by 1;
-- A2. The finds table has five kinds; keepsake is the rarest after the egg or close to it (private numbers).
select kind, weight from public.game_margins_finds order by weight;
-- A3. margins_claims has the new nullable column, with its foreign key; existing rows are untouched (cosmetic null).
select count(*) as should_be_zero from public.margins_claims where cosmetic is not null;
select count(*) as claims_unchanged from public.margins_claims;
-- A4. Privileges unchanged: authenticated can execute margins_unfold, anon and public cannot; nobody but the owner
--     can execute grant_keepsake; clients still have select only on margins_claims.
select has_function_privilege('authenticated','public.margins_unfold(int)','execute') as authed_ok_true,
       has_function_privilege('anon','public.margins_unfold(int)','execute') as anon_false,
       has_function_privilege('authenticated','public.grant_keepsake(text)','execute') as grant_false,
       has_table_privilege('authenticated','public.margins_claims','insert') as claims_insert_false;
-- A5. The function is still definer with an empty search_path, and claim_daily_egg is unchanged.
select proname, prosecdef, proconfig from pg_proc where proname in ('margins_unfold','claim_daily_egg','grant_keepsake');

-- ===== Part B: WRITES, inside a rolled-back transaction, test account only =====
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<test uid>","role":"authenticated"}';
--   -- B1. A keepsake is granted. To force the roll in the test only, still inside this transaction as the owner role
--   --     (reset role; update public.game_margins_finds set weight = 100000 where kind = 'keepsake'; set local role authenticated;),
--   --     then: select result, cosmetic from public.margins_unfold(<page>);   -- result 'keepsake', cosmetic one of six
--   --     select cosmetic from public.owned_cosmetics;                         -- the same id, one row
--   --     select worn_cosmetic from public.creatures order by created_at limit 1;  -- the same id
--   -- B2. A repeat grants nothing: select * from public.margins_unfold(<same page>);  -- the same row, same cosmetic
--   --     select count(*) from public.owned_cosmetics;                          -- unchanged
--   -- B3. A seventh case gives food: with all six owned (grant six as the owner role), the next keepsake roll
--   --     returns result 'glyph', cosmetic null, and no new owned row.
--   -- B4. The ceiling still holds: after the daily number of claims, the next page raises 'enough pages for today'
--   --     and writes nothing, and a claim that raises leaves no owned_cosmetics row (the grant rolled back too).
--   -- B5. A player with no creature (egg only) whose roll is keepsake gets 'ink', cosmetic null.
--   -- B6. As anon / not signed in: margins_unfold raises 'not signed in' / permission denied.
-- rollback;
