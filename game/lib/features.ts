// E2: the authored feature list and its pure builder. Seeded only; no three.js, clock or storage, and nothing is drawn or saved.
// A feature builds its whole item list from its own seed, independent of chunk edges; a chunk takes the items that fall inside it, so a long
// belt has no seam and building a chunk twice gives the same result. Nothing here is read by chunkContents or the renderer in E2, so the World
// is exactly as before. E3 draws these items (worldShell.ts), only when the switch is on.
import raw from "@/data/features.json";
import map from "@/data/map.json";
import { GARDEN, HOME, type Circle } from "./world";
import { mulberry32 } from "./margins";
import { CHUNKS, HALF, WORLD, TREE_R, ROCK_R, BUSH_R, chunkBounds, distToPath } from "./worldMap";
import type { Item, RegionId } from "./worldMap";

export const FEATURES = raw.features;
export type FeatureItem = Item & { k: "tree" | "rock" | "bush"; f: string };
export type Recipe = { k: "tree" | "rock" | "bush"; s: [number, number]; spacing: number };
type Pt = [number, number];
export type Feature = { id: string; region: RegionId; seed: number; recipe: Recipe } & (
  | { shape: "belt"; points: Pt[]; width: number }
  | { shape: "row"; a: Pt; b: Pt; gaps: [number, number][] }
  | { shape: "ring"; at: Pt; r: number; width: number; opening: [number, number] }
);
export type Limits = { minGap: number; gapWidth: number; perChunk: number };

/** Anything but a plain true is off; never throws. */
export const featuresFlag = (d: unknown): boolean => { try { return (d as { features?: { enabled?: unknown } })?.features?.enabled === true; } catch { return false; } };

/** Is the feature drawing on? The data file decides; in dev builds ?features=1 or ?features=0 overrides it (inert in production). */
export function featuresOn(search: string, production: boolean, data: unknown = raw): boolean {
  if (!production) {
    try {
      const v = new URLSearchParams(search).get("features");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch { /* fall through to the file */ }
  }
  return featuresFlag(data);
}

const RADIUS = { tree: TREE_R, rock: ROCK_R, bush: BUSH_R } as const;
export const itemRadius = (i: { k: "tree" | "rock" | "bush"; s: number }) => RADIUS[i.k] * i.s;

const GATE = GARDEN.places.find((p) => p.kind === "gate");
/** The one shared keep-clear check. True when (x, z) is inside Home (and its margin), on the path, at the gate, on a signpost or at a landmark's foot, widened by `pad` metres. */
export function keepClear(x: number, z: number, pad = 0): boolean {
  const g = HOME.half + WORLD.gardenKeepOut + pad;
  if (Math.abs(x) < g && Math.abs(z) < g) return true;
  if (distToPath(x, z) < WORLD.path.keepOut + pad) return true;
  if (GATE && Math.hypot(GATE.x - x, GATE.z - z) < 4 + pad) return true;
  if (WORLD.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 5 + pad)) return true;
  return map.signposts.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5 + pad);
}

