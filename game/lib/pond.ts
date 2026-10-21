// Pure pond-play rules: when the Print visits the pond by day, the poses and splashes of the visit,
// the rings that spread across the water, and the player's splash gesture. No three.js, clock or server.
// Numbers live in data/pond.json. Easing matches the sit and the feed (smoothstep).
import pond from "@/data/pond.json";
import { GARDEN, type Vec } from "@/lib/world";
import type { Pose } from "@/lib/play";

export const POND = pond;
export type PondPhase = "idle" | "watching" | "going" | "flinch" | "patting" | "splashing" | "leaving";
export type PondState = { phase: PondPhase; t: number; pats: number; answer: boolean };
export const PONDIDLE: PondState = { phase: "idle", t: 0, pats: 0, answer: false };
export type PondPose = Pose & { shake: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);
const calm = (reduced: boolean) => (reduced ? POND.calmFactor : 1);

export const pondPlace = () => {
  const p = GARDEN.places.find((q) => q.kind === "pond")!;
  return { x: p.x, z: p.z, r: p.solid ?? 3 };
};

// Where the Print stands to play (just outside the pond's collider) and where its splashes land.
export function shorePoint(): Vec {
  const c = pondPlace(), [dx, dz] = POND.shoreDir, n = Math.hypot(dx, dz);
  return { x: c.x + (dx / n) * (c.r + POND.standOff), z: c.z + (dz / n) * (c.r + POND.standOff) };
}
export function towardPond(from: Vec): number {
  const c = pondPlace();
  return Math.atan2(c.x - from.x, c.z - from.z);
}
export function splashSpot(shore: Vec = shorePoint()): Vec {
  const c = pondPlace(), d = Math.hypot(c.x - shore.x, c.z - shore.z);
  return { x: shore.x + ((c.x - shore.x) / d) * POND.splashReach, z: shore.z + ((c.z - shore.z) / d) * POND.splashReach };
}
// The water's edge nearest a given point (for the player's splash).
export function edgeNear(p: Vec): Vec {
  const c = pondPlace(), d = Math.hypot(p.x - c.x, p.z - c.z) || 1, r = c.r - POND.player.edgeInset;
  return { x: c.x + ((p.x - c.x) / d) * r, z: c.z + ((p.z - c.z) / d) * r };
}
export const distToPond = (p: Vec): number => { const c = pondPlace(); return Math.hypot(p.x - c.x, p.z - c.z); };

// Dev-only preview: "?pond=1" starts the Print patting at the shore, "?pond=splash" holds the big splash.
// Ignored in production builds, like ?species=.
export function pondOverride(search: string, isProduction: boolean): "1" | "splash" | null {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("pond");
  return v === "1" || v === "splash" ? v : null;
}
export function overrideState(o: "1" | "splash"): PondState {
  return o === "splash" ? { phase: "splashing", t: 0, pats: 0, answer: false } : { phase: "patting", t: 0, pats: POND.pats, answer: false };
}

// Visits happen by day, for a Print that is awake, and not too far away.
export const isDay = (hour: number): boolean => { const h = ((hour % 24) + 24) % 24; return h >= POND.dayFrom && h < POND.dayTo; };
// The player's own splash follows the same day window as the Print's visits: none at night.
export const canPlayerSplash = (hour: number): boolean => isDay(hour);
export const between = ([a, b]: number[], roll: number): number => a + clamp01(roll) * (b - a);
export const firstVisitDelay = (roll: number) => between(POND.firstVisit, roll);
export const nextVisitDelay = (roll: number) => between(POND.spacing, roll);
export const retryDelay = (roll: number) => between(POND.retry, roll);
export function canStartVisit(hour: number, awake: boolean, from: Vec): boolean {
  return awake && isDay(hour) && distToPond(from) <= POND.maxDistance;
}

