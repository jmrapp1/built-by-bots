-- Read-back checks for 20261023000001_player_state.sql. Run AFTER applying. NOT run by the builder.
-- Part A is read-only. Part B WRITES, so it is wrapped in a transaction that ends in ROLLBACK, and it needs a
-- signed-in TEST account that owns at least one Print. Do not run Part B against a real player's account.

-- ===== Part A: read-only =====
-- A1. Both tables exist with RLS on.
select relname, relrowsecurity from pg_class where relname in ('player_state', 'print_state') order by 1;
-- A2. One select-own policy each, and no other policy.
select tablename, policyname, cmd, qual from pg_policies where tablename in ('player_state', 'print_state') order by 1, 2;
-- A3. Clients have select only; anon has nothing; authenticated may execute save_state, anon and public may not.
select has_table_privilege('authenticated','public.player_state','select') as ps_select_true,
       has_table_privilege('authenticated','public.player_state','insert') as ps_insert_false,
       has_table_privilege('authenticated','public.player_state','update') as ps_update_false,
       has_table_privilege('authenticated','public.player_state','delete') as ps_delete_false,
       has_table_privilege('authenticated','public.print_state','select') as pr_select_true,
       has_table_privilege('authenticated','public.print_state','insert') as pr_insert_false,
       has_table_privilege('authenticated','public.print_state','update') as pr_update_false,
       has_table_privilege('authenticated','public.print_state','delete') as pr_delete_false,
       has_table_privilege('anon','public.player_state','select') as anon_ps_false,
       has_table_privilege('anon','public.print_state','select') as anon_pr_false,
       has_function_privilege('authenticated','public.save_state(text,float8,float8,float8,float8,jsonb)','execute') as authed_fn_true,
       has_function_privilege('anon','public.save_state(text,float8,float8,float8,float8,jsonb)','execute') as anon_fn_false;
-- A4. save_state is definer with an empty search_path.
select proname, prosecdef, proconfig from pg_proc where proname = 'save_state';
-- A5. The column checks are present.
select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid in ('public.player_state'::regclass, 'public.print_state'::regclass) and contype = 'c' order by 1, 2;

-- ===== Part B: WRITES, inside a rolled-back transaction, test account only =====
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<test uid>","role":"authenticated"}';
--   -- B1. Saves: select public.save_state('garden', 1.5, -2.5, 0.3, 1.0, '[{"id":"<own creature id>","x":2,"z":3,"h":0.5,"m":"rest"}]');
--   --     returns 'saved'. Then: select * from public.player_state; select * from public.print_state;   -- own rows only, values as sent.
--   -- B2. The flood guard: the same call again straight away returns 'skipped' and changes nothing (updated_at is unchanged).
--   -- B3. No direct writes: insert into public.player_state (owner, zone, x, z, heading, yaw) values ('<test uid>','garden',0,0,0,0);
--   --     update public.player_state set x = 1;  delete from public.player_state;  (same three on print_state)
--   --     each raises 'permission denied'.
--   -- B4. Another player's Print id (or a random uuid) in p_prints is silently skipped: no print_state row appears for it.
--   -- B5. Bad input raises 'bad state' and writes nothing: zone 'moon'; null zone; x = 'NaN'::float8; x = 'Infinity'::float8; x = 141;
--   --     heading = 1000; p_prints not an array; 25 Prints; a Print with m = 'hide'; a Print with x = 'NaN' (sent as a string, so it is refused as non-number).
--   --     (Run each after waiting out the flood gap, or from a fresh account, so the refusal is the validation and not the guard.)
--   -- B6. As anon / not signed in: select public.save_state(...) raises 'not signed in' / permission denied.
-- rollback;
