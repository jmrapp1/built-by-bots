// W2: the World around the garden, as pure functions. No three.js and no clock: the same chunk always has the same
// contents (a function of the seed and its coordinates), in any order, so nothing is stored. Rendering is in components/worldShell.ts.
import world from "@/data/world.json";
import map from "@/data/map.json";
import { GARDEN, HOME, type Circle, type Colliders, type Vec } from "./world";
import { mulberry32 } from "./margins";
import { CLUSTERS, clusterScatterIn, insideClusterReach, shippedClusters } from "./clusters";

export const WORLD = world;
export type RegionId = "meadow" | "inkwood" | "paper_downs" | "glyph_quarter" | "pressmark_shore";
export type Item = { x: number; z: number; s: number; r: number };
export type Landmark = { id: string; kind: "tower" | "spire" | "bigtree" | "lamp" | "hill" | "shelves" | "bridge"; x: number; z: number; r: number; h: number };
export type Contents = { region: RegionId; trees: Item[]; rocks: Item[]; bushes: Item[]; landmarks: Landmark[]; posts: Circle[] };

export const HALF = WORLD.size / 2;
export const CHUNKS = Math.ceil(WORLD.size / WORLD.chunk);
export const regionAt = (z: number, x: number = -1): RegionId => (z < WORLD.inkwoodZ ? (x >= WORLD.paperDownsX ? "paper_downs" : "inkwood") : z >= WORLD.glyphZ ? "glyph_quarter" : x >= WORLD.shoreX ? "pressmark_shore" : "meadow");
export const chunkKey = (ix: number, iz: number) => `${ix},${iz}`;
export const chunkOf = (v: number) => Math.min(CHUNKS - 1, Math.max(0, Math.floor((v + HALF) / WORLD.chunk)));
const inRange = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < CHUNKS && iz < CHUNKS;
const hash = (cx: number, cz: number, seed: number) => (Math.imul(cx + 4096, 73856093) ^ Math.imul(cz + 4096, 19349663) ^ Math.imul(seed + 1, 83492791)) | 0;

// ---- the inked path: a smooth curve through the data points, one list used by both the collision keep-out and the mesh ----
function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t, t3 = t2 * t, f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) };
}
export function pathPoints(perSegment = 12): Vec[] {
  const P = WORLD.path.points.map(([x, z]) => ({ x, z }));
  const out: Vec[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < perSegment; k++) out.push(catmull(a, b, c, d, k / perSegment));
  }
  out.push(P[P.length - 1]);
  return out;
}
const PATH = pathPoints();
export function distToPath(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
    const t = L < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

// ---- chunk contents ----
const KEEP_GARDEN = HOME.half + WORLD.gardenKeepOut;
const LANDMARKS = WORLD.landmarks as Landmark[];
export const blocked = (x: number, z: number): boolean =>
  (Math.abs(x) < KEEP_GARDEN && Math.abs(z) < KEEP_GARDEN) ||
  distToPath(x, z) < WORLD.path.keepOut ||
  LANDMARKS.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 5) ||
  map.signposts.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5); // W4: nothing grows on a picture signpost

export function chunkBounds(ix: number, iz: number) {
  const x0 = -HALF + ix * WORLD.chunk, z0 = -HALF + iz * WORLD.chunk;
  return { x0, z0, x1: Math.min(HALF, x0 + WORLD.chunk), z1: Math.min(HALF, z0 + WORLD.chunk) };
}
/** C1: the old uniform scatter scaled to its stray share in this region (x1 when clusters are off, so the numbers are exactly today's). */
const densOf = (region: RegionId, clusters: boolean) => { const d = WORLD.density[region], k = clusters ? CLUSTERS.cells[region]?.stray ?? 1 : 1; return { tree: d.tree * k, rock: d.rock * k, bush: d.bush * k }; };
const EMPTY = (region: RegionId): Contents => ({ region, trees: [], rocks: [], bushes: [], landmarks: [], posts: [] });

