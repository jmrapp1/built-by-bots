// Night sights in Paper Downs, Inkwood and Glyph Quarter: the same three looks as the Margins and the Shore, laid out in each region's rectangle.
// Looks only: no reward, no server, nothing saved. Data in data/regionSights.json (one block per region, the Shore's block copied).
import raw from "@/data/regionSights.json";
import { checkSights, pickSights, type SightBounds, type SightData, type SightPoint } from "@/lib/sights";
import { spotsForDay, freeAt, regionRect } from "@/lib/worldSpots";
import { hedgeTouches, buildHedges } from "@/lib/features";
import type { RegionId } from "@/lib/worldMap";
import type { Vec } from "@/lib/world";

export type SightRegion = "paper_downs" | "inkwood" | "glyph_quarter";
export const SIGHT_REGIONS: SightRegion[] = ["paper_downs", "inkwood", "glyph_quarter"];
export const REGION_SALT: Record<SightRegion, number> = { paper_downs: 0x5d0e5, inkwood: 0x1a4b0, glyph_quarter: 0x61f9 }; // each differs from the Margins and the Shore
/** A region's rectangle, the same one its folded-page spots use. */
export const regionBounds = (r: SightRegion): SightBounds => regionRect(r as RegionId);
const data = raw as unknown as Record<string, unknown>;
export const REGION_SIGHTS: Record<SightRegion, SightData | null> = {
  paper_downs: checkSights(data.paper_downs, regionBounds("paper_downs")),
  inkwood: checkSights(data.inkwood, regionBounds("inkwood")),
  glyph_quarter: checkSights(data.glyph_quarter, regionBounds("glyph_quarter")),
};

let hedges: ReturnType<typeof buildHedges> | null = null;
/** Usable when nothing grows or stands there, it is clear of the scenery near it and of the hedges, and clear of today's folded-page spots in its region. */
export function regionUsable(p: Vec, pages: Vec[], c: SightData["clear"]): boolean {
  if (!freeAt(p.x, p.z, c.scenery)) return false;
  if (hedgeTouches(p.x, p.z, c.scenery, (hedges ??= buildHedges()), 0)) return false;
  return !pages.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.pages);
}

/** Tonight's sights in one region: the usable points, then the daily pick (no zone spread). */
export function regionSightsForDay(day: string, region: SightRegion, d: SightData): SightPoint[] {
  const pages = spotsForDay(day, region);
  return pickSights(day, d.points.filter((p) => regionUsable(p, pages, d.clear)), d.perNight, { salt: REGION_SALT[region], spread: false });
}
