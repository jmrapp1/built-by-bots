-- Read-back checks for 20261022000002_reading_room_spots.sql. Run AFTER applying. NOT run by the builder. All read-only.
-- R1. The new row exists with 6 spots; the other regions are unchanged (margins 12, meadow 4, inkwood 8, pressmark_shore 8, glyph/paper regions as before).
select region, spots from public.game_spot_regions order by region;
-- R2. Exactly one reading_room row.
select count(*) as reading_room_rows from public.game_spot_regions where region = 'reading_room';
-- R3. Privileges unchanged: authenticated may execute world_unfold, anon may not; clients cannot write the region table or claims.
select has_function_privilege('authenticated','public.world_unfold(text,int)','execute') as authed_true,
       has_function_privilege('anon','public.world_unfold(text,int)','execute') as anon_false,
       has_table_privilege('authenticated','public.game_spot_regions','insert') as regions_insert_false,
       has_table_privilege('authenticated','public.margins_claims','insert') as claims_insert_false;
-- R4. No claim rows exist yet for the new region (nothing should have written to it).
select count(*) as reading_room_claims from public.margins_claims where region = 'reading_room';
