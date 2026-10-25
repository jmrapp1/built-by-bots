// F1: the grass layer. Pure and seeded: no three.js, clock or storage. A bundle is a position, a scale and a turn; it is walk-through and has no collider,
// so nothing here touches chunkContents, the 260/140 caps, the colliders or reachability. Grass has its own budget (per chunk and for the whole World).
import raw from "@/data/foliage.json";
import { mulberry32 } from "./margins";
import { CHUNKS, HALF, chunkCircles, chunkContents, chunkOf, regionAt } from "./worldMap";
import type { Item, RegionId } from "./worldMap";
import { buildAll, buildHedges, featureCircles, hedgeTouches, keepClear } from "./features";

export type GrassItem = Item & { k: "grass" };
export type FoliageData = { enabled: boolean; seed: number; grassPerChunk: number; grassWorld: number; minGap: number; scale: [number, number]; density: Record<RegionId, number> };
export const FOLIAGE: FoliageData = raw.foliage as unknown as FoliageData;
/** Anything but a plain true is off. */
export const foliageFlag = (d: unknown): boolean => { try { return (d as { foliage?: { enabled?: unknown } })?.foliage?.enabled === true; } catch { return false; } };
/** Footprint radius per unit of scale: only used to space bundles and keep them off solid things. */
export const GRASS_R = 0.3;

const round = (n: number) => Math.round(n * 100) / 100;

/** Thin a list to `cap` by seeded priority (the same items go whatever the order they are asked in), keeping list order. */
export function thin<T>(items: T[], cap: number, prio: (t: T) => number): T[] {
  if (cap <= 0) return [];
  if (items.length <= cap) return items;
  const keep = new Set(items.map((t, i) => [prio(t), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, cap).map(([, i]) => i));
  return items.filter((_, i) => keep.has(i));
}

type Built = { all: GrassItem[]; perChunk: Map<string, GrassItem[]> };
const keyOf = (ix: number, iz: number) => `${ix},${iz}`;

/** Every bundle in the World. A jittered grid in each region with density, kept off the path, landmarks, garden, hedges and solid things, then thinned per chunk and for the World. */
export function buildGrass(d: FoliageData = FOLIAGE): Built {
  const out: Built = { all: [], perChunk: new Map() };
  if (d.enabled !== true || !(d.grassWorld > 0)) return out;
  const rnd = mulberry32(d.seed), hp = buildHedges(), solids = featureCircles(buildAll());
  const chunkSolids = new Map<string, { x: number; z: number; r: number }[]>();
  const solidsIn = (ix: number, iz: number) => { const k = keyOf(ix, iz); let v = chunkSolids.get(k); if (!v) { v = chunkCircles(chunkContents(ix, iz)); chunkSolids.set(k, v); } return v; };
  const byChunk = new Map<string, (GrassItem & { p: number })[]>();
  for (const region of Object.keys(d.density) as RegionId[]) {
    const dens = d.density[region]; if (!(dens > 0)) continue;
    const cell = Math.sqrt(100 / dens);
    for (let gz = -HALF; gz < HALF; gz += cell) for (let gx = -HALF; gx < HALF; gx += cell) {
      const x = round(gx + rnd() * cell), z = round(gz + rnd() * cell), s = d.scale[0] + rnd() * (d.scale[1] - d.scale[0]), r = rnd() * Math.PI * 2, p = rnd();
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      if (regionAt(z, x) !== region) continue;
      if (keepClear(x, z, GRASS_R)) continue;
      if (hedgeTouches(x, z, GRASS_R, hp, 0.2)) continue;
      const ix = chunkOf(x), iz = chunkOf(z);
      let hit = solids.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + GRASS_R);
      for (let a = Math.max(0, ix - 1); !hit && a <= Math.min(CHUNKS - 1, ix + 1); a++) for (let b = Math.max(0, iz - 1); !hit && b <= Math.min(CHUNKS - 1, iz + 1); b++) hit = solidsIn(a, b).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + GRASS_R);
      if (hit) continue;
      const it = { x, z, s: round(s), r: round(r), k: "grass" as const, p };
      const key = keyOf(ix, iz), list = byChunk.get(key) ?? []; byChunk.set(key, list);
      if (list.some((o) => Math.hypot(o.x - x, o.z - z) < 2 * GRASS_R * Math.max(o.s, it.s) + d.minGap)) continue;
      list.push(it);
    }
  }
  const kept: (GrassItem & { p: number })[] = [];
  for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) { const l = byChunk.get(keyOf(a, b)); if (l) kept.push(...thin(l, d.grassPerChunk, (t) => t.p)); }
  const world = thin(kept, d.grassWorld, (t) => t.p);
  for (const t of world) {
    const it: GrassItem = { x: t.x, z: t.z, s: t.s, r: t.r, k: "grass" };
    out.all.push(it);
    const key = keyOf(chunkOf(t.x), chunkOf(t.z)), l = out.perChunk.get(key) ?? []; out.perChunk.set(key, l); l.push(it);
  }
  return out;
}
let cache: Built | null = null;
export const shippedGrass = (): Built => (cache ??= buildGrass());
/** The bundles of one chunk (a bundle belongs to the chunk its position is in). */
export const grassInChunk = (ix: number, iz: number, b: Built = shippedGrass()): GrassItem[] => (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS ? [] : b.perChunk.get(keyOf(ix, iz)) ?? []);
