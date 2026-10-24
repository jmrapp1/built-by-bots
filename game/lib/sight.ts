// E0: sight-line tooling for the World, as pure functions. No three.js, clock, storage or randomness: the same World always gives the same numbers.
// It changes nothing the player sees. It reads the same data the game draws (chunk contents, the garden) and answers "how far can you see from here?",
// so later slices can be judged by numbers and pictures when nobody can look at the game. Shapes are approximations of the drawn meshes (noted below).
import { GARDEN, colliders, insideAny, type Box, type Circle } from "./world";
import { CHUNKS, HALF, WORLD, chunkCircles, chunkContents, pathPoints, regionAt, type RegionId } from "./worldMap";

// ---- what blocks the eye ----
// Heights are metres above the ground (y 0). Tree, rock and bush profiles follow the shared geometry in worldShell.ts (trunk, crownLow, crownHigh; scale s on all three axes).
export type Occluder =
  | { k: "tree"; x: number; z: number; s: number }
  | { k: "rock"; x: number; z: number; s: number }
  | { k: "bush"; x: number; z: number; s: number }
  | { k: "tower"; id: string; x: number; z: number; r: number; h: number } // landmark: a cylinder, or a cone for the hill
  | { k: "hedge"; x: number; z: number; w: number; d: number; h: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Radius of a concave crown cone at a height, from its base (profile of crownGeo: 1, .76, .4, 0 of r at 0, .3, .66, 1 of h). 0 outside the cone. */
function crownR(y: number, base: number, h: number, r: number): number {
  const t = (y - base) / h;
  if (t < 0 || t > 1) return 0;
  const P = [[0, 1], [0.3, 0.76], [0.66, 0.4], [1, 0]];
  for (let i = 1; i < P.length; i++) if (t <= P[i][0]) return r * lerp(P[i - 1][1], P[i][1], (t - P[i - 1][0]) / (P[i][0] - P[i - 1][0]));
  return 0;
}
/** The widest the thing is, seen from the side, at height y. 0 means a ray at that height passes clear. */
export function radiusAt(o: Occluder, y: number): number {
  switch (o.k) {
    case "tree": {
      const s = o.s, trunk = y >= 0 && y <= 2.6 * s ? lerp(0.28, 0.18, y / (2.6 * s)) * s : 0;
      return Math.max(trunk, crownR(y, 1.9 * s, 2.6 * s, 1.6 * s), crownR(y, 3.5 * s, 2.2 * s, 1.05 * s));
    }
    case "rock": { const R = 0.7 * o.s, dy = Math.abs(y - 0.3 * o.s); return dy < R && y >= 0 ? Math.sqrt(R * R - dy * dy) : 0; }
    case "bush": { const R = 0.8 * o.s, ry = 0.56 * o.s, dy = Math.abs(y - 0.45 * o.s) / ry; return dy < 1 && y >= 0 ? R * Math.sqrt(1 - dy * dy) : 0; }
    case "tower": return y < 0 || y > o.h ? 0 : o.id.includes("hill") ? o.r * (1 - y / o.h) : o.r;
    case "hedge": return 0;
  }
}
const reachOf = (o: Occluder): number => {
  switch (o.k) {
    case "tree": return 1.6 * o.s; case "rock": return 0.7 * o.s; case "bush": return 0.8 * o.s;
    case "tower": return o.r; case "hedge": return Math.hypot(o.w, o.d) / 2;
  }
};

/** Every occluder in the World: the garden (trees, hedges), all chunks (trees, rocks, bushes) and the landmarks. Garden trees use the shell tree at the scale that matches their collision radius (approximate). */
export function worldOccluders(): Occluder[] {
  const out: Occluder[] = [];
  for (const t of GARDEN.trees) out.push({ k: "tree", x: t.x, z: t.z, s: t.r / 0.55 });
  for (const h of GARDEN.hedges) out.push({ k: "hedge", x: h.x, z: h.z, w: h.w, d: h.d, h: 1.1 });
  for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) {
    const c = chunkContents(a, b);
    for (const t of c.trees) out.push({ k: "tree", x: t.x, z: t.z, s: t.s });
    for (const t of c.rocks) out.push({ k: "rock", x: t.x, z: t.z, s: t.s });
    for (const t of c.bushes) out.push({ k: "bush", x: t.x, z: t.z, s: t.s });
    for (const l of c.landmarks) out.push({ k: "tower", id: l.id, x: l.x, z: l.z, r: l.r, h: l.h });
  }
  return out;
}