export function phaseSeconds(s: PondState): number {
  switch (s.phase) {
    case "watching": return POND.watchSeconds;
    case "flinch": return POND.flinchSeconds;
    case "patting": return s.pats * POND.patPeriod;
    case "splashing": return POND.bigSplashSeconds;
    case "leaving": return POND.leaveSeconds;
    default: return Infinity; // idle and going end by events, not by time
  }
}
export function pondStart(answer = false): PondState {
  return answer ? { phase: "flinch", t: 0, pats: POND.answerPats, answer: true } : { phase: "watching", t: 0, pats: POND.pats, answer: false };
}
// Time passes. Returns the new state; watching->going is done by the caller once the route exists.
export function pondAdvance(s: PondState, dt: number): PondState {
  if (s.phase === "idle") return s;
  const t = s.t + dt;
  if (t < phaseSeconds(s)) return { ...s, t };
  switch (s.phase) {
    case "watching": return { ...s, phase: "going", t: 0 };
    case "flinch": return { ...s, phase: "patting", t: 0 };
    case "patting": return s.answer ? { ...s, phase: "leaving", t: 0 } : { ...s, phase: "splashing", t: 0 };
    case "splashing": return { ...s, phase: "leaving", t: 0 };
    case "leaving": return PONDIDLE;
    default: return { ...s, t };
  }
}
export const arrived = (s: PondState): PondState => (s.phase === "going" ? { ...s, phase: "patting", t: 0 } : s);
export const pondBusy = (s: PondState): boolean => s.phase !== "idle";
// A splash from the player while the Print is at the shore makes it answer; elsewhere, nearby, it comes over.
export function answerTo(s: PondState, printAt: Vec, hour: number, awake: boolean): PondState {
  const shore = shorePoint(), atShore = Math.hypot(printAt.x - shore.x, printAt.z - shore.z) < 1.2;
  if (!awake || !isDay(hour)) return s;
  if (atShore && (s.phase === "patting" || s.phase === "splashing")) return pondStart(true);
  if (s.phase === "idle" && distToPond(printAt) <= POND.callRadius) return pondStart(false);
  return s;
}

// Number of pats (taps on the water) that landed between two times in the patting phase.
export function tapsBetween(t0: number, t1: number): number {
  let n = 0;
  for (let k = 0; k * POND.patPeriod < t1; k++) { const at = (k + 0.5) * POND.patPeriod; if (at > t0 && at <= t1) n++; }
  return n;
}
export const bigSplashLanded = (t0: number, t1: number): boolean => POND.bigSplashAt > t0 && POND.bigSplashAt <= t1;

