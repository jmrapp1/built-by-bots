// Night sights in the Margins (slice T1): the hour window and fade, the daily pick, and the data check.
// Sights are looks only: no reward, no server, nothing saved. No three.js or clock here. Data in data/sights.json.
import raw from "@/data/sights.json";
import { MARGINS, gateFrame, inGateZone, mulberry32, zoneOf, type Layout } from "@/lib/margins";
import { dayNumber } from "@/lib/npcs";
import { insideAny, type Vec } from "@/lib/world";

export const SIGHT_KINDS = ["moth", "ink", "glint"] as const;
export type SightKind = (typeof SIGHT_KINDS)[number];
export type SightPoint = { x: number; z: number; kind: SightKind };
export type SightData = {
  window: { inFrom: number; inTo: number; outFrom: number; outTo: number };
  perNight: { min: number; max: number };
  clear: { scenery: number; pages: number; npc: number; gatePath: number };
  notice: { near: number; far: number };
  captions: Record<SightKind, string>;
  points: SightPoint[];
};

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };

// Everything checked; a bad point is skipped on its own. Bad top-level data gives null (no sights, the world loads).
// `bounds` limits where a point may lie; the default is the Margins square (unchanged). The shore passes its own.
export type SightBounds = { x0: number; x1: number; z0: number; z1: number };
const marginsBounds = (): SightBounds => { const h = MARGINS.size / 2 - 2; return { x0: -h, x1: h, z0: -h, z1: h }; };
export function checkSights(r: unknown, bounds: SightBounds = marginsBounds()): SightData | null {
  try {
    const d = r as Record<string, any>;
    if (!d || typeof d !== "object") return null;
    const w = d.window, p = d.perNight, c = d.clear, n = d.notice;
    if (!w || ![w.inFrom, w.inTo, w.outFrom, w.outTo].every(isNum)) return null;
    if (!(w.inFrom < w.inTo && w.inTo <= 24 && w.outFrom < w.outTo && w.outTo <= w.inFrom && w.outFrom >= 0)) return null;
    if (!p || !isNum(p.min) || !isNum(p.max) || p.min < 1 || p.max < p.min) return null;
    if (!c || ![c.scenery, c.pages, c.npc, c.gatePath].every((v) => isNum(v) && v >= 0)) return null;
    if (!n || !isNum(n.near) || !isNum(n.far) || n.near <= 0 || n.far <= n.near) return null;
    const caps = d.captions;
    if (!caps || !SIGHT_KINDS.every((k) => typeof caps[k] === "string" && caps[k].trim() && caps[k].length <= 60)) return null;
    if (!Array.isArray(d.points)) return null;
    const points: SightPoint[] = [];
    for (const q of d.points) {
      if (q && isNum(q.x) && isNum(q.z) && SIGHT_KINDS.includes(q.kind) && q.x >= bounds.x0 && q.x <= bounds.x1 && q.z >= bounds.z0 && q.z <= bounds.z1) points.push({ x: q.x, z: q.z, kind: q.kind });
    }
    return { window: w, perNight: p, clear: c, notice: n, captions: { moth: caps.moth, ink: caps.ink, glint: caps.glint }, points };
  } catch { return null; }
}
export const SIGHTS: SightData | null = checkSights(raw);

// 0 by day, 1 through the night; eases in over the dusk window and out over the dawn window.
export function sightLevel(hour: number, w: SightData["window"]): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= w.inFrom) return ease((h - w.inFrom) / (w.inTo - w.inFrom));
  if (h < w.outTo) return 1 - ease((h - w.outFrom) / (w.outTo - w.outFrom));
  return 0;
}
// A level step toward the target hour's level over about 2 s (so a clock moving past a boundary fades, never pops).
export function levelStep(cur: number, target: number, dt: number, reduced: boolean): number {
  const rate = dt / (reduced ? 0.15 : 2);
  return cur < target ? Math.min(target, cur + rate) : Math.max(target, cur - rate);
}

// Which points tonight: min..max of them by the UTC day number, with at least one per zone when possible.
// The same day always gives the same set (a reload shows the same ones); nothing is stored.
// `opts.salt` changes the seed (the default 0 keeps the Margins pick as it was); `opts.spread: false` drops the zone rule (one region).
export function pickSights(day: string, points: SightPoint[], perNight: { min: number; max: number }, opts: { salt?: number; spread?: boolean } = {}): SightPoint[] {
  const n = dayNumber(day);
  if (n === null || !points.length) return [];
  const rng = mulberry32((Math.imul(n + 1, 2654435761) ^ (opts.salt ?? 0)) >>> 0);
  const order = points.map((p, i) => ({ p, i, k: rng() })).sort((a, b) => a.k - b.k || a.i - b.i);
  const want = Math.min(points.length, perNight.min + Math.floor(rng() * (perNight.max - perNight.min + 1)));
  const out: SightPoint[] = [], zones = new Set<string>();
  if (opts.spread !== false) for (const o of order) { const z = zoneOf(o.p)?.id ?? "?"; if (!zones.has(z) && out.length < want) { zones.add(z); out.push(o.p); } }
  for (const o of order) if (out.length < want && !out.includes(o.p)) out.push(o.p);
  return out;
}

// A point is fine when it is clear of the scenery, today's folded pages, the neighbours and the gate path.
export function sightUsable(p: Vec, layout: Layout, pages: Vec[], npcs: Vec[], c: SightData["clear"]): boolean {
  if (insideAny(p, c.scenery, layout.cols) || inGateZone(p, "home")) return false;
  if (pages.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.pages)) return false;
  if (npcs.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < c.npc)) return false;
  const { g, d } = gateFrame("home"); // the walkway runs out from the Margins gate
  for (let t = 0; t <= 25; t += 0.5) if (Math.hypot(p.x - (g.x - d.x * t), p.z - (g.z - d.z * t)) < c.gatePath) return false;
  return true;
}

// Tonight's sights: the points that are clear today (scenery, today's folded pages, neighbours, gate path), then the daily pick.
export function sightsForDay(day: string, layout: Layout, pages: Vec[], npcs: Vec[], d: SightData): SightPoint[] {
  const usable = d.points.filter((p) => sightUsable(p, layout, pages, npcs, d.clear));
  return pickSights(day, usable, d.perNight);
}