// ---- the field: occluders in a coarse hash so a ray only meets what is near it ----
const CELL = 16, STEP = 8; // STEP * 0.5 + biggest reach (7, the hill) is well under CELL, so sampling every STEP and taking the 3x3 cells round each sample finds everything a ray can touch
export type SightField = { occ: Occluder[]; cells: Map<number, number[]>; far: number; clip: boolean };
const ck = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

export function createSightField(occ: Occluder[] = worldOccluders(), opts: { far?: number; clip?: boolean } = {}): SightField {
  const cells = new Map<number, number[]>();
  occ.forEach((o, i) => { const k = ck(Math.floor(o.x / CELL), Math.floor(o.z / CELL)); const l = cells.get(k); if (l) l.push(i); else cells.set(k, [i]); });
  return { occ, cells, far: opts.far ?? WORLD.fog[1], clip: opts.clip ?? true };
}

/** Distance from (x,z) along a unit direction to the edge of the World square (Infinity if the start is outside and heading away is not modelled). */
function toEdge(x: number, z: number, dx: number, dz: number): number {
  const tx = dx > 1e-9 ? (HALF - x) / dx : dx < -1e-9 ? (-HALF - x) / dx : Infinity, tz = dz > 1e-9 ? (HALF - z) / dz : dz < -1e-9 ? (-HALF - z) / dz : Infinity;
  return Math.max(0, Math.min(tx, tz));
}

/**
 * How far a ray goes before something blocks it, capped at `maxDist` (default: the fog end) and, with clip on, at the World edge.
 * (dx, dz) is a unit direction; `slope` is metres of height gained per metre travelled (0 = level). `ignore` skips one landmark by id (to look at it).
 */
export function castRay(f: SightField, x: number, z: number, y: number, dx: number, dz: number, slope = 0, maxDist = f.far, ignore?: string): number {
  let best = Math.min(maxDist, f.clip ? toEdge(x, z, dx, dz) : Infinity);
  const seen = new Set<number>();
  for (let t = 0; t <= best + STEP; t += STEP) {
    const px = x + dx * Math.min(t, best), pz = z + dz * Math.min(t, best), cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      const l = f.cells.get(ck(a, b)); if (!l) continue;
      for (const i of l) {
        if (seen.has(i)) continue; seen.add(i);
        const o = f.occ[i];
        if (ignore && o.k === "tower" && o.id === ignore) continue;
        const hit = hitDistance(o, x, z, y, dx, dz, slope);
        if (hit < best) best = hit;
      }
    }
  }
  return Math.max(0, best);
}

function hitDistance(o: Occluder, x: number, z: number, y: number, dx: number, dz: number, slope: number): number {
  if (o.k === "hedge") { // slab test in plan, then the height where the ray enters
    const hx = o.w / 2, hz = o.d / 2;
    let t0 = -Infinity, t1 = Infinity;
    for (const [p, d, c, h] of [[x, dx, o.x, hx], [z, dz, o.z, hz]] as const) {
      if (Math.abs(d) < 1e-9) { if (Math.abs(p - c) > h) return Infinity; continue; }
      const a = (c - h - p) / d, b = (c + h - p) / d;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 < Math.max(0, t0)) return Infinity;
    const te = Math.max(0, t0), ye = y + slope * te;
    return ye >= 0 && ye <= o.h ? te : Infinity;
  }
  const ox = o.x - x, oz = o.z - z, along = ox * dx + oz * dz;
  if (along < -reachOf(o)) return Infinity;
  const ya = y + slope * Math.max(0, along), R = radiusAt(o, ya);
  if (R <= 0) return Infinity;
  const perp2 = ox * ox + oz * oz - along * along;
  if (perp2 >= R * R) return Infinity;
  const half = Math.sqrt(R * R - perp2), te = along - half;
  if (along + half < 0) return Infinity; // wholly behind
  return Math.max(0, te);
}

