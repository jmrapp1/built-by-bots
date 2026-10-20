-- Read-back checks for 20261020000006_keepsakes.sql. Run by the reviewer AFTER applying, in the SQL editor.
-- Replace nothing; the 'test' user steps need a signed-in test account (use set local role / request.jwt.claims).
-- 1. Additive: all existing creatures still have a null worn_cosmetic.
select count(*) as should_be_zero from public.creatures where worn_cosmetic is not null;
-- 2. Six catalogue rows, RLS on for both tables.
select count(*) as should_be_6 from public.game_cosmetics;
select relname, relrowsecurity as should_be_true from pg_class where relname in ('game_cosmetics','owned_cosmetics');
-- 3. Clients have no write privilege (all should be false).
select has_table_privilege('authenticated','public.owned_cosmetics','insert') as ins,
       has_table_privilege('authenticated','public.owned_cosmetics','update') as upd,
       has_column_privilege('authenticated','public.creatures','worn_cosmetic','update') as col_upd,
       has_function_privilege('anon','public.grant_keepsake(text)','execute') as anon_exec;
-- 4. As a test user (begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>"}'; ...):
--    update public.creatures set worn_cosmetic = 'ribbon';   -- must fail: permission denied
--    insert into public.owned_cosmetics values ('<uid>','ribbon'); -- must fail
--    select * from public.grant_keepsake('margins');  -- x6: six different ids, each sets worn_cosmetic; 7th: duplicate true, food 1
--    select * from public.grant_keepsake('ribbon');   -- must fail: unknown keepsake source
--    Then rollback; (or delete that test user's owned_cosmetics rows and reset worn_cosmetic by hand as admin).
-- 5. Another user's owned_cosmetics rows are not visible to this user.
