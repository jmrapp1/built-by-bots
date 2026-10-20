// Pure rules for the Margins (slice 6a): the area's layout, the daily scatter of unfold spots, the walk
// through the gate, the way home and the unfold gesture. No three.js, clock or server here, so it is all
// unit-tested. Numbers live in data/margins.json. Nothing is saved or sent.
import margins from "@/data/margins.json";
import { insideAny, type Box, type Circle, type Colliders, type Vec } from "@/lib/world";

export const MARGINS = margins;
export const HALF = margins.size / 2;
export type Find = "ink" | "glyph" | "scrap" | "egg"; // egg only ever comes from the server
export type Zone = (typeof margins.zones)[number];
export type Hill = Circle & { h: number };
export type Layout = { trees: Circle[]; bushes: Circle[]; hills: Hill[]; stacks: Circle[]; shelves: Box[]; cols: Colliders; seed: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n); // smoothstep, the same curve as the sit and the feed
const between = ([a, b]: number[], u: number) => a + u * (b - a);

// --- Seeded randomness ------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- The UTC day and the dev-only preview switches ---------------------------------------------
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDay(s: string | null): s is string {
  if (!s || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && utcDay(d) === s;
}
export type Overrides = { area: boolean; day: string | null; all: boolean; unfold: boolean; gate: boolean };
// ?area=margins ?day=YYYY-MM-DD ?finds=all ?unfold=1 ?gate=1. Dev only: all ignored in production builds.
export function marginsOverrides(search: string, isProduction: boolean): Overrides {
  if (isProduction) return { area: false, day: null, all: false, unfold: false, gate: false };
  const q = new URLSearchParams(search), day = q.get("day");
  return { area: q.get("area") === "margins", day: validDay(day) ? day : null, all: q.get("finds") === "all", unfold: q.get("unfold") === "1", gate: q.get("gate") === "1" };
}

// --- The gates ---------------------------------------------------------------------------------
const OUT: Vec = { x: margins.gate.out[0], z: margins.gate.out[1] };
export type GateWhich = "garden" | "home";
// g is the middle of the opening and d the direction you walk through it.
export function gateFrame(which: GateWhich): { g: Vec; d: Vec } {
  return which === "garden" ? { g: margins.gate.garden, d: OUT } : { g: margins.gate.margins, d: { x: -OUT.x, z: -OUT.z } };
}
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;
// Close enough in front of a gate for E to take you through it.
export function inGateZone(p: Vec, which: GateWhich): boolean {
  const { g, d } = gateFrame(which), rel = { x: p.x - g.x, z: p.z - g.z };
  const axial = dot(rel, d), lateral = Math.abs(rel.x * d.z - rel.z * d.x);
  return axial >= -margins.gate.zoneBack && axial <= margins.gate.zoneFront && lateral <= margins.gate.zoneLateral;
}
// The two posts of a gate, as colliders (the arch is just above the player's head).
export function gatePosts(which: GateWhich): Circle[] {
  const { g, d } = gateFrame(which), s = margins.gate.postOffset;
  return [1, -1].map((k) => ({ x: g.x + -d.z * s * k, z: g.z + d.x * s * k, r: margins.gate.postR }));
}
// The walk through a gate: a point on the near side, then well beyond it. Stays out of the posts.
export function gatePath(p: Vec, which: GateWhich): Vec[] {
  const { g, d } = gateFrame(which), A = { x: g.x - d.x * margins.gate.approach, z: g.z - d.z * margins.gate.approach };
  const B = { x: g.x + d.x * margins.gate.threshold, z: g.z + d.z * margins.gate.threshold };
  return dot({ x: p.x - g.x, z: p.z - g.z }, d) > -0.5 ? [p, B] : [p, A, B];
}
// Where you appear after the wipe and how you walk on. `to` is the garden's gate when you go home.
export function arrivalPath(into: "margins" | "garden"): Vec[] {
  const which: GateWhich = into === "margins" ? "home" : "garden";
  const { g } = gateFrame(which), s = margins.gate.emerge, a = margins.gate.arrive;
  // Into the Margins you walk the same way (out of the garden); back in the garden you walk the other way.
  const dir = into === "margins" ? OUT : { x: -OUT.x, z: -OUT.z };
  const start = { x: g.x - dir.x * s, z: g.z - dir.z * s }; // just behind the opening, then a stride out of it
  return [start, { x: start.x + dir.x * a, z: start.z + dir.z * a }];
}
export const arrivalYaw = (into: "margins" | "garden"): number => {
  const dir = into === "margins" ? OUT : { x: -OUT.x, z: -OUT.z };
  return Math.atan2(-dir.x, -dir.z); // the camera looks along the way you are walking
};

// --- Moving along a path -----------------------------------------------------------------------
export function pathLength(path: Vec[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return n;
}
export function pointAlong(path: Vec[], u: number): { p: Vec; heading: number } {
  const total = pathLength(path) || 1;
  let left = clamp01(u) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= seg || i === path.length - 1) {
      const k = seg < 1e-9 ? 0 : Math.min(1, left / seg);
      return { p: { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }, heading: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= seg;
  }
  return { p: path[0], heading: 0 };
}

// --- The page-turn wipe and the walk through (garden <-> Margins) ------------------------------
export type Travel = { dir: "in" | "out"; t: number };
export const travelStart = (dir: "in" | "out"): Travel => ({ dir, t: 0 });
const tk = (reduced: boolean) => (reduced ? margins.travel.reducedFactor : 1);
export const travelSeconds = (reduced = false): number => margins.travel.arriveTo * tk(reduced);
// What the screen and the player are doing t seconds in. All of it is eased; nothing snaps.
export function travelFrame(t: number, reduced = false): { walk: number; wipe: number; swapped: boolean; arrive: number; done: boolean } {
  const T = margins.travel, k = tk(reduced);
  const walk = ease(clamp01(t / (T.walkSeconds * k)));
  const cover = ease(clamp01((t - T.coverFrom * k) / ((T.coverTo - T.coverFrom) * k)));
  const uncover = ease(clamp01((t - T.uncoverFrom * k) / ((T.uncoverTo - T.uncoverFrom) * k)));
  const arrive = ease(clamp01((t - T.arriveFrom * k) / ((T.arriveTo - T.arriveFrom) * k)));
  // wipe: 0 = clear, 1 = covers the screen. The sweep is up on the way in and down on the way out.
  return { walk, wipe: cover * (1 - uncover), swapped: t >= T.swapAt * k, arrive, done: t >= T.arriveTo * k };
}
// How far across the screen the cream page is, in percent of its width, for a sweep from the gate's side.
export function wipeOffset(t: number, reduced = false): number {
  const T = margins.travel, k = tk(reduced);
  const cover = ease(clamp01((t - T.coverFrom * k) / ((T.coverTo - T.coverFrom) * k)));
  const uncover = ease(clamp01((t - T.uncoverFrom * k) / ((T.uncoverTo - T.uncoverFrom) * k)));
  return uncover > 0 ? -100 * uncover : 100 * (1 - cover);
}

// --- The area ------------------------------------------------------------------------------------
export const zoneOf = (p: Vec): Zone | null => margins.zones.find((z) => p.x >= z.x0 && p.x < z.x1 && p.z >= z.z0 && p.z < z.z1) ?? null;
export const homePoint = (): Vec => { const { g } = gateFrame("home"); return { x: g.x + OUT.x * 2.2, z: g.z + OUT.z * 2.2 }; };

// The ground rises under the hills (smooth, flat outside them).
export function heightAt(x: number, z: number, hills: Hill[]): number {
  let h = 0;
  for (const c of hills) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) h = Math.max(h, c.h * (0.5 + 0.5 * Math.cos((d / c.r) * Math.PI)));
  }
  return h;
}