/** Level view distances in `rays` evenly spaced directions from (x, z) at eye height `eye`. */
export function rayDistances(f: SightField, x: number, z: number, eye: number, rays = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < rays; i++) { const a = (i / rays) * Math.PI * 2; out.push(castRay(f, x, z, eye, Math.sin(a), Math.cos(a))); }
  return out;
}
export type Openness = { mean: number; max: number; longShare: number };
/** Summary of a viewpoint: mean and longest view, and the share of rays that go past `long` metres unblocked. */
export function openness(f: SightField, x: number, z: number, eye: number, rays = 24, long = 110): Openness {
  const d = rayDistances(f, x, z, eye, rays);
  return { mean: d.reduce((a, b) => a + b, 0) / d.length, max: Math.max(...d), longShare: d.filter((v) => v >= long).length / d.length };
}

/** Is the straight line between two points (with heights) unblocked? `ignore` is a landmark id to look at. */
export function lineClear(f: SightField, a: { x: number; z: number; y: number }, b: { x: number; z: number; y: number }, ignore?: string): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  if (L < 1e-6) return true;
  return castRay({ ...f, clip: false }, a.x, a.z, a.y, dx / L, dz / L, (b.y - a.y) / L, L, ignore) >= L - 1e-6;
}

// ---- viewpoints ----
/** Sample points on a grid, `step` apart, in cell centres, that are inside the World and not inside anything solid (player radius). */
export function viewpoints(step: number, cols: ReturnType<typeof worldColliders> = worldColliders(), margin = 4): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -HALF + step / 2; z < HALF; z += step) for (let x = -HALF + step / 2; x < HALF; x += step) {
    if (Math.abs(x) > HALF - margin || Math.abs(z) > HALF - margin) continue;
    if (!insideAny({ x, z }, GARDEN.player.radius, cols)) out.push({ x, z });
  }
  return out;
}
/** All solid things the player bumps into, in one list: the garden's own and every chunk's circles. */
export function worldColliders(): { circles: Circle[]; boxes: Box[] } {
  const base = colliders(), circles = [...base.circles];
  for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) circles.push(...chunkCircles(chunkContents(a, b)));
  return { circles, boxes: base.boxes };
}

// ---- the reachability walk ----
export type Reach = { cell: number; n: number; free: Uint8Array; seen: Uint8Array; at: (x: number, z: number) => number };
/**
 * Flood fill over a grid of `cell` metre cells from `from` (default the game's spawn). A cell is walkable when a player circle centred in it
 * touches no collider and stays inside the World. Four-way moves. `seen[i]` is 1 when the walk reached it, `free[i]` 1 when walkable.
 */
