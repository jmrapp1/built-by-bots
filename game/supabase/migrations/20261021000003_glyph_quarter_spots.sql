-- W6 step 2: the Glyph Quarter region gets spots. NOT applied yet: proof reviews this file first, then reviewer applies it.
--
-- Purely additive: one data row in game_spot_regions (region id 'glyph_quarter', 8 spots, the same count as Inkwood Edge).
-- world_unfold(region, spot) already reads its spot count from this table, so no function, key, column or grant changes.
-- Nothing is dropped, updated or deleted. The client slice that draws the spots is a separate PR, opened after this is applied.

insert into public.game_spot_regions (region, spots) values ('glyph_quarter', 8);
