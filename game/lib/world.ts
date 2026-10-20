// Pure world rules: movement, collision, camera pull-in, interaction and Print
// wandering. No three.js here, so everything is unit-tested. Positions are on a
// flat x/z map; colliders are circles and boxes (no mesh collision).
import garden from "@/data/garden.json";

export type Vec = { x: number; z: number };
export type Circle = { x: number; z: number; r: number };
export type Box = { x: number; z: number; w: number; d: number }; // centred
export type Place = { id: string; kind: string; x: number; z: number; solid?: number; label: string; prompt: string };
export type GardenData = typeof garden & { places: Place[] };
export const GARDEN = garden as unknown as GardenData;

// W3: Home is the named part of the Home Meadow where the Print lives: today's garden, a square of `size` metres round the origin.
// The Print's wander, routes, bedtime, pond, sit and hide and seek, the foraging spots and the garden props are all scoped to it
// through this one place. The player can walk the whole World; the Print never targets a point outside Home.
export const HOME = { size: GARDEN.size, half: GARDEN.size / 2 } as const;
/** Is the point inside Home, with `margin` metres to spare from its edge? */
export const inHome = (p: { x: number; z: number }, margin = 0): boolean => Math.abs(p.x) <= HOME.half - margin && Math.abs(p.z) <= HOME.half - margin;

export type Colliders = { circles: Circle[]; boxes: Box[] };

export function colliders(g: GardenData = GARDEN): Colliders {
  const circles: Circle[] = g.trees.map((t) => ({ x: t.x, z: t.z, r: t.r }));
  for (const p of g.places) if (p.solid) circles.push({ x: p.x, z: p.z, r: p.solid });
  for (const q of (g as { posts?: Circle[] }).posts ?? []) circles.push({ x: q.x, z: q.z, r: q.r }); // the gate posts
  const boxes: Box[] = g.hedges.map((h) => ({ x: h.x, z: h.z, w: h.w, d: h.d }));
  return { circles, boxes };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampToBounds(p: Vec, radius: number, size: number = HOME.size): Vec {
  const lim = size / 2 - radius;
  return { x: clamp(p.x, -lim, lim), z: clamp(p.z, -lim, lim) };
}

// Push a circle of `radius` out of every collider.
export function pushOut(p: Vec, radius: number, cols: Colliders): Vec {
  let { x, z } = p;
  for (let i = 0; i < 3; i++) {
    for (const c of cols.circles) {
      let dx = x - c.x, dz = z - c.z;
      let d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min) {
        if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    for (const b of cols.boxes) {
      const hx = b.w / 2, hz = b.d / 2;
      const cx = clamp(x, b.x - hx, b.x + hx), cz = clamp(z, b.z - hz, b.z + hz);
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        if (d < radius) { x = cx + (dx / d) * radius; z = cz + (dz / d) * radius; }
      } else {
        // centre is inside the box: leave by the nearest side
        const left = x - (b.x - hx), right = b.x + hx - x, up = z - (b.z - hz), down = b.z + hz - z;
        const m = Math.min(left, right, up, down);
        if (m === left) x = b.x - hx - radius;
        else if (m === right) x = b.x + hx + radius;
        else if (m === up) z = b.z - hz - radius;
        else z = b.z + hz + radius;
      }
    }
  }
  return { x, z };
}

export function insideAny(p: Vec, margin: number, cols: Colliders): boolean {
  return (
    cols.circles.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + margin) ||
    cols.boxes.some((b) => Math.abs(p.x - b.x) < b.w / 2 + margin && Math.abs(p.z - b.z) < b.d / 2 + margin)
  );
}

// forward/right in -1..1. yaw is the camera heading; at yaw 0 the camera looks along -z.
export function movePlayer(
  pos: Vec, input: { forward: number; right: number }, yaw: number, speed: number, dt: number,
  radius: number, cols: Colliders, size: number = HOME.size,
): { pos: Vec; moving: boolean; heading: number | null } {
  let f = input.forward, r = input.right;
  const len = Math.hypot(f, r);
  if (len < 1e-6) return { pos, moving: false, heading: null };
  if (len > 1) { f /= len; r /= len; }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = (fx * f + rx * r) * speed * dt, dz = (fz * f + rz * r) * speed * dt;
  const next = pushOut(clampToBounds({ x: pos.x + dx, z: pos.z + dz }, radius, size), radius, cols);
  return { pos: next, moving: true, heading: Math.atan2(dx, dz) };
}

// How far the camera may sit from the target along `dir` before it would enter scenery.
export function cameraDistance(target: Vec, dir: Vec, desired: number, min: number, cols: Colliders): number {
  for (let d = 0.5; d <= desired; d += 0.25) {
    if (insideAny({ x: target.x + dir.x * d, z: target.z + dir.z * d }, 0.3, cols)) return Math.max(min, d - 0.25);
  }
  return desired;
}

export function nearestPlace(pos: Vec, places: Place[] = GARDEN.places, reach: number = GARDEN.interactRadius): Place | null {
  let best: Place | null = null, bestD = Infinity;
  for (const p of places) {
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d <= reach + (p.solid ?? 0) && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

export type Wander = { x: number; z: number; tx: number; tz: number; wait: number; heading: number };

export function newWander(at: Vec): Wander {
  return { x: at.x, z: at.z, tx: at.x, tz: at.z, wait: 1, heading: 0 };
}

// Free wandering: walk to a random spot, pause, repeat. Never follows the player.
export function stepWander(w: Wander, dt: number, rng: () => number, radius: number, speed: number, cols: Colliders, size: number = HOME.size): Wander {
  if (w.wait > 0) return { ...w, wait: w.wait - dt };
  const dx = w.tx - w.x, dz = w.tz - w.z;
  const d = Math.hypot(dx, dz);
  const pick = (): Wander => {
    const lim = size / 2 - radius - 1;
    for (let i = 0; i < 12; i++) {
      const t = { x: (rng() * 2 - 1) * lim, z: (rng() * 2 - 1) * lim };
      if (!insideAny(t, radius + 0.3, cols)) return { ...w, tx: t.x, tz: t.z, wait: 2 + rng() * 4 };
    }
    return { ...w, wait: 2 };
  };
  if (d < 0.2) return pick();
  const step = Math.min(d, speed * dt);
  const moved = pushOut(clampToBounds({ x: w.x + (dx / d) * step, z: w.z + (dz / d) * step }, radius, size), radius, cols);
  const blocked = Math.hypot(moved.x - (w.x + (dx / d) * step), moved.z - (w.z + (dz / d) * step)) > 0.01;
  const next: Wander = { ...w, x: moved.x, z: moved.z, heading: Math.atan2(dx, dz) };
  return blocked ? { ...pick(), x: moved.x, z: moved.z, heading: next.heading } : next;
}

// Feeding happens next to a hatched Print, wherever it has wandered to.
export function printInReach(player: Vec, print: Vec | null, reach: number = GARDEN.print.feedReach): boolean {
  return !!print && Math.hypot(player.x - print.x, player.z - print.z) <= reach;
}

// Hover height with a gentle bob. The bob is capped so it can never reach the ground.
export function hoverY(t: number, hover: number = GARDEN.player.hoverHeight, bob: number = GARDEN.player.bob): number {
  return hover + Math.sin(t / 400) * Math.min(bob, hover * 0.5);
}