export function reachability(cols = worldColliders(), cell = 0.5, from: { x: number; z: number } = { x: GARDEN.player.start[0], z: GARDEN.player.start[1] }): Reach {
  const n = Math.round(WORLD.size / cell), rad = GARDEN.player.radius, lim = HALF - rad;
  const free = new Uint8Array(n * n).fill(1), seen = new Uint8Array(n * n);
  const at = (x: number, z: number) => { const i = Math.floor((x + HALF) / cell), j = Math.floor((z + HALF) / cell); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const cx = (i: number) => -HALF + (i + 0.5) * cell;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (Math.abs(cx(i)) > lim || Math.abs(cx(j)) > lim) free[j * n + i] = 0;
  for (const c of cols.circles) {
    const R = c.r + rad, i0 = Math.max(0, Math.floor((c.x - R + HALF) / cell)), i1 = Math.min(n - 1, Math.floor((c.x + R + HALF) / cell)), j0 = Math.max(0, Math.floor((c.z - R + HALF) / cell)), j1 = Math.min(n - 1, Math.floor((c.z + R + HALF) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cx(i) - c.x, cx(j) - c.z) < R) free[j * n + i] = 0;
  }
  for (const b of cols.boxes) {
    const i0 = Math.max(0, Math.floor((b.x - b.w / 2 - rad + HALF) / cell)), i1 = Math.min(n - 1, Math.floor((b.x + b.w / 2 + rad + HALF) / cell)), j0 = Math.max(0, Math.floor((b.z - b.d / 2 - rad + HALF) / cell)), j1 = Math.min(n - 1, Math.floor((b.z + b.d / 2 + rad + HALF) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = cx(i), z = cx(j), qx = Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, x)), qz = Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, z));
      if (Math.hypot(x - qx, z - qz) < rad) free[j * n + i] = 0;
    }
  }
  const start = at(from.x, from.z);
  if (start >= 0 && free[start]) {
    const q = new Int32Array(n * n); let h = 0, t = 0; q[t++] = start; seen[start] = 1;
    while (h < t) {
      const p = q[h++], i = p % n, j = (p - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const k = nj * n + ni; if (free[k] && !seen[k]) { seen[k] = 1; q[t++] = k; }
      }
    }
  }
  return { cell, n, free, seen, at };
}
/** Is some walkable cell within `radius` metres of (x, z) reached by the walk? (A landmark or signpost is reached when you can stand next to it.) */
export function reachedNear(r: Reach, x: number, z: number, radius: number): boolean {
  const c = Math.ceil(radius / r.cell);
  for (let dj = -c; dj <= c; dj++) for (let di = -c; di <= c; di++) {
    if (Math.hypot(di, dj) * r.cell > radius) continue;
    const k = r.at(x + di * r.cell, z + dj * r.cell); if (k >= 0 && r.seen[k]) return true;
  }
  return false;
}
/** Walkable cells the walk could not reach, grouped into pockets (4-way), biggest first. Area in square metres. */
export function pockets(r: Reach): { area: number; x: number; z: number }[] {
  const { n, cell } = r, mark = new Uint8Array(n * n), out: { area: number; x: number; z: number }[] = [];
  for (let s = 0; s < n * n; s++) {
    if (!r.free[s] || r.seen[s] || mark[s]) continue;
    const q = [s]; mark[s] = 1; let cnt = 0, sx = 0, sz = 0;
    while (q.length) {
      const p = q.pop()!, i = p % n, j = (p - i) / n; cnt++; sx += i; sz += j;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue; const k = nj * n + ni; if (r.free[k] && !r.seen[k] && !mark[k]) { mark[k] = 1; q.push(k); } }
    }
    out.push({ area: cnt * cell * cell, x: -HALF + (sx / cnt + 0.5) * cell, z: -HALF + (sz / cnt + 0.5) * cell });
  }
  return out.sort((a, b) => b.area - a.area);
}

// ---- pictures ----
/** A text map of the whole World, one character per `step` metres. Later rows are further south (+z). Characters: `@` spawn, `#` landmark, `H` hedge, `o` tree/rock/bush, `p` post, `=` path, `h` Home, `.` open ground. */
export function layoutMap(step = 4, cols = worldColliders()): string {
  const rows: string[] = [], P = pathPoints(), R = GARDEN.player.start, lm = WORLD.landmarks;
  for (let z = -HALF + step / 2; z < HALF; z += step) {
    let row = "";
    for (let x = -HALF + step / 2; x < HALF; x += step) {
      const h = step / 2;
      const near = (c: { x: number; z: number }, r = 0) => Math.abs(c.x - x) <= h + r && Math.abs(c.z - z) <= h + r;
      let ch = Math.abs(x) < GARDEN.size / 2 && Math.abs(z) < GARDEN.size / 2 ? "h" : ".";
      if (P.some((p) => near(p, 0.5))) ch = "=";
      const hit = cols.circles.filter((c) => near(c, c.r));
      if (hit.length) ch = hit.some((c) => c.r <= 0.4) ? "p" : "o"; // p = signpost or gate post, o = something solid (tree, rock, bush)
      if (cols.boxes.some((b) => Math.abs(b.x - x) <= h + b.w / 2 && Math.abs(b.z - z) <= h + b.d / 2)) ch = "H";
      if (lm.some((l) => near(l, l.r))) ch = "#";
      if (near({ x: R[0], z: R[1] })) ch = "@";
      row += ch;
    }
    rows.push(row);
  }
  return rows.join("\n");
}
/** A greyscale picture as bytes (0 black = nothing visible, 255 white = the full fog distance), `n` x `n`, one pixel per `step` metres, from the mean level view distance at eye height. */
export function sightImage(f: SightField, step: number, eye: number, rays = 24, value: "mean" | "long" = "mean", long = 110): { n: number; px: Uint8Array } {
  const n = Math.round(WORLD.size / step), px = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = openness(f, -HALF + (i + 0.5) * step, -HALF + (j + 0.5) * step, eye, rays, long);
    px[j * n + i] = Math.round(255 * (value === "mean" ? Math.min(1, o.mean / f.far) : o.longShare));
  }
  return { n, px };
}

