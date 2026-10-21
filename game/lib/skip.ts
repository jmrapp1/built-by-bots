// Pure page-skipping rules for the garden pond: a folded page leaves the hand, skips a few times and soaks in.
// No three.js, clock or randomness here: the seed is passed in, so one press always gives one result.
// Numbers live in data/pond.json ("skip"). Positions are in the pond frame: `along` runs from the thrower
// across the pond's centre (away from the thrower), `side` is to the thrower's right.
import { POND, distToPond, isDay, pondPlace } from "@/lib/pond";
import type { Vec } from "@/lib/world";

export const SKIP = POND.skip;
export type SkipPoint = { along: number; side: number };
export type SkipPlan = { hops: number; landings: SkipPoint[]; seconds: number; hopSeconds: number };
export type SkipState = { flying: boolean };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);
// A small deterministic hash of the seed in 0..1; salt picks a different value for each use.
export function seedRoll(seed: number, salt = 0): number {
  let h = (Math.floor(seed) ^ 0x9e3779b9) + salt * 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const skipRadius = (): number => pondPlace().r - POND.player.edgeInset;

export function skipPlan(seed: number, reduced = false): SkipPlan {
  const [lo, hi] = SKIP.hops, hops = reduced ? SKIP.reducedHops : lo + Math.min(hi - lo, Math.floor(seedRoll(seed, 1) * (hi - lo + 1)));
  const R = skipRadius(), landings: SkipPoint[] = [];
  for (let i = 0; i < hops; i++) {
    const along = -R + SKIP.hopLength * (i + 1), want = (seedRoll(seed, 2 + i) * 2 - 1) * SKIP.wobble;
    const room = Math.sqrt(Math.max(0, R * R - along * along)); // stay inside the water's edge
    landings.push({ along, side: Math.max(-room, Math.min(room, want)) });
  }
  return { hops, landings, hopSeconds: SKIP.hopSeconds, seconds: hops * SKIP.hopSeconds + SKIP.settleSeconds + SKIP.soakSeconds };
}

// Day only; one page at a time. The Print's own pond play does not block it (the Print may watch).
export const canSkip = (hour: number, s: SkipState): boolean => isDay(hour) && !s.flying;

// Where the thrower is in the pond frame (before the pond, on the line through its centre).
export const handPoint = (from: Vec): SkipPoint => ({ along: -distToPond(from), side: 0 });
// Pond frame -> garden coordinates, for a thrower at `from`.
export function skipWorld(p: SkipPoint, from: Vec): Vec {
  const c = pondPlace(), d = Math.hypot(c.x - from.x, c.z - from.z) || 1, ax = (c.x - from.x) / d, az = (c.z - from.z) / d;
  return { x: c.x + ax * p.along + -az * p.side, z: c.z + az * p.along + ax * p.side };
}

export type SkipFrame = { at: SkipPoint; y: number; squash: number; opacity: number; spin: number; done: boolean; landed: number };
// The page at `age` seconds after the throw. Arcs low between landings, squashes on landing, floats, then soaks.
export function skipFrame(plan: SkipPlan, age: number, hand: SkipPoint, reduced = false): SkipFrame {
  const hs = plan.hopSeconds, flight = plan.hops * hs, last = plan.landings[plan.hops - 1];
  const fadeIn = reduced ? SKIP.reducedFadeSeconds : SKIP.fadeInSeconds, inA = clamp01(age / fadeIn);
  if (age >= plan.seconds) return { at: last, y: 0, squash: 1, opacity: 0, spin: 0, done: true, landed: plan.hops };
  if (age < flight) {
    const i = Math.min(plan.hops - 1, Math.floor(age / hs)), u = (age - i * hs) / hs, a = i === 0 ? hand : plan.landings[i - 1], b = plan.landings[i];
    const h = SKIP.hopHeight * SKIP.hopDecay ** i * (reduced ? 0.5 : 1), land = clamp01((u - 0.82) / 0.18);
    return {
      at: { along: a.along + (b.along - a.along) * u, side: a.side + (b.side - a.side) * u },
      y: 0.04 + h * 4 * u * (1 - u) + (i === 0 ? (1 - u) * 0.5 : 0), // the first hop starts at hand height
      squash: 1 - (reduced ? 0.1 : 0.3) * Math.sin(land * Math.PI), opacity: inA, spin: (reduced ? 0 : 1) * u * 1.2, done: false, landed: i,
    };
  }
  const s = age - flight, soak = clamp01((s - SKIP.settleSeconds) / SKIP.soakSeconds);
  return { at: last, y: 0.04 - 0.03 * ease(soak), squash: 1, opacity: 1 - ease(soak), spin: 0, done: false, landed: plan.hops };
}
// Hop landings (0-based) that happened in (t0, t1]; each drops one ring.
export function skipLandings(plan: SkipPlan, t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < plan.hops; i++) { const at = (i + 1) * plan.hopSeconds; if (at > t0 && at <= t1) out.push(i); }
  return out;
}
// The watching Print's little hop at the last landing (none when reduced).
export function watcherHop(plan: SkipPlan, age: number, reduced: boolean): number {
  const at = plan.hops * plan.hopSeconds, u = (age - at) / SKIP.headTurnSeconds;
  return reduced || u < 0 || u > 1 ? 0 : SKIP.watcherHop * Math.sin(u * Math.PI);
}
// The Print watches while the page is up, if it is awake and within its call radius (the caller says awake).
export const printWatches = (awake: boolean, printAt: Vec): boolean => awake && distToPond(printAt) <= POND.callRadius;
