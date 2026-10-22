// Come along: by day the Print can walk with the player. Pure rules only (no three.js, clock, randomness or server);
// World.tsx wires them in. Numbers live in data/follow.json. Nothing here is stored or sent.
import follow from "@/data/follow.json";
import { GARDEN, insideAny, pushOut, type Colliders, type Vec } from "@/lib/world";
import { puffAt, type Pose, type Puff } from "@/lib/play";
import { isDay } from "@/lib/pond";

export const FOLLOW = follow;
export const FOLLOW_TEXT = follow.text;
export type FollowPhase = "idle" | "hop" | "on" | "settle";
export type FollowState = { phase: FollowPhase; t: number; total: number; still: number };
export const FOLLOWIDLE: FollowState = { phase: "idle", t: 0, total: 0, still: 0 };
export type FollowPuff = Puff & { tone: "ink" };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const calm = (reduced: boolean) => (reduced ? FOLLOW.calmFactor : 1);

// Dev-only preview: "?follow=1" starts a walk at once (still only by day). Ignored in production builds, like ?hide= and ?pond=.
export const followOverride = (search: string, isProduction: boolean): "1" | null =>
  !isProduction && new URLSearchParams(search).get("follow") === "1" ? "1" : null;

// The Print owns its own movement from the hop to the end of the settle.
export const followActive = (s: FollowState): boolean => s.phase !== "idle";
// Hopping or walking along: the key press now means "stop".
export const followOn = (s: FollowState): boolean => s.phase === "hop" || s.phase === "on";

export type OfferCtx = { hour: number; awake: boolean; busy: boolean; panel: boolean; distance: number; following: boolean };
// The prompt shows (and C starts) only by day, near an awake, idle Print, with no panel open.
export const canOfferFollow = (c: OfferCtx): boolean =>
  !c.following && c.awake && isDay(c.hour) && !c.busy && !c.panel && c.distance <= FOLLOW.promptRadius;

export type StopCtx = { awake: boolean; hour: number; busy: boolean; panel: boolean; garden: boolean; distance: number };
// Anything that should end a walk: night, bedtime, another activity, a panel, a door or the map, or being left far behind.
export const followInterrupted = (c: StopCtx): boolean => !c.awake || !isDay(c.hour) || c.busy || c.panel || !c.garden || c.distance > FOLLOW.farEnd;

export const followStart = (): FollowState => ({ phase: "hop", t: 0, total: 0, still: 0 });
// Ends a walk gently (the settle). Already settling or idle: unchanged.
export const followEnd = (s: FollowState): FollowState => (s.phase === "hop" || s.phase === "on" ? { phase: "settle", t: 0, total: s.total, still: 0 } : s);

// Time passes. playerSpeed is how fast the player is moving now (units per second). Standing still or a minute of walking ends it.
export function followAdvance(s: FollowState, dt: number, playerSpeed: number): FollowState {
  switch (s.phase) {
    case "hop": { const t = s.t + dt; return t >= FOLLOW.hopSeconds ? { phase: "on", t: 0, total: 0, still: 0 } : { ...s, t }; }
    case "on": {
      const total = s.total + dt, still = playerSpeed < FOLLOW.stillSpeed ? s.still + dt : 0;
      return total >= FOLLOW.maxSeconds || still >= FOLLOW.stillSeconds ? followEnd({ ...s, total, still }) : { ...s, total, still };
    }
    case "settle": { const t = s.t + dt; return t >= FOLLOW.settleSeconds ? FOLLOWIDLE : { ...s, t }; }
    default: return s;
  }
}

// Where the Print wants to be: a few steps behind the player and a little to one side, on a clear spot.
// heading is the way the player last walked (atan2(dx, dz)). Returns null when no clear spot is found (it then stays put).
export function followTarget(player: Vec, heading: number, cols: Colliders, radius: number = GARDEN.print.radius): Vec | null {
  const bx = -Math.sin(heading), bz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const half = GARDEN.size / 2 - radius - 0.5;
  for (const g of FOLLOW.gapTries) for (const side of FOLLOW.sides) {
    const p = { x: player.x + bx * FOLLOW.gap * g + rx * side, z: player.z + bz * FOLLOW.gap * g + rz * side };
    if (Math.abs(p.x) > half || Math.abs(p.z) > half) continue;
    if (Math.hypot(p.x - player.x, p.z - player.z) < FOLLOW.minGap) continue;
    if (!insideAny(p, radius + 0.1, cols)) return p;
  }
  return null;
}

// How fast to walk when this far from the target: a steady trot, a little faster the further behind, capped.
export function followSpeed(distToTarget: number): number {
  if (distToTarget < FOLLOW.arrive) return 0;
  const u = clamp01((distToTarget - FOLLOW.catchUpFrom) / (FOLLOW.catchUpTo - FOLLOW.catchUpFrom));
  return FOLLOW.baseSpeed + (FOLLOW.maxSpeed - FOLLOW.baseSpeed) * u;
}

// One frame of walking toward a waypoint. Never farther than speed*dt (no jumps), never into scenery (pushOut),
// and never closer to the player than minGap. Returns the new spot and whether it moved.
export function followMove(at: Vec, goal: Vec, speed: number, dt: number, player: Vec, cols: Colliders, radius: number = GARDEN.print.radius): { pos: Vec; heading: number | null; moving: boolean } {
  const dx = goal.x - at.x, dz = goal.z - at.z, d = Math.hypot(dx, dz);
  if (speed <= 0 || d < 1e-6) return { pos: at, heading: null, moving: false };
  const s = Math.min(d, speed * dt);
  const next = pushOut({ x: at.x + (dx / d) * s, z: at.z + (dz / d) * s }, radius, cols);
  if (Math.hypot(next.x - player.x, next.z - player.z) < FOLLOW.minGap && Math.hypot(next.x - player.x, next.z - player.z) < Math.hypot(at.x - player.x, at.z - player.z)) return { pos: at, heading: Math.atan2(dx, dz), moving: false };
  return { pos: next, heading: Math.atan2(dx, dz), moving: Math.hypot(next.x - at.x, next.z - at.z) > 1e-6 };
}

// Body pose: a small happy hop to start, a faint lean while walking, a small settle at the end. Calmer with reduced motion
// (a plain gentle follow: no hop).
export function followPose(s: FollowState, moving: boolean, reduced = false): Pose {
  const c = calm(reduced), rest: Pose = { lean: 0, squash: 1, hop: 0 };
  switch (s.phase) {
    case "hop": { const u = clamp01(s.t / FOLLOW.hopSeconds); return { ...rest, hop: reduced ? 0 : FOLLOW.hopHeight * Math.sin(u * Math.PI), squash: 1 - 0.08 * Math.sin(u * Math.PI) * c }; }
    case "on": return moving ? { ...rest, lean: 0.07 * c } : rest;
    case "settle": { const u = clamp01(s.t / FOLLOW.settleSeconds); return { ...rest, squash: 1 - 0.07 * Math.sin(u * Math.PI) * c }; }
    default: return rest;
  }
}

// A few ink drops trail from its feet while it walks. None with reduced motion.
export function followDrops(s: FollowState, moving: boolean, reduced = false): FollowPuff[] {
  if (reduced || s.phase !== "on" || !moving) return [];
  const k = Math.floor(s.total / FOLLOW.dropEvery), out: FollowPuff[] = [];
  for (let j = 0; j < 3; j++) { const p = puffAt(k - j, s.total - (k - j) * FOLLOW.dropEvery, false); if (p) out.push({ ...p, tone: "ink" }); }
  return out;
}
