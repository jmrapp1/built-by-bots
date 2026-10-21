// W5: where today's spots are in the World, as pure functions. A layout is a function of the UTC day and the region only
// (no Math.random, no clock), so it is the same for every visit that day. This decides WHERE a spot is, never what it gives:
// the server picks the find. No text here.
import spots from "@/data/spots.json";
import map from "@/data/map.json";
import { WORLD, HALF, blocked, chunkContents, chunkCircles, chunkOf, type RegionId } from "./worldMap";
import { mulberry32 } from "./margins";

export const SPOTS = spots;
export type WorldSpot = { region: RegionId; id: number; x: number; z: number };
export const REGIONS: RegionId[] = ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"];
export const spotKey = (region: string, id: number) => `${region}:${id}`;

const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Where in the World a region lies (the same split the scenery uses).
export function regionRect(region: RegionId) {
  const e = SPOTS.edge, lo = -HALF + e, hi = HALF - e;
  if (region === "inkwood") return { x0: lo, x1: WORLD.paperDownsX - e, z0: lo, z1: WORLD.inkwoodZ - e };
  if (region === "paper_downs") return { x0: WORLD.paperDownsX + e, x1: hi, z0: lo, z1: WORLD.inkwoodZ - e };
  if (region === "glyph_quarter") return { x0: lo, x1: hi, z0: WORLD.glyphZ + e, z1: hi };
  if (region === "pressmark_shore") return { x0: WORLD.shoreX + e, x1: hi, z0: WORLD.inkwoodZ + e, z1: WORLD.glyphZ - e };
  return { x0: lo, x1: WORLD.shoreX - e, z0: WORLD.inkwoodZ + e, z1: WORLD.glyphZ - e };
}

const circleCache = new Map<string, { x: number; z: number; r: number }[]>();
function circlesNear(x: number, z: number) {
  const out: { x: number; z: number; r: number }[] = [];
  const cx = chunkOf(x), cz = chunkOf(z);
  for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
    const k = `${a},${b}`;
    let c = circleCache.get(k);
    if (!c) { c = chunkCircles(chunkContents(a, b)); circleCache.set(k, c); }
    out.push(...c);
  }
  return out;
}
const free = (x: number, z: number) => !blocked(x, z) && circlesNear(x, z).every((c) => Math.hypot(c.x - x, c.z - z) > c.r + SPOTS.clear);

export function spotsForDay(day: string, region: RegionId): WorldSpot[] {
  const n = SPOTS.counts[region], R = regionRect(region), rnd = mulberry32(hashStr(`${day}:${region}:${WORLD.seed}`));
  const out: WorldSpot[] = [];
  for (let t = 0; t < SPOTS.tries && out.length < n; t++) {
    const x = R.x0 + rnd() * (R.x1 - R.x0), z = R.z0 + rnd() * (R.z1 - R.z0);
    if (!free(x, z) || out.some((s) => Math.hypot(s.x - x, s.z - z) < SPOTS.minGap)) continue;
    out.push({ region, id: out.length, x, z });
  }
  return out;
}
export const allSpotsForDay = (day: string): WorldSpot[] => REGIONS.flatMap((r) => spotsForDay(day, r));

/** The closest unopened spot within reach, or null. */
export function nearestSpot(p: { x: number; z: number }, list: WorldSpot[], opened: ReadonlySet<string>, reach: number = SPOTS.reach): WorldSpot | null {
  let best: WorldSpot | null = null, bd = reach;
  for (const s of list) {
    if (opened.has(spotKey(s.region, s.id))) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}

// ?spots=all|off : dev-only. Ignored in production. `off` hides the spots; nothing here ever calls the server.
export function spotsOverride(search: string, isProduction: boolean): "off" | null {
  if (isProduction) return null;
  return /[?&]spots=off(&|$)/.test(search) ? "off" : null;
}
export const hasSignpostNear = (x: number, z: number) => map.signposts.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5);
