// E2: the authored feature list and its pure builder. Seeded only; no three.js, clock or storage, and nothing is drawn or saved.
// A feature builds its whole item list from its own seed, independent of chunk edges; a chunk takes the items that fall inside it, so a long
// belt has no seam and building a chunk twice gives the same result. Nothing here is read by chunkContents or the renderer in E2, so the World
// is exactly as before. E3 draws these items (worldShell.ts), only when the switch is on.
import raw from "@/data/features.json";
import map from "@/data/map.json";
import { GARDEN, HOME, type Box, type Circle } from "./world";
import { mulberry32 } from "./margins";
import { CHUNKS, HALF, WORLD, TREE_R, ROCK_R, BUSH_R, chunkBounds, chunkCircles, chunkContents, chunkOf, distToPath } from "./worldMap";
import { regionAt } from "./worldMap";
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

// ---- E4: hedgerows. Straight, axis-aligned runs drawn as boxes with box colliders. Pure, seedless (no randomness needed). ----
export type Hedge = { id: string; region: RegionId; a: Pt; b: Pt; thick: number; h: number; gaps: [number, number][] };
export type HedgePiece = Box & { h: number; f: string };
export const HEDGES = ((raw.features as unknown as { hedges?: Hedge[] }).hedges ?? []);
const PIECE = 4, MIN_RUN = 1.5; // long runs are cut into 4 m pieces so each sits on the ground and belongs to one chunk

/** The pieces of one hedge: open stretches along a to b, minus the gaps and anything the keep-clear check rejects, cut into short boxes. */
export function buildHedge(hd: Hedge): HedgePiece[] {
  const alongX = hd.a[1] === hd.b[1], L = alongX ? Math.abs(hd.b[0] - hd.a[0]) : Math.abs(hd.b[1] - hd.a[1]);
  const dir = alongX ? Math.sign(hd.b[0] - hd.a[0]) || 1 : Math.sign(hd.b[1] - hd.a[1]) || 1, at = (d: number): Pt => (alongX ? [hd.a[0] + dir * d, hd.a[1]] : [hd.a[0], hd.a[1] + dir * d]);
  const open = (d: number) => {
    const t = d / L; if (hd.gaps.some(([g0, g1]) => t > g0 && t < g1)) return false;
    const [x, z] = at(d); return Math.abs(x) <= HALF - hd.thick && Math.abs(z) <= HALF - hd.thick && !keepClear(x, z, hd.thick / 2 + 0.5);
  };
  const runs: [number, number][] = []; let start: number | null = null;
  for (let d = 0; d <= L + 1e-9; d += 0.25) { if (open(d)) { if (start === null) start = d; } else if (start !== null) { runs.push([start, d - 0.25]); start = null; } }
  if (start !== null) runs.push([start, L]);
  const out: HedgePiece[] = [];
  for (const [r0, r1] of runs) {
    if (r1 - r0 < MIN_RUN) continue;
    const n = Math.max(1, Math.ceil((r1 - r0) / PIECE)), len = (r1 - r0) / n;
    for (let i = 0; i < n; i++) {
      const [cx, cz] = at(r0 + len * (i + 0.5)), w = len + 0.04;
      out.push({ x: round(cx), z: round(cz), w: round(alongX ? w : hd.thick), d: round(alongX ? hd.thick : w), h: hd.h, f: hd.id });
    }
  }
  return out;
}
let hedgeCache: HedgePiece[] | null = null;
export function buildHedges(list: Hedge[] = HEDGES): HedgePiece[] {
  if (list === HEDGES) return (hedgeCache ??= list.flatMap(buildHedge));
  return list.flatMap(buildHedge);
}
export function hedgePiecesInChunk(ix: number, iz: number, pieces: HedgePiece[] = buildHedges()): HedgePiece[] {
  if (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS) return [];
  const { x0, z0, x1, z1 } = chunkBounds(ix, iz);
  return pieces.filter((p) => p.x >= x0 && p.x < x1 + (ix === CHUNKS - 1 ? 1 : 0) && p.z >= z0 && p.z < z1 + (iz === CHUNKS - 1 ? 1 : 0));
}
export const hedgeBoxes = (pieces: HedgePiece[]): Box[] => pieces.map(({ x, z, w, d }) => ({ x, z, w, d }));
/** Does a round thing of radius r at (x, z) touch a hedge (with `pad` to spare)? Used to clear the scatter from under hedges. */
export const hedgeTouches = (x: number, z: number, r: number, pieces: HedgePiece[] = buildHedges(), pad = 0.4): boolean =>
  pieces.some((p) => Math.abs(x - p.x) < p.w / 2 + r + pad && Math.abs(z - p.z) < p.d / 2 + r + pad);