export function pondPose(s: PondState, reduced = false): PondPose {
  const c = calm(reduced);
  switch (s.phase) {
    case "watching": { // stop, turn and perk up
      const u = ease(clamp01(s.t / (POND.watchSeconds * 0.6)));
      return { lean: -0.12 * u * c, squash: 1 + 0.08 * u, hop: 0, shake: 0 };
    }
    case "going": // a bouncier trot
      return { lean: 0.05, squash: 1, hop: (reduced ? 0.02 : 0.06) * Math.abs(Math.sin(s.t * 9)), shake: 0 };
    case "flinch": { // squash and hop back
      const u = clamp01(s.t / POND.flinchSeconds);
      return { lean: -0.2 * Math.sin(u * Math.PI) * c, squash: 1 - 0.18 * Math.sin(u * Math.PI), hop: reduced ? 0 : 0.14 * Math.sin(u * Math.PI), shake: 0 };
    }
    case "patting": { // lean in, tap, tap
      const lean = 0.36 * ease(clamp01(s.t / 0.45)); // holds the lean, the next phase eases it out
      const p = (s.t / POND.patPeriod) % 1, tap = Math.max(0, Math.sin(p * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) ** 4;
      return { lean, squash: 1 - 0.14 * tap * c - 0.04 * ease(clamp01(s.t / 0.45)), hop: 0, shake: 0 };
    }
    case "splashing": { // a hop and a bigger splash
      const u = clamp01(s.t / POND.bigSplashSeconds);
      return { lean: 0.36 * (1 - ease(u)), squash: 1 - 0.1 * Math.sin(Math.min(1, u * 2) * Math.PI), hop: reduced ? 0 : 0.28 * Math.sin(clamp01(u * 1.6) * Math.PI), shake: 0 };
    }
    case "leaving": { // shimmy side to side, settling
      const u = clamp01(s.t / POND.leaveSeconds);
      return { lean: 0.36 * (1 - ease(clamp01(u * 3))), squash: 1, hop: 0, shake: reduced ? 0 : 0.28 * Math.sin(u * Math.PI * 7) * (1 - u) };
    }
    default: return { lean: 0, squash: 1, hop: 0, shake: 0 };
  }
}

// --- Splashes: rings and drops ---------------------------------------------------------------
export type Splash = { start: number; x: number; z: number; big: boolean; ringOnly?: boolean }; // ringOnly: a skipped page's landing (a ring, no drops)
export const splashLife = (big: boolean, reduced: boolean) => (big ? POND.ring.bigLife : POND.ring.life) * (reduced ? POND.ring.reducedSlow : 1);

// A ring starts small at the splash and spreads across the pond. Its radius passes the far edge so the
// ring is cut off by the water's edge (the renderer clips it to the pond), then it fades out.
export function ringAt(age: number, big: boolean, reduced: boolean, delay = 0, at: Vec = { x: 0, z: 0 }): { radius: number; opacity: number } {
  const c = pondPlace(), life = splashLife(big, reduced), u = clamp01((age - delay) / life);
  if (age < delay || u >= 1) return { radius: 0, opacity: 0 };
  const far = Math.hypot(at.x - c.x, at.z - c.z) + c.r; // the farthest the ring needs to go
  const fadeIn = clamp01(u / 0.08);
  return { radius: 0.12 + ease(u) * far, opacity: POND.ring.opacity * (reduced ? POND.ring.reducedOpacity : 1) * fadeIn * (1 - u) ** 1.2 };
}
export const ringCount = (big: boolean, reduced: boolean): number => (reduced ? 1 : big ? 2 : 1);
export const ringDelay = (i: number) => i * 0.28;

export type Drop = { x: number; y: number; z: number; scale: number; opacity: number; dark: boolean };
export function dropsAt(age: number, big: boolean, reduced: boolean): Drop[] {
  const d = POND.drops, life = big ? d.bigLife : d.life, f = reduced ? d.reducedFactor : 1;
  if (age < 0 || age >= life) return [];
  const n = Math.max(1, Math.round((big ? d.big : d.small) * f)), u = age / life, h = (big ? d.bigHeight : d.height) * f;
  const out: Drop[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963, reach = (big ? d.bigSpread : d.spread) * (0.45 + 0.55 * ((i * 0.618) % 1)) * f;
    const rise = 4 * u * (1 - u); // up and back down: an arc, not a flat sprite
    out.push({ x: Math.cos(a) * reach * u, y: h * rise * (0.7 + 0.3 * ((i * 0.37) % 1)), z: Math.sin(a) * reach * u, scale: d.size * (big ? 1.3 : 1) * (1 - 0.4 * u), opacity: Math.sin(Math.min(1, u * 1.1) * Math.PI) ** 0.5 * 0.9, dark: i % 3 === 0 });
  }
  return out;
}
export const maxDrops = (): number => POND.drops.big * POND.maxSplashes;

// The player's splash: lean over, hold, rise. frame.lean is 0..1, and the splash lands once.
export function playerLean(t: number): number {
  const p = POND.player, total = p.downSeconds + p.holdSeconds + p.upSeconds;
  if (t < 0 || t >= total) return 0;
  if (t < p.downSeconds) return ease(t / p.downSeconds);
  if (t < p.downSeconds + p.holdSeconds) return 1;
  return 1 - ease((t - p.downSeconds - p.holdSeconds) / p.upSeconds);
}
export const playerGestureSeconds = (): number => POND.player.downSeconds + POND.player.holdSeconds + POND.player.upSeconds;
export const playerSplashLanded = (t0: number, t1: number): boolean => POND.player.splashAt > t0 && POND.player.splashAt <= t1;
