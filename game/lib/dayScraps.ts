// Day scraps across the World: a few loose bits of paper that lie somewhere new each UTC day, in every region.
// Same paper, glyph marks and slow lift as the Garden scraps (components/glyphScraps.ts). Looks only: not collectable,
// no reward, no server, nothing saved. Where they lie is a function of the UTC day and the region only
// (no Math.random, no clock), so a reload the same day shows the same ones. Numbers are in data/dayScraps.json.
import raw from "@/data/dayScraps.json";
import scraps from "@/data/scraps.json";
import { mulberry32 } from "@/lib/margins";
import { dayNumber } from "@/lib/npcs";
import { REGIONS, freeAt, regionRect, spotsForDay } from "@/lib/worldSpots";
import { hedgeTouches, buildHedges, buildAll, featureCircles, keepClear } from "@/lib/features";
import type { RegionId } from "@/lib/worldMap";
import type { GlyphBit } from "@/lib/scraps";

export const DAY_SCRAPS = raw;
export const DAY_SCRAP_SALT = 0x5c2a9;
type P = { x: number; z: number };

let hedges: ReturnType<typeof buildHedges> | null = null, feats: ReturnType<typeof featureCircles> | null = null;
/** A scrap may lie here when nothing grows or stands there, it is clear of the hedges, the path, Home, the gate, the landmarks and the signposts, today's folded-page spots, and the Garden's own scraps. */
export function dayScrapUsable(p: P, pages: P[], c = raw.clear): boolean {
  if (!freeAt(p.x, p.z, c.scenery)) return false;
  if (hedgeTouches(p.x, p.z, c.scenery, (hedges ??= buildHedges()), 0)) return false;
  if ((feats ??= featureCircles(buildAll())).some((f) => Math.hypot(f.x - p.x, f.z - p.z) <= f.r + c.scenery)) return false; // built features (props, ponds) too
  if (keepClear(p.x, p.z, c.keep)) return false;
  if (pages.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.pages)) return false;
  return !scraps.points.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.garden);
}

/** Today's scraps in one region. */
export function dayScrapsInRegion(day: string, region: RegionId): P[] {
  const n = dayNumber(day);
  if (n === null) return [];
  const R = regionRect(region), pages = spotsForDay(day, region);
  const rnd = mulberry32((Math.imul(n + 1, 2654435761) ^ DAY_SCRAP_SALT ^ (REGIONS.indexOf(region) + 1) * 0x9e3779b1) >>> 0);
  const out: P[] = [];
  for (let t = 0; t < raw.tries && out.length < raw.counts[region]; t++) {
    const p = { x: R.x0 + rnd() * (R.x1 - R.x0), z: R.z0 + rnd() * (R.z1 - R.z0) };
    if (out.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < raw.minGap) || !dayScrapUsable(p, pages)) continue;
    out.push(p);
  }
  return out;
}

/** Today's scraps as drawable bits (a fixed glyph and angle from the day and the order). */
export function dayScrapBits(day: string): GlyphBit[] {
  const n = dayNumber(day) ?? 0;
  const all = REGIONS.flatMap((r) => dayScrapsInRegion(day, r));
  return all.map((p, i) => ({
    x: p.x, z: p.z,
    glyph: (n + i * 5) % scraps.glyphs.length,
    yaw: (((n + 1) * 1.7 + i * 2.399963) % (Math.PI * 2)),
    phase: ((i * 0.618034) % 1) * Math.PI * 2,
  }));
}