// ---- the report ----
export const EYES = { person: 1.6, camera: 3 } as const; // a Print-height eye and the game camera (about 2 to 3 metres up)
const percentile = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export type RegionRow = { region: RegionId | "home"; points: number; meanView: number; p50Long: number; p90Long: number; openShare: number; maxView: number };
export type Report = {
  eye: number;
  regions: RegionRow[];
  endToEnd: { pairs: number; clear: number; share: number };
  landmarks: { id: string; visibleShare: number }[];
  landmarksSeenAvg: number;
  trail: { points: number; meanView: number; maxView: number; longestAt: { x: number; z: number } };
};
/** Numbers for one eye height. `step` is the viewpoint grid in metres (8 by default; 16 for the faster test). */
export function sightReport(f: SightField, eye: number, step = 8, cols = worldColliders()): Report {
  const pts = viewpoints(step, cols), ops = pts.map((p) => ({ ...p, o: openness(f, p.x, p.z, eye) }));
  const regionOf = (p: { x: number; z: number }): RegionId | "home" => (Math.abs(p.x) < GARDEN.size / 2 && Math.abs(p.z) < GARDEN.size / 2 ? "home" : regionAt(p.z, p.x));
  const order: (RegionId | "home")[] = ["home", "meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"];
  const regions: RegionRow[] = order.map((region) => {
    const m = ops.filter((p) => regionOf(p) === region);
    return { region, points: m.length, meanView: round(m.reduce((a, p) => a + p.o.mean, 0) / Math.max(1, m.length), 1), p50Long: round(percentile(m.map((p) => p.o.longShare), 0.5)), p90Long: round(percentile(m.map((p) => p.o.longShare), 0.9)), openShare: round(m.filter((p) => p.o.longShare >= 0.5).length / Math.max(1, m.length)), maxView: round(Math.max(0, ...m.map((p) => p.o.max)), 0) };
  });
  // end to end: pairs of the coarser grid that are 180 to 220 m apart, level at the eye (both ends the same height)
  const coarse = viewpoints(16, cols); let pairs = 0, clear = 0;
  for (let i = 0; i < coarse.length; i++) for (let j = i + 1; j < coarse.length; j++) {
    const d = Math.hypot(coarse[i].x - coarse[j].x, coarse[i].z - coarse[j].z);
    if (d < 180 || d > 220) continue;
    pairs++; if (lineClear(f, { ...coarse[i], y: eye }, { ...coarse[j], y: eye })) clear++;
  }
  // landmarks: seen when the line from the eye to 90 percent of the landmark's height is clear and it is inside the fog
  const lm = WORLD.landmarks, vis = lm.map(() => 0); let seenTotal = 0;
  for (const p of coarse) lm.forEach((l, k) => {
    if (Math.hypot(l.x - p.x, l.z - p.z) > f.far) return;
    if (lineClear(f, { ...p, y: eye }, { x: l.x, z: l.z, y: l.h * 0.9 }, l.id)) { vis[k]++; seenTotal++; }
  });
  // trail: a scripted walk along the inked path, every fourth point of the curve
  const tp = pathPoints().filter((_, i) => i % 4 === 0).map((p) => ({ ...p, o: openness(f, p.x, p.z, eye) }));
  const longest = tp.reduce((a, p) => (p.o.max > a.o.max ? p : a), tp[0]);
  return {
    eye, regions, endToEnd: { pairs, clear, share: round(clear / Math.max(1, pairs), 3) },
    landmarks: lm.map((l, k) => ({ id: l.id, visibleShare: round(vis[k] / Math.max(1, coarse.length), 3) })),
    landmarksSeenAvg: round(seenTotal / Math.max(1, coarse.length), 2),
    trail: { points: tp.length, meanView: round(tp.reduce((a, p) => a + p.o.mean, 0) / tp.length, 1), maxView: round(longest.o.max, 0), longestAt: { x: round(longest.x, 0), z: round(longest.z, 0) } },
  };
}
export type Reachable = { freeCells: number; reachedShare: number; pockets: number; pocketArea: number; biggestPocket: { area: number; x: number; z: number } | null; landmarksReached: Record<string, boolean>; signpostsReached: number; signposts: number; gateReached: boolean; corners: boolean[] };
export function reachReport(r: Reach = reachability(), signposts: { x: number; z: number }[] = []): Reachable {
  let free = 0, seen = 0; for (let i = 0; i < r.free.length; i++) { free += r.free[i]; seen += r.seen[i]; }
  const pk = pockets(r), gate = GARDEN.places.find((p) => p.kind === "gate");
  const c = HALF - 4;
  return {
    freeCells: free, reachedShare: round(seen / Math.max(1, free), 4), pockets: pk.length, pocketArea: round(pk.reduce((a, p) => a + p.area, 0), 1), biggestPocket: pk[0] ? { area: round(pk[0].area, 1), x: round(pk[0].x, 0), z: round(pk[0].z, 0) } : null,
    landmarksReached: Object.fromEntries(WORLD.landmarks.map((l) => [l.id, reachedNear(r, l.x, l.z, l.r + 2)])),
    signpostsReached: signposts.filter((s) => reachedNear(r, s.x, s.z, 1.5)).length, signposts: signposts.length,
    gateReached: !!gate && reachedNear(r, gate.x, gate.z, 1.5),
    corners: [[-c, -c], [c, -c], [-c, c], [c, c]].map(([x, z]) => reachedNear(r, x, z, 3)),
  };
}

