// Pure night-time rules: when the Print sleeps, how it walks to bed, and the fireflies.
// Everything depends only on the local hour (the same clock as the light, including ?hour=).
// No three.js, server or clock access here, so it is all unit-tested. Tuning is in data/night.json.
import night from "@/data/night.json";
import { GARDEN, HOME, insideAny, pushOut, type Colliders, type Vec } from "@/lib/world";
import type { Pose, Puff } from "@/lib/play";

export const NIGHT = night;
export type Phase = "awake" | "going" | "asleep";

const norm = (h: number) => ((h % 24) + 24) % 24;
const ease = (n: number) => n * n * (3 - 2 * n);
const ramp = (h: number, [a, b]: number[]) => Math.min(1, Math.max(0, (h - a) / (b - a)));
const calm = (reduced: boolean) => (reduced ? NIGHT.calmFactor : 1);

// Awake by day, heading to bed in the early evening, asleep until morning. Wraps at midnight.
export function sleepPhase(hour: number): Phase {
  const h = norm(hour);
  if (h >= NIGHT.sleepFrom || h < NIGHT.wakeAt) return "asleep";
  return h >= NIGHT.bedtimeFrom ? "going" : "awake";
}

// 0 by day, fading in through dusk, 1 at night, fading out at dawn.
export function fireflyLevel(hour: number): number {
  const h = norm(hour), f = NIGHT.fireflies;
  if (h >= f.fadeIn[0] && h < f.fadeIn[1]) return ease(ramp(h, f.fadeIn));
  if (h >= f.fadeIn[1] || h < f.fadeOut[0]) return 1;
  if (h < f.fadeOut[1]) return 1 - ease(ramp(h, f.fadeOut));
  return 0;
}

// Each firefly loops lazily around a tree or the pond, so they gather where it is cosy.
export function fireflyAnchors(g = GARDEN): Vec[] {
  const pond = g.places.find((p) => p.kind === "pond");
  return [...g.trees.map((t) => ({ x: t.x, z: t.z })), ...(pond ? [{ x: pond.x, z: pond.z }] : [])];
}
export function fireflyAt(i: number, t: number, anchors: Vec[], reduced = false): { x: number; y: number; z: number; glow: number } {
  const f = NIGHT.fireflies, a = anchors[i % anchors.length];
  const w = t * f.speed * (reduced ? 0.3 : 1), ph = i * 2.399963;
  const r = (f.orbit * (0.55 + 0.45 * Math.sin(i * 1.7 + 0.5) ** 2)) / Math.SQRT2; // so the loop stays within the orbit
  return {
    x: a.x + Math.cos(w + ph) * r, z: a.z + Math.sin(w * 1.3 + ph) * r,
    y: f.height + Math.sin(w * 1.9 + ph) * 0.4,
    glow: reduced ? 0.85 : 0.7 + 0.3 * Math.sin(t * 1.5 + ph * 3),
  };
}

// A yawn (a long stretch, then a wide squash) before bed, and a stretch with a small hop on waking.
export function stretchPose(t: number, hop: boolean, reduced = false): Pose {
  const u = Math.min(1, Math.max(0, t / (hop ? NIGHT.wakeSeconds : NIGHT.yawnSeconds)));
  const c = calm(reduced);
  return { lean: -0.15 * c * Math.sin(Math.PI * u), squash: 1 + 0.14 * c * Math.sin(2 * Math.PI * u), hop: hop && !reduced ? 0.15 * Math.sin(Math.PI * u) : 0 };
}
// Curled up: flat and round, with a slow breath.
export function sleepPose(t: number, reduced = false): Pose {
  return { lean: 0, squash: 0.74 + 0.035 * calm(reduced) * Math.sin((t / NIGHT.breathSeconds) * Math.PI * 2), hop: 0 };
}
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  return { lean: a.lean + (b.lean - a.lean) * k, squash: a.squash + (b.squash - a.squash) * k, hop: a.hop + (b.hop - a.hop) * k };
}

// Small ink curls that drift up from a sleeping Print, one every few seconds.
export function swirlPuffs(t: number, reduced = false): Puff[] {
  const s = NIGHT.swirl, out: Puff[] = [];
  for (let i = 0; i < s.slots; i++) {
    const age = (((t - i * s.every) % (s.every * s.slots)) + s.every * s.slots) % (s.every * s.slots);
    if (age >= s.life) continue;
    const u = age / s.life;
    out.push({ dx: Math.sin(u * 6 + i) * s.sway * calm(reduced), dy: s.rise * u * (reduced ? 0.5 : 1), scale: s.size * (0.6 + 0.6 * Math.sin(u * Math.PI)), opacity: Math.sin(u * Math.PI) * 0.8, angle: i * 2.1 });
  }
  return out;
}

// --- Getting to bed without getting stuck -------------------------------------------------
const segmentClear = (a: Vec, b: Vec, margin: number, cols: Colliders) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
  for (let i = 0; i <= n; i++) if (insideAny({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n }, margin, cols)) return false;
  return true;
};
// Waypoints (not including the start) from `from` to `to` that keep a body of `radius` clear of
// trees, hedges and places. A grid of clear points is searched, then the path is straightened.
export function routeTo(from: Vec, to: Vec, cols: Colliders, radius: number, size: number = HOME.size, area?: { x0: number; x1: number; z0: number; z1: number }): Vec[] {
  const m = radius + 0.15;
  if (segmentClear(from, to, m, cols)) return [to];
  const lim = size / 2 - radius - 1, step = 2, pts: Vec[] = [from, to];
  // `area` (S33) limits the search grid to a window, so a route in the wide World never builds a grid of the whole map.
  const a = area ?? { x0: -lim, x1: lim, z0: -lim, z1: lim };
  for (let x = a.x0; x <= a.x1; x += step) for (let z = a.z0; z <= a.z1; z += step) if (!insideAny({ x, z }, m, cols)) pts.push({ x, z });
  const dist = new Array(pts.length).fill(Infinity), prev = new Array(pts.length).fill(-1), done = new Array(pts.length).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < pts.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < pts.length; v++) {
      if (done[v]) continue;
      const d = Math.hypot(pts[u].x - pts[v].x, pts[u].z - pts[v].z);
      if (d <= step * 2.3 && dist[u] + d < dist[v] && segmentClear(pts[u], pts[v], m, cols)) { dist[v] = dist[u] + d; prev[v] = u; }
    }
  }
  if (prev[1] < 0) return [to]; // no clear route found: head straight there and let collisions slide it along
  const path: Vec[] = [];
  for (let i = 1; i >= 0; i = prev[i]) path.unshift(pts[i]);
  const out: Vec[] = [];
  let at = 0;
  while (at < path.length - 1) {
    let k = path.length - 1;
    while (k > at + 1 && !segmentClear(path[at], path[k], m, cols)) k--;
    out.push(path[k]);
    at = k;
  }
  return out;
}

// One step along a route. Returns the new position, heading and whether the route is finished.
export function walkRoute(at: Vec, route: Vec[], leg: number, dt: number, radius: number, cols: Colliders, speed: number = NIGHT.walkSpeed): { pos: Vec; heading: number | null; leg: number; done: boolean } {
  if (leg >= route.length) return { pos: at, heading: null, leg, done: true };
  const tg = route[leg], dx = tg.x - at.x, dz = tg.z - at.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return { pos: at, heading: null, leg: leg + 1, done: leg + 1 >= route.length };
  const s = Math.min(d, speed * dt);
  return { pos: pushOut({ x: at.x + (dx / d) * s, z: at.z + (dz / d) * s }, radius, cols), heading: Math.atan2(dx, dz), leg, done: false };
}
