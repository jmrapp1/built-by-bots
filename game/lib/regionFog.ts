// E1: fog that differs by region, as one pure function of x and z. No three.js, clock or storage; nothing is saved.
// The pair [near, far] is a blend of the five regions' pairs. The weights use the same bands as the ground colours in worldShell.ts
// (14 m either side of the Inkwood/Downs edge and 16 m either side of the Glyph and Shore edges), so fog and ground change together and never step.
import raw from "@/data/regionFog.json";
import { WORLD, type RegionId } from "@/lib/worldMap";

export const REGION_FOG = raw.regionFog;
export type FogPair = [number, number];

/** Anything but a plain true is off; never throws. */
export const regionFogFlag = (d: unknown): boolean => { try { return (d as { regionFog?: { enabled?: unknown } })?.regionFog?.enabled === true; } catch { return false; } };
/** Is region fog on? The data file decides; in dev builds ?regionfog=1 or ?regionfog=0 overrides it (inert in production). */
export function regionFogOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("regionfog");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return regionFogFlag(data);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const soft = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
const BLEND = 16;
/** How much each region counts at x, z. Sums to 1. Mirrors the vertex-colour blend of the ground in worldShell.ts. */
export function regionWeights(x: number, z: number): Record<RegionId, number> {
  const north = clamp01((WORLD.inkwoodZ + 14 - z) / 28), east = clamp01((x - WORLD.paperDownsX + 14) / 28), south = soft((z - WORLD.glyphZ + BLEND) / (BLEND * 2));
  const shore = soft((x - WORLD.shoreX + BLEND) / (BLEND * 2)) * (1 - north) * (1 - south);
  // the ground lerps meadow -> inkwood (north) -> downs (north*east) -> glyph (south) -> shore, each in turn; the weights follow the same steps
  const w: Record<RegionId, number> = { meadow: 1, inkwood: 0, paper_downs: 0, glyph_quarter: 0, pressmark_shore: 0 };
  const mix = (k: RegionId, t: number) => { for (const r of Object.keys(w) as RegionId[]) w[r] *= 1 - t; w[k] += t; };
  mix("inkwood", north); mix("paper_downs", north * east); mix("glyph_quarter", south); mix("pressmark_shore", shore);
  return w;
}

/** The fog pair at x, z. With region fog off, or for a bad value, exactly today's global pair. Far is never beyond today's far, and near stays at least 10 m below far. */
export function fogAt(x: number, z: number, on: boolean, data: typeof REGION_FOG = REGION_FOG): FogPair {
  const base: FogPair = [WORLD.fog[0], WORLD.fog[1]];
  if (!on || !Number.isFinite(x) || !Number.isFinite(z)) return base;
  const w = regionWeights(x, z);
  let n = 0, f = 0;
  for (const r of Object.keys(w) as RegionId[]) { const p = data.regions[r]; n += w[r] * p[0]; f += w[r] * p[1]; }
  f = Math.min(base[1], Math.max(30, f));
  return [Math.min(n, f - 10), f];
}