/** The report as plain text (what the PR body and the dev command print). */
export function formatReport(reports: Report[], reach: Reachable): string {
  const L: string[] = [];
  for (const r of reports) {
    L.push(`## Eye ${r.eye} m`, "", "| region | points | mean view m | median long share | p90 long share | open points | longest view m |", "|---|---|---|---|---|---|---|");
    for (const g of r.regions) L.push(`| ${g.region} | ${g.points} | ${g.meanView} | ${g.p50Long} | ${g.p90Long} | ${g.openShare} | ${g.maxView} |`);
    L.push("", `End to end (180 to 220 m apart): ${r.endToEnd.clear} of ${r.endToEnd.pairs} pairs clear (${r.endToEnd.share}).`,
      `Landmarks seen from a point, on average: ${r.landmarksSeenAvg} of ${r.landmarks.length}. Share of points that see each: ${r.landmarks.map((l) => `${l.id} ${l.visibleShare}`).join(", ")}.`,
      `Along the path (${r.trail.points} points): mean view ${r.trail.meanView} m, longest ${r.trail.maxView} m at (${r.trail.longestAt.x}, ${r.trail.longestAt.z}).`, "");
  }
  L.push("## Reachability", "", `Walkable cells ${reach.freeCells}; reached ${reach.reachedShare}. Pockets ${reach.pockets} (${reach.pocketArea} m2 in all${reach.biggestPocket ? `, biggest ${reach.biggestPocket.area} m2 near (${reach.biggestPocket.x}, ${reach.biggestPocket.z})` : ""}).`,
    `Landmarks reached: ${Object.entries(reach.landmarksReached).map(([k, v]) => `${k} ${v ? "yes" : "NO"}`).join(", ")}. Signposts ${reach.signpostsReached}/${reach.signposts}. Gate ${reach.gateReached ? "yes" : "NO"}. Corners ${reach.corners.map((c) => (c ? "yes" : "NO")).join("/")}.`);
  return L.join("\n");
}