// ---- E5: region prop families (Meadow: tufts and haystacks; Inkwood Edge: ink drips and ferns). Seeded patches, pure, drawn only with the features on. ----
export type PropKind = "tuft" | "haystack" | "drip" | "fern" | "pinwheel" | "pagestone";
export type PropPatch = { id: string; region: RegionId; kind: PropKind; at: Pt; rx: number; rz: number; count: number; s: [number, number]; seed: number };
export type PropItem = Item & { k: PropKind; f: string };
export type PropLimits = { perChunk: number; minGap: number };
const rawF = raw.features as unknown as { props?: PropPatch[]; propLimits?: PropLimits };
export const PROPS: PropPatch[] = rawF.props ?? [];
export const PROP_LIMITS: PropLimits = rawF.propLimits ?? { perChunk: 60, minGap: 0.9 };
/** Footprint radius per unit of scale. Haystacks and page-stones are solid circles; tufts, drips, ferns and pinwheels are walk-through but keep their own space. */
export const PROP_R: Record<PropKind, number> = { tuft: 0.35, haystack: 1.0, drip: 0.3, fern: 0.55, pinwheel: 0.3, pagestone: 0.65 };
export const propRadius = (i: { k: PropKind; s: number }) => PROP_R[i.k] * i.s;
export const propSolid = (i: { k: PropKind }) => i.k === "haystack" || i.k === "pagestone";

function solidsNear(x: number, z: number): Circle[] { // scatter trunks, rocks and bushes in the 3x3 chunks around (pure data)
  const ix = chunkOf(x), iz = chunkOf(z), out: Circle[] = [];
  for (let a = Math.max(0, ix - 1); a <= Math.min(CHUNKS - 1, ix + 1); a++) for (let b = Math.max(0, iz - 1); b <= Math.min(CHUNKS - 1, iz + 1); b++) out.push(...chunkCircles(chunkContents(a, b)));
  return out;
}
/** The items of one patch: a pure function of the patch. Items keep clear of the keep-clear places, hedges, authored features and scatter solids, and of each other. */
export function buildPatch(p: PropPatch, limits: PropLimits = PROP_LIMITS): PropItem[] {
  const rnd = mulberry32(p.seed), out: PropItem[] = [], feats = featureCircles(buildAll()), hp = buildHedges();
  for (let n = 0; n < p.count * 12 && out.length < p.count; n++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()), s = p.s[0] + rnd() * (p.s[1] - p.s[0]), r = rnd() * Math.PI * 2;
    const it: PropItem = { x: round(p.at[0] + Math.cos(a) * d * p.rx), z: round(p.at[1] + Math.sin(a) * d * p.rz), s: round(s), r: round(r), k: p.kind, f: p.id }, rad = propRadius(it);
    if (Math.abs(it.x) > HALF - rad - 0.5 || Math.abs(it.z) > HALF - rad - 0.5) continue;
    if (regionAt(it.z, it.x) !== p.region) continue;
    if (keepClear(it.x, it.z, rad + 0.5)) continue;
    if (hedgeTouches(it.x, it.z, rad, hp, 0.5)) continue;
    if (feats.some((c) => Math.hypot(c.x - it.x, c.z - it.z) < c.r + rad + 0.3)) continue;
    if (solidsNear(it.x, it.z).some((c) => Math.hypot(c.x - it.x, c.z - it.z) < c.r + rad + 0.3)) continue;
    if (out.some((o) => Math.hypot(o.x - it.x, o.z - it.z) < rad + propRadius(o) + limits.minGap * (p.kind === "haystack" || p.kind === "pagestone" ? 1.5 : 0.3))) continue;
    out.push(it);
  }
  return out;
}
let propCache: PropItem[] | null = null;
/** Every prop item, in list order, with each chunk held to the per-chunk cap (the first items in list order win). Cached for the shipped list. */
export function buildProps(list: PropPatch[] = PROPS, limits: PropLimits = PROP_LIMITS): PropItem[] {
  if (list === PROPS && limits === PROP_LIMITS && propCache) return propCache;
  const used = new Map<string, number>(), out: PropItem[] = [];
  for (const it of list.flatMap((p) => buildPatch(p, limits))) {
    const key = `${chunkOf(it.x)},${chunkOf(it.z)}`, n = used.get(key) ?? 0;
    if (n >= limits.perChunk) continue;
    used.set(key, n + 1); out.push(it);
  }
  if (list === PROPS && limits === PROP_LIMITS) propCache = out;
  return out;
}
export function propItemsInChunk(ix: number, iz: number, items: PropItem[] = buildProps()): PropItem[] {
  if (ix < 0 || iz < 0 || ix >= CHUNKS || iz >= CHUNKS) return [];
  const { x0, z0, x1, z1 } = chunkBounds(ix, iz);
  return items.filter((i) => i.x >= x0 && i.x < x1 + (ix === CHUNKS - 1 ? 1 : 0) && i.z >= z0 && i.z < z1 + (iz === CHUNKS - 1 ? 1 : 0));
}
export const propCircles = (items: PropItem[]): Circle[] => items.filter(propSolid).map((i) => ({ x: i.x, z: i.z, r: propRadius(i) }));
