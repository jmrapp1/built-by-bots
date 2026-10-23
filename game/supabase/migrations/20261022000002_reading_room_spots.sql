-- S34 step 1: the Reading Room region gets spots. NOT applied yet: proof reviews this file first, then reviewer applies it.
--
-- Purely additive: one data row in game_spot_regions (region id 'reading_room', 6 spots: 4 by day, 2 at dusk).
-- world_unfold(region, spot) already reads its spot count from this table, so no function, key, column, grant or find kind changes.
-- Nothing is dropped, updated or deleted. The client slice that draws the room is a separate PR, opened after this is applied.

insert into public.game_spot_regions (region, spots) values ('reading_room', 6);