export function generateLayout(seed: number = margins.seed): Layout {
  const rng = mulberry32(seed), L = margins.layout;
  const circles: Circle[] = [], boxes: Box[] = [];
  const out: Layout = { trees: [], bushes: [], hills: [], stacks: [], shelves: [], cols: { circles, boxes }, seed };
  const gate = gateFrame("home");
  const keep = { x: gate.g.x + OUT.x * 3, z: gate.g.z + OUT.z * 3 };
  for (const q of gatePosts("home")) circles.push(q);
  const ok = (p: Vec, r: number): boolean => {
    if (Math.abs(p.x) > HALF - L.edge - r || Math.abs(p.z) > HALF - L.edge - r) return false;
    if (Math.hypot(p.x - keep.x, p.z - keep.z) < margins.layout.keepOutGate + r) return false;
    return !insideAny(p, r + L.gap, { circles, boxes });
  };
  const inZone = (z: Zone) => ({ x: z.x0 + L.edge + rng() * (z.x1 - z.x0 - 2 * L.edge), z: z.z0 + L.edge + rng() * (z.z1 - z.z0 - 2 * L.edge) });
  for (const z of margins.zones) {
    for (let i = 0; i < z.hills; i++) for (let a = 0; a < 30; a++) {
      const p = inZone(z), r = between(L.hillR, rng());
      if (Math.hypot(p.x - keep.x, p.z - keep.z) < margins.layout.keepOutGate + r) continue;
      if (out.hills.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < (h.r + r) * 0.9)) continue;
      out.hills.push({ ...p, r, h: r * 0.45 });
      break;
    }
    for (let i = 0; i < z.stacks; i++) for (let a = 0; a < 40; a++) {
      const p = inZone(z), r = between(L.stack, rng());
      if (!ok(p, r)) continue;
      out.stacks.push({ ...p, r }); circles.push({ ...p, r });
      break;
    }
    for (let i = 0; i < z.shelves; i++) for (let a = 0; a < 40; a++) {
      const p = inZone(z), turn = rng() < 0.5, w = turn ? L.shelf[1] : L.shelf[0], d = turn ? L.shelf[0] : L.shelf[1];
      if (!ok(p, Math.max(w, d) / 2)) continue;
      const b = { ...p, w, d };
      out.shelves.push(b); boxes.push(b);
      break;
    }
    for (let i = 0; i < z.trees; i++) for (let a = 0; a < 40; a++) {
      const p = inZone(z), r = between(L.treeR, rng());
      if (!ok(p, r)) continue;
      out.trees.push({ ...p, r }); circles.push({ ...p, r });
      break;
    }
    for (let i = 0; i < z.bushes; i++) for (let a = 0; a < 40; a++) {
      const p = inZone(z), r = between(L.bushR, rng());
      if (!ok(p, r)) continue;
      out.bushes.push({ ...p, r }); circles.push({ ...p, r });
      break;
    }
  }
  return out;
}

