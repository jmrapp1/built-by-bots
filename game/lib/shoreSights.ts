// Night sights on Pressmark Shore (slice T2): the same three looks as the Margins (moth-pages, lantern ink, night glints),
// laid out in the shore rectangle. Looks only: no reward, no server, nothing saved. Data in data/shoreSights.json.
// The hour window, fade and the data check are shared with lib/sights.ts; only the bounds, the usable test and the seed differ.
import raw from "@/data/shoreSights.json";
import { checkSights, pickSights, type SightBounds, type SightData, type SightPoint } from "@/lib/sights";
import { WORLD, HALF } from "@/lib/worldMap";
import { freeAt, spotsForDay } from "@/lib/worldSpots";
import type { Vec } from "@/lib/world";

// The shore: x from shoreX to the edge, z from the north band to the glyph band, 2 m in from every edge.
export const SHORE_BOUNDS: SightBounds = { x0: WORLD.shoreX + 2, x1: HALF - 2, z0: WORLD.inkwoodZ + 2, z1: WORLD.glyphZ - 2 };
export const SHORE_SALT = 0x5407e; // a different seed from the Margins, so the two areas do not pick alike
export const SHORE_SIGHTS: SightData | null = checkSights(raw, SHORE_BOUNDS);

// Usable when nothing grows or stands there (blocked(): the garden, the path, landmarks, signposts), it is clear of the
// scenery circles near it, and it is clear of today's shore folded-page spots. `clear.npc` and `clear.gatePath` are unused here.
export function shoreUsable(p: Vec, pages: Vec[], c: SightData["clear"]): boolean {
  if (!freeAt(p.x, p.z, c.scenery)) return false;
  return !pages.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.pages);
}

// Tonight's shore sights: the usable points, then the daily pick (no zone spread: one region).
export function shoreSightsForDay(day: string, d: SightData): SightPoint[] {
  const pages = spotsForDay(day, "pressmark_shore");
  return pickSights(day, d.points.filter((p) => shoreUsable(p, pages, d.clear)), d.perNight, { salt: SHORE_SALT, spread: false });
}