const contentsCache = new Map<string, Contents>(); // C1: chunk contents are called again and again (collision, spacing checks); built once per chunk
export function chunkContents(ix: number, iz: number, seed: number = WORLD.seed): Contents {
  if (seed !== WORLD.seed) return buildContents(ix, iz, seed, CLUSTERS.enabled === true);
  const k = chunkKey(ix, iz); let c = contentsCache.get(k);
  if (!c) { c = buildContents(ix, iz, seed, CLUSTERS.enabled === true); contentsCache.set(k, c); }
  return c;
}
/** The chunk with clusters on or off. Off is the old scatter byte for byte (the stray share is then 1). */
export function buildContents(ix: number, iz: number, seed: number, clusters: boolean): Contents {
  if (!inRange(ix, iz)) return EMPTY("meadow");
  const { x0, z0, x1, z1 } = chunkBounds(ix, iz);
  const region = regionAt((z0 + z1) / 2, (x0 + x1) / 2);
  const out = EMPTY(region);
  const rnd = mulberry32(hash(ix, iz, seed));
  const w = x1 - x0, d = z1 - z0, area = w * d, dens = densOf(region, clusters);
  const count = (p: number) => { const e = area * p; return Math.floor(e) + (rnd() < e - Math.floor(e) ? 1 : 0); };
  // P2: scenery density eases across the Glyph Quarter edge (z glyphZ) instead of stepping at the chunk edge. Chunks beside that edge draw at the busier density and thin each item by the eased local density.
  const GB = 16, north0 = z1 === WORLD.glyphZ, near = north0 || z0 === WORLD.glyphZ;
  const farD = near ? densOf(regionAt(north0 ? WORLD.glyphZ : WORLD.glyphZ - 1, (x0 + x1) / 2), clusters) : dens; // the density on the other side of the edge
  const north = north0 ? dens : farD, south = north0 ? farD : dens;
  const keepAt = (z: number, k: "tree" | "rock" | "bush") => { const t = Math.min(1, Math.max(0, (z - WORLD.glyphZ + GB) / (GB * 2))), u = t * t * (3 - 2 * t), here = north[k] + (south[k] - north[k]) * u; return here / Math.max(north[k], south[k]); };
  const rK = { tree: 0.55, rock: 0.7, bush: 0.8 }, cl = clusters ? shippedClusters() : null;
  const put = (list: Item[], n: number, sMin: number, sMax: number, k: "tree" | "rock" | "bush") => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * w, z = z0 + rnd() * d, s = sMin + rnd() * (sMax - sMin), r = rnd() * Math.PI * 2;
      if (near && rnd() > keepAt(z, k)) continue;
      if (!blocked(x, z) && !(cl && insideClusterReach(x, z, rK[k] * s, cl))) list.push({ x, z, s, r }); // strays give way to clusters
    }
  };
  const top = (k: "tree" | "rock" | "bush") => (near ? Math.max(north[k], south[k]) : dens[k]);
  put(out.trees, count(top("tree")), region === "inkwood" ? 1.0 : 0.8, region === "inkwood" ? 1.9 : 1.4, "tree");
  put(out.rocks, count(top("rock")), 0.6, 1.6, "rock");
  put(out.bushes, count(top("bush")), 0.7, 1.3, "bush");
  if (cl) for (const m of clusterScatterIn(ix, iz, cl.scatter)) (m.k === "tree" ? out.trees : m.k === "rock" ? out.rocks : out.bushes).push({ x: m.x, z: m.z, s: m.s, r: m.r });
  out.landmarks = LANDMARKS.filter((l) => l.x >= x0 && l.x < x1 + (ix === CHUNKS - 1 ? 1 : 0) && l.z >= z0 && l.z < z1 + (iz === CHUNKS - 1 ? 1 : 0));
  out.posts = map.signposts.filter((p) => p.x >= x0 && p.x < x1 && p.z >= z0 && p.z < z1).map((p) => ({ x: p.x, z: p.z, r: POST_R }));
  return out;
}

export const POST_R = 0.35;
export const TREE_R = 0.55, ROCK_R = 0.7, BUSH_R = 0.8; // collision radius per unit of scale
export function chunkCircles(c: Contents): Circle[] {
  return [
    ...c.trees.map((t) => ({ x: t.x, z: t.z, r: TREE_R * t.s })),
    ...c.rocks.map((t) => ({ x: t.x, z: t.z, r: ROCK_R * t.s })),
    ...c.bushes.map((t) => ({ x: t.x, z: t.z, r: BUSH_R * t.s })),
    ...c.landmarks.map((l) => ({ x: l.x, z: l.z, r: l.r })),
    ...c.posts,
  ];
}
export const instanceCount = (c: Contents) => c.trees.length * 3 + c.rocks.length + c.bushes.length + c.landmarks.length;

/** The circles of this chunk and its eight neighbours: all the player can touch in one step. */
export function nearbyCircles(ix: number, iz: number, get: (a: number, b: number) => Circle[] = (a, b) => chunkCircles(chunkContents(a, b))): Circle[] {
  const out: Circle[] = [];
  for (let a = ix - 1; a <= ix + 1; a++) for (let b = iz - 1; b <= iz + 1; b++) if (inRange(a, b)) out.push(...get(a, b));
  return out;
}
export const withWorldColliders = (base: Colliders, near: Circle[]): Colliders => ({ circles: [...base.circles, ...near], boxes: base.boxes });

/** Chunk indexes within `radius` metres of a point (the streaming window), nearest first. */
export function chunksAround(x: number, z: number, radius: number): [number, number][] {
  const out: { k: [number, number]; d: number }[] = [];
  const lo = (v: number) => Math.max(0, Math.floor((v - radius + HALF) / WORLD.chunk)), hi = (v: number) => Math.min(CHUNKS - 1, Math.floor((v + radius + HALF) / WORLD.chunk));
  for (let ix = lo(x); ix <= hi(x); ix++) for (let iz = lo(z); iz <= hi(z); iz++) {
    const b = chunkBounds(ix, iz), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.hypot(cx - x, cz - z);
    if (d <= radius + WORLD.chunk * 0.7071) out.push({ k: [ix, iz], d });
  }
  return out.sort((a, b) => a.d - b.d).map((e) => e.k);
}

// ?at=x,z : a dev-only spawn point, to look at the far parts of the World. Ignored in production.
export function atOverride(search: string, isProduction: boolean): Vec | null {
  if (isProduction) return null;
  const m = /[?&]at=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(search);
  if (!m) return null;
  const lim = HALF - GARDEN.player.radius;
  return { x: Math.max(-lim, Math.min(lim, Number(m[1]))), z: Math.max(-lim, Math.min(lim, Number(m[2]))) };
}