// --- Where you can walk, and the way home ---------------------------------------------------------
export type Field = { n: number; cell: number; clear: boolean[]; dist: number[]; next: number[]; home: number };
const idx = (f: { n: number }, i: number, j: number) => j * f.n + i;
export function cellCentre(f: { n: number; cell: number }, i: number, j: number): Vec { return { x: -HALF + (i + 0.5) * f.cell, z: -HALF + (j + 0.5) * f.cell }; }
export function cellOf(f: { n: number; cell: number }, p: Vec): { i: number; j: number } {
  return { i: Math.min(f.n - 1, Math.max(0, Math.floor((p.x + HALF) / f.cell))), j: Math.min(f.n - 1, Math.max(0, Math.floor((p.z + HALF) / f.cell))) };
}
// A flood fill outwards from the way home: every cell the player can stand in gets a distance and a next step.
export function buildField(cols: Colliders, cell = margins.field.cell, margin = margins.field.margin): Field {
  const n = Math.round(margins.size / cell), f: Field = { n, cell, clear: new Array(n * n).fill(false), dist: new Array(n * n).fill(-1), next: new Array(n * n).fill(-1), home: -1 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) f.clear[idx(f, i, j)] = !insideAny(cellCentre(f, i, j), margin, cols);
  const h = cellOf(f, homePoint());
  let start = idx(f, h.i, h.j);
  if (!f.clear[start]) start = f.clear.findIndex(Boolean);
  f.home = start;
  f.dist[start] = 0;
  const q = [start];
  for (let k = 0; k < q.length; k++) {
    const c = q[k], ci = c % n, cj = Math.floor(c / n);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const m = idx(f, ni, nj);
      if (!f.clear[m] || f.dist[m] >= 0) continue;
      if (di && dj && (!f.clear[idx(f, ci + di, cj)] || !f.clear[idx(f, ci, cj + dj)])) continue; // no cutting corners
      f.dist[m] = f.dist[c] + 1; f.next[m] = c; q.push(m);
    }
  }
  return f;
}
export const reachable = (f: Field, p: Vec): boolean => { const c = cellOf(f, p); const k = idx(f, c.i, c.j); return f.clear[k] && f.dist[k] >= 0; };
// The cell to start from: the player's own, or the nearest reachable one (the player hugs trees).
export function nearestReachable(f: Field, p: Vec): number {
  const c = cellOf(f, p);
  for (let r = 0; r < 6; r++) {
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = c.i + di, j = c.j + dj;
      if (i < 0 || j < 0 || i >= f.n || j >= f.n) continue;
      const k = idx(f, i, j);
      if (f.dist[k] < 0) continue;
      const d = Math.hypot(cellCentre(f, i, j).x - p.x, cellCentre(f, i, j).z - p.z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return best;
  }
  return -1;
}
// The path home as points: follow the flood fill, then the point in front of the gate.
export function homePath(f: Field, from: Vec, maxSteps = 400): Vec[] {
  let k = nearestReachable(f, from);
  if (k < 0) return [];
  const out: Vec[] = [from];
  for (let s = 0; s < maxSteps && k >= 0; s++) {
    out.push(cellCentre(f, k % f.n, Math.floor(k / f.n)));
    if (k === f.home) break;
    k = f.next[k];
  }
  return out;
}
// Points along a path, `spacing` apart, starting `start` along it and sliding on by `shift`.
export function along(path: Vec[], start: number, spacing: number, count: number, shift = 0): { p: Vec; heading: number; u: number }[] {
  const total = pathLength(path), res: { p: Vec; heading: number; u: number }[] = [];
  if (total < 1e-6) return res;
  for (let i = 0; i < count; i++) {
    const s = start + shift + i * spacing;
    if (s >= total) break;
    const { p, heading } = pointAlong(path, s / total);
    res.push({ p, heading, u: i / Math.max(1, count - 1) });
  }
  return res;
}

// --- The daily scatter of folded pages ---------------------------------------------------------------
export type Spot = { id: number; x: number; z: number; zone: string; kind: Find };
export function pickKind(roll: number, w: Record<string, number> = margins.spots.weights): Find {
  const total = w.ink + w.glyph + w.scrap;
  const r = roll * total;
  return r < w.ink ? "ink" : r < w.ink + w.glyph ? "glyph" : "scrap";
}
// The same day always gives the same pages, in the same places, for every player.
export function spotsForDay(day: string, layout: Layout, field: Field): Spot[] {
  const rng = mulberry32(hashString(`${layout.seed}:${day}`)), S = margins.spots, spots: Spot[] = [];
  const home = homePoint();
  for (const z of margins.zones) {
    for (let i = 0; i < z.spots; i++) {
      let placed = false;
      for (let a = 0; a < 300 && !placed; a++) {
        const p = { x: z.x0 + S.edge + rng() * (z.x1 - z.x0 - 2 * S.edge), z: z.z0 + S.edge + rng() * (z.z1 - z.z0 - 2 * S.edge) };
        if (Math.abs(p.x) > HALF - S.edge || Math.abs(p.z) > HALF - S.edge) continue;
        if (insideAny(p, S.clear, layout.cols) || !reachable(field, p)) continue;
        if (Math.hypot(p.x - home.x, p.z - home.z) < S.fromGate) continue;
        if (spots.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < S.apart)) continue;
        spots.push({ id: spots.length, x: p.x, z: p.z, zone: z.id, kind: pickKind(rng()) });
        placed = true;
      }
    }
  }
  return spots;
}
export const spotsLeft = (spots: Spot[], opened: Set<number>): number => spots.filter((s) => !opened.has(s.id)).length;
// The folded page the player could unfold now: the nearest unopened one within reach.
export function nearestSpot(p: Vec, spots: Spot[], opened: Set<number>, reach: number = margins.unfold.reach): Spot | null {
  let best: Spot | null = null, bd = Infinity;
  for (const s of spots) {
    if (opened.has(s.id)) continue;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d <= reach && d < bd) { best = s; bd = d; }
  }
  return best;
}
// Glints can be seen from some way off; they fade out rather than pop.
export function glintOpacity(distance: number, all = false): number {
  const g = margins.glint;
  return all ? 1 : 1 - ease(clamp01((distance - g.visible) / (g.fadeTo - g.visible)));
}