// ---- shapes: each gives candidate positions from the feature's own random stream ----
function catmull(P: Pt[], per = 16): Pt[] {
  const out: Pt[] = [];
  const f = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < per; k++) { const t = k / per; out.push([f(a[0], b[0], c[0], d[0], t), f(a[1], b[1], c[1], d[1], t)]); }
  }
  out.push(P[P.length - 1]);
  return out;
}
function candidates(ft: Feature, rnd: () => number): Pt[] {
  const sp = ft.recipe.spacing, out: Pt[] = [];
  if (ft.shape === "belt") {
    const line = catmull(ft.points);
    const rows = Math.max(1, Math.round(ft.width / sp));
    let carry = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az) || 1e-9, nx = -(bz - az) / L, nz = (bx - ax) / L;
      let d = carry;
      for (; d < L; d += sp) {
        const t = d / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (let r = 0; r < rows; r++) {
          const lat = rows === 1 ? 0 : ((r + 0.5) / rows - 0.5) * ft.width, o = lat + (rnd() - 0.5) * sp * 0.5, al = (rnd() - 0.5) * sp * 0.5;
          out.push([x + nx * o + ((bx - ax) / L) * al, z + nz * o + ((bz - az) / L) * al]);
        }
      }
      carry = d - L;
    }
  } else if (ft.shape === "row") {
    const L = Math.hypot(ft.b[0] - ft.a[0], ft.b[1] - ft.a[1]), n = Math.max(1, Math.floor(L / sp));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (ft.gaps.some(([g0, g1]) => t >= g0 && t <= g1)) continue;
      out.push([ft.a[0] + (ft.b[0] - ft.a[0]) * t + (rnd() - 0.5) * 0.6, ft.a[1] + (ft.b[1] - ft.a[1]) * t + (rnd() - 0.5) * 0.6]);
    }
  } else {
    const rings = Math.max(1, Math.round(ft.width / sp));
    for (let k = 0; k < rings; k++) {
      const rad = ft.r - (rings === 1 ? 0 : (k / (rings - 1)) * ft.width), n = Math.max(3, Math.floor((2 * Math.PI * rad) / sp));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 360 + (rnd() - 0.5) * 8, in0 = ((a % 360) + 360) % 360;
        const [o0, o1] = ft.opening;
        if (o0 <= o1 ? in0 >= o0 && in0 <= o1 : in0 >= o0 || in0 <= o1) continue;
        const rr = rad + (rnd() - 0.5) * 0.6;
        out.push([ft.at[0] + Math.cos((a * Math.PI) / 180) * rr, ft.at[1] + Math.sin((a * Math.PI) / 180) * rr]);
      }
    }
  }
  return out;
}

/** The whole item list of one feature: a pure function of the feature and the limits. Items stay in the World, clear of the keep-clear places and at least `minGap` apart edge to edge. */
export function buildFeature(ft: Feature, limits: Limits = FEATURES.limits): FeatureItem[] {
  const rnd = mulberry32(ft.seed), out: FeatureItem[] = [], k = ft.recipe.k;
  for (const [x, z] of candidates(ft, rnd)) {
    const s = ft.recipe.s[0] + rnd() * (ft.recipe.s[1] - ft.recipe.s[0]), r = rnd() * Math.PI * 2;
    const it: FeatureItem = { x: round(x), z: round(z), s: round(s), r: round(r), k, f: ft.id }, rad = itemRadius(it);
    if (Math.abs(it.x) > HALF - rad - 0.5 || Math.abs(it.z) > HALF - rad - 0.5) continue;
    if (keepClear(it.x, it.z, rad)) continue;
    if (out.some((o) => Math.hypot(o.x - it.x, o.z - it.z) < rad + itemRadius(o) + limits.minGap)) continue;
    out.push(it);
  }
  return out;
}
const round = (v: number) => Math.round(v * 1000) / 1000; // fixed precision so the output is the same text everywhere

const cache = new Map<Feature[], FeatureItem[]>();
/** Every item of a feature list, in list order. Cached per list object (the shipped list is built once). */
export function buildAll(list: Feature[] = FEATURES.list as Feature[], limits: Limits = FEATURES.limits): FeatureItem[] {
  if (limits === FEATURES.limits) { const c = cache.get(list); if (c) return c; }
  const out = list.flatMap((f) => buildFeature(f, limits));
  if (limits === FEATURES.limits) cache.set(list, out);
  return out;
}

/** The items inside one chunk (same half-open bounds as chunkContents; the last chunk takes the far edge). */
export function featureItemsInChunk(ix: number, iz: number, items: FeatureItem[] = buildAll()): FeatureItem[] {
  if (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS) return [];
  const { x0, z0, x1, z1 } = chunkBounds(ix, iz);
  return items.filter((i) => i.x >= x0 && i.x < x1 + (ix === CHUNKS - 1 ? 1 : 0) && i.z >= z0 && i.z < z1 + (iz === CHUNKS - 1 ? 1 : 0));
}
export const featureCircles = (items: FeatureItem[]): Circle[] => items.map((i) => ({ x: i.x, z: i.z, r: itemRadius(i) }));
/** Same cost measure as worldMap.instanceCount: a tree is three draws. */
export const featureInstanceCount = (items: FeatureItem[]) => items.reduce((n, i) => n + (i.k === "tree" ? 3 : 1), 0);
