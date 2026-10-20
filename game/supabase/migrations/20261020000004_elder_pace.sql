-- Growth pace: elder becomes a multi-day goal.
-- Only the elder row of game_stages changes:
--   min_age_seconds 86400 -> 259200 (3 days)
--   min_care        60    -> 120
-- Blot, sprout and full form stay as they are. Food care values stay as they are.
-- Data only: no function, grant, policy, table or creatures change.
-- Existing Prints keep their stage (the growth function only moves a Print forward),
-- so nothing goes backwards; an elder-bound Print simply has further to go.
-- Idempotent: running it twice gives the same result.

update public.game_stages
set min_age_seconds = 259200, min_care = 120
where id = 'elder';