// --- The unfold gesture ---------------------------------------------------------------------------------
// The ring fills while E is held. Letting go drains it smoothly instead of cutting it off.
export function holdStep(progress: number, holding: boolean, dt: number, seconds: number = margins.unfold.holdSeconds): number {
  return clamp01(progress + (holding ? dt / seconds : -dt / (seconds * 0.35)));
}
// t is seconds since the hold finished. Three beats, then the find rises, spins and arcs to the player.
export function unfoldFrame(t: number, reduced = false): { corner: number; fold: number; rise: number; spin: number; arc: number; done: boolean } {
  const U = margins.unfold, k = reduced ? margins.travel.reducedFactor : 1, b = U.beat * k;
  const corner = ease(clamp01(t / b)), fold = ease(clamp01((t - b) / b)), flat = ease(clamp01((t - 2 * b) / b));
  const rise = ease(clamp01((t - 3 * b) / (U.riseSeconds * k)));
  const arc = ease(clamp01((t - 3 * b - U.riseSeconds * k) / (U.arcSeconds * k)));
  const spin = reduced ? 0 : rise * Math.PI * 2;
  // the page: 0 closed -> 1 lying flat. The corner beat lifts it a little, the fold beat opens it, the flat beat settles it.
  return { corner, fold: Math.min(1, corner * 0.25 + fold * 0.65 + flat * 0.1), rise, spin, arc, done: t >= 3 * b + (U.riseSeconds + U.arcSeconds) * k };
}
export const unfoldSeconds = (reduced = false): number => { const U = margins.unfold, k = reduced ? margins.travel.reducedFactor : 1; return 3 * U.beat * k + (U.riseSeconds + U.arcSeconds) * k; };
