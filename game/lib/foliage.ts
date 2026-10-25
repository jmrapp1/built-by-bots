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
export type BloomItem = Item & { k: "bloom"; v: number };
export type BloomData = { enabled: boolean; seed: number; bloomsPerChunk: number; bloomsWorld: number; minGap: number; scale: [number, number]; density: Record<RegionId, number>; palette: string[] };
export const BLOOMS: BloomData = (raw as unknown as { blooms: BloomData }).blooms;
/** Anything but a plain true is off. Independent of the grass switch. */
export const bloomsFlag = (d: unknown): boolean => { try { return (d as { blooms?: { enabled?: unknown } })?.blooms?.enabled === true; } catch { return false; } };
/** Footprint radius per unit of scale, for spacing and keeping off solid things. */
export const BLOOM_R = 0.3;
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
type Spec = { enabled: boolean; seed: number; perChunk: number; world: number; minGap: number; scale: [number, number]; density: Record<RegionId, number> };
const keyOf = (ix: number, iz: number) => `${ix},${iz}`;

/** The shared placement: a jittered grid in each region with density, kept off the path, landmarks, garden, hedges and solid things, then thinned per chunk and for the World.
 *  `variants` > 0 draws one more number per item (a colour group); 0 draws none, so the grass scatter is exactly as it was. */
function scatter<T extends Item & { k: string }>(d: Spec, k: T["k"], R: number, variants: number): { all: T[]; perChunk: Map<string, T[]> } {
  const out: { all: T[]; perChunk: Map<string, T[]> } = { all: [], perChunk: new Map() };
  if (d.enabled !== true || !(d.world > 0)) return out;
  const rnd = mulberry32(d.seed), hp = buildHedges(), solids = featureCircles(buildAll());
  const chunkSolids = new Map<string, { x: number; z: number; r: number }[]>();
  const solidsIn = (ix: number, iz: number) => { const k2 = keyOf(ix, iz); let v = chunkSolids.get(k2); if (!v) { v = chunkCircles(chunkContents(ix, iz)); chunkSolids.set(k2, v); } return v; };
  type P = Item & { k: string; p: number; v?: number };
  const byChunk = new Map<string, P[]>();
  for (const region of Object.keys(d.density) as RegionId[]) {
    const dens = d.density[region]; if (!(dens > 0)) continue;
    const cell = Math.sqrt(100 / dens);
    for (let gz = -HALF; gz < HALF; gz += cell) for (let gx = -HALF; gx < HALF; gx += cell) {
      const x = round(gx + rnd() * cell), z = round(gz + rnd() * cell), s = d.scale[0] + rnd() * (d.scale[1] - d.scale[0]), r = rnd() * Math.PI * 2, p = rnd();
      const v = variants > 0 ? Math.min(variants - 1, Math.floor(rnd() * variants)) : undefined;
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      if (regionAt(z, x) !== region) continue;
      if (keepClear(x, z, R)) continue;
      if (hedgeTouches(x, z, R, hp, 0.2)) continue;
      const ix = chunkOf(x), iz = chunkOf(z);
      let hit = solids.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + R);
      for (let a = Math.max(0, ix - 1); !hit && a <= Math.min(CHUNKS - 1, ix + 1); a++) for (let b = Math.max(0, iz - 1); !hit && b <= Math.min(CHUNKS - 1, iz + 1); b++) hit = solidsIn(a, b).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + R);
      if (hit) continue;
      const it: P = { x, z, s: round(s), r: round(r), k, p, v };
      const key = keyOf(ix, iz), list = byChunk.get(key) ?? []; byChunk.set(key, list);
      if (list.some((o) => Math.hypot(o.x - x, o.z - z) < 2 * R * Math.max(o.s, it.s) + d.minGap)) continue;
      list.push(it);
    }
  }
  const kept: P[] = [];
  for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) { const l = byChunk.get(keyOf(a, b)); if (l) kept.push(...thin(l, d.perChunk, (t) => t.p)); }
  for (const t of thin(kept, d.world, (t) => t.p)) {
    const it = (t.v === undefined ? { x: t.x, z: t.z, s: t.s, r: t.r, k } : { x: t.x, z: t.z, s: t.s, r: t.r, k, v: t.v }) as unknown as T;
    out.all.push(it);
    const key = keyOf(chunkOf(t.x), chunkOf(t.z)), l = out.perChunk.get(key) ?? []; out.perChunk.set(key, l); l.push(it);
  }
  return out;
}

/** Every bundle in the World. */
export function buildGrass(d: FoliageData = FOLIAGE): Built {
  return scatter<GrassItem>({ enabled: d.enabled, seed: d.seed, perChunk: d.grassPerChunk, world: d.grassWorld, minGap: d.minGap, scale: d.scale, density: d.density }, "grass", GRASS_R, 0);
}
let cache: Built | null = null;
export const shippedGrass = (): Built => (cache ??= buildGrass());
/** The bundles of one chunk (a bundle belongs to the chunk its position is in). */
export const grassInChunk = (ix: number, iz: number, b: Built = shippedGrass()): GrassItem[] => (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS ? [] : b.perChunk.get(keyOf(ix, iz)) ?? []);

// F2: blooms, small flower clumps. Same rules as the grass, own seed, own caps, own cache. Walk-through, no collider, nothing in chunkContents.
export type BloomBuilt = { all: BloomItem[]; perChunk: Map<string, BloomItem[]> };
export function buildBlooms(d: BloomData = BLOOMS): BloomBuilt {
  const n = Array.isArray(d.palette) ? d.palette.length : 0;
  if (n < 1) return { all: [], perChunk: new Map() };
  return scatter<BloomItem>({ enabled: d.enabled, seed: d.seed, perChunk: d.bloomsPerChunk, world: d.bloomsWorld, minGap: d.minGap, scale: d.scale, density: d.density }, "bloom", BLOOM_R, n);
}
let bloomCache: BloomBuilt | null = null;
export const shippedBlooms = (): BloomBuilt => (bloomCache ??= buildBlooms());
export const bloomsInChunk = (ix: number, iz: number, b: BloomBuilt = shippedBlooms()): BloomItem[] => (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS ? [] : b.perChunk.get(keyOf(ix, iz)) ?? []);
