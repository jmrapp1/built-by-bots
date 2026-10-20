// Pure hide-and-seek rules: when the Print invites the player to play by day, where it hides, the poses and
// puffs of each step, and being found. No three.js, clock or server. Numbers live in data/hide.json.
// Easing matches the sit, the feed and the pond (smoothstep).
import hide from "@/data/hide.json";
import { GARDEN, insideAny, type Colliders, type Vec } from "@/lib/world";
import { puffAt, type Pose, type Puff } from "@/lib/play";
import { isDay } from "@/lib/pond";

export const HIDE = hide;
export type HidePhase = "idle" | "inviting" | "dashing" | "hiding" | "found" | "leaving";
export type HideState = { phase: HidePhase; t: number; tree: number; spot: Vec | null; perp: Vec | null };
export const HIDEIDLE: HideState = { phase: "idle", t: 0, tree: -1, spot: null, perp: null };
export type HidePose = Pose & { shake: number; spin: number; side: number };
export type HidePuff = Puff & { tone: "ink" | "gold" };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);
const calm = (reduced: boolean) => (reduced ? HIDE.calmFactor : 1);
const between = ([a, b]: number[], roll: number) => a + clamp01(roll) * (b - a);

export const firstGameDelay = (roll: number) => between(HIDE.firstGame, roll);
export const nextGameDelay = (roll: number) => between(HIDE.spacing, roll);
export const retryDelay = (roll: number) => between(HIDE.retry, roll);

// Dev-only preview: "?hide=1" starts a game at once, "?hide=found" jumps to the found burst.
// Ignored in production builds, like ?pond= and ?species=.
export function hideOverride(search: string, isProduction: boolean): "1" | "found" | null {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("hide");
  return v === "1" || v === "found" ? v : null;
}

// ?hide=found: put the Print hiding, a short way in front of the player (by the way they face), on a clear
// spot, so one E press shows the found burst. Tries straight ahead first, then swings round. Dev-only.
export function previewSpot(player: Vec, yaw: number, cols: Colliders, radius: number = GARDEN.print.radius): Spot {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dist = HIDE.previewDistance;
  let best: Spot | null = null;
  for (const deg of [0, 30, -30, 60, -60, 90, -90, 135, -135, 180]) {
    const a = (deg * Math.PI) / 180, dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
    const spot = { x: player.x + dx * dist, z: player.z + dz * dist };
    const lim = GARDEN.size / 2 - radius - HIDE.mapMargin;
    if (Math.abs(spot.x) > lim || Math.abs(spot.z) > lim || insideAny(spot, radius + 0.1, cols)) continue;
    const sp: Spot = { tree: -1, spot, perp: { x: -dz, z: dx } };
    // it should also have room to step out to its side
    const out = { x: spot.x + sp.perp.x * HIDE.stepOut, z: spot.z + sp.perp.z * HIDE.stepOut };
    if (insideAny(out, radius, cols)) { best = best ?? sp; continue; }
    return sp;
  }
  return best ?? { tree: -1, spot: { x: player.x + fx * dist, z: player.z + fz * dist }, perp: { x: -fz, z: fx } };
}
export const hideBusy = (s: HideState): boolean => s.phase !== "idle";

// A game starts by day, for an awake Print that is not busy with the pond, when the player is close.
export function canStartGame(hour: number, awake: boolean, pondIdle: boolean, print: Vec, player: Vec): boolean {
  return awake && pondIdle && isDay(hour) && Math.hypot(print.x - player.x, print.z - player.z) <= HIDE.inviteRadius;
}

export function phaseSeconds(s: HideState): number {
  switch (s.phase) {
    case "inviting": return HIDE.inviteSeconds;
    case "dashing": return HIDE.dashMaxSeconds;
    case "hiding": return HIDE.hideSeconds;
    case "found": return HIDE.foundSeconds;
    case "leaving": return HIDE.leaveSeconds;
    default: return Infinity;
  }
}
export const maxGameSeconds = (): number => HIDE.inviteSeconds + HIDE.dashMaxSeconds + HIDE.hideSeconds + HIDE.leaveSeconds;

export const hideStart = (): HideState => ({ ...HIDEIDLE, phase: "inviting" });
// Time passes. inviting->dashing needs a spot: the caller picks it (pickSpot) or cancels.
export function hideAdvance(s: HideState, dt: number): HideState {
  if (s.phase === "idle") return s;
  const t = s.t + dt;
  if (t < phaseSeconds(s)) return { ...s, t };
  switch (s.phase) {
    case "inviting": return { ...s, phase: "dashing", t: 0 };
    case "hiding": return { ...s, phase: "leaving", t: 0 }; // gives up: trots out by itself
    default: return HIDEIDLE; // a dash that never arrived, found and leaving all end here
  }
}
export const withSpot = (s: HideState, p: { tree: number; spot: Vec; perp: Vec }): HideState => ({ ...s, ...p });
export const hideArrived = (s: HideState): HideState => (s.phase === "dashing" ? { ...s, phase: "hiding", t: 0 } : s);
export const hideFound = (s: HideState): HideState => (s.phase === "hiding" ? { ...s, phase: "found", t: 0 } : s);
export const hideCancel = (): HideState => HIDEIDLE;
// "Found you!" shows only while the Print hides and the player is within reach.
export function canFind(s: HideState, player: Vec, print: Vec): boolean {
  return s.phase === "hiding" && Math.hypot(player.x - print.x, player.z - print.z) <= HIDE.reach;
}

// --- Where to hide ---------------------------------------------------------------------------
export type Spot = { tree: number; spot: Vec; perp: Vec };
// A point just behind a tree, on the line from the player through the trunk, so the tree is between them.
export function spotBehind(tree: number, player: Vec, behindRoll = 0.5): Spot | null {
  const t = GARDEN.trees[tree];
  const dx = t.x - player.x, dz = t.z - player.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return null;
  const ux = dx / d, uz = dz / d, away = t.r + between(HIDE.behind, behindRoll);
  return { tree, spot: { x: t.x + ux * away, z: t.z + uz * away }, perp: { x: -uz, z: ux } };
}
export function spotValid(sp: Spot, player: Vec, print: Vec, cols: Colliders, radius: number = GARDEN.print.radius): boolean {
  const lim = GARDEN.size / 2 - radius - HIDE.mapMargin, p = sp.spot;
  if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) return false;
  if (insideAny(p, radius + 0.1, cols)) return false;
  if (Math.hypot(sp.perp.x * HIDE.stepOut + p.x, sp.perp.z * HIDE.stepOut + p.z) > lim * 2) return false;
  if (GARDEN.places.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < HIDE.placeClearance)) return false; // not at the pond, bed, egg spot or board
  const t = GARDEN.trees[sp.tree];
  if (Math.hypot(t.x - player.x, t.z - player.z) < HIDE.minTreeDistance) return false;
  return Math.hypot(p.x - print.x, p.z - print.z) <= HIDE.maxDashDistance;
}
// The farthest valid spot (from the player) in a random half of the valid ones, never the same tree twice in a row.
// Returns null when nothing is valid: then there is simply no game.
export function pickSpot(player: Vec, print: Vec, lastTree: number, cols: Colliders, rollHalf: number, rollBehind: number, rollSide: number): Spot | null {
  const ok: Spot[] = [];
  GARDEN.trees.forEach((_, i) => {
    if (i === lastTree) return;
    const sp = spotBehind(i, player, rollBehind);
    if (sp && spotValid(sp, player, print, cols)) ok.push(sp);
  });
  if (!ok.length) return null;
  const far = (s: Spot) => Math.hypot(s.spot.x - player.x, s.spot.z - player.z);
  ok.sort((a, b) => far(b) - far(a));
  const cut = Math.ceil(ok.length / 2), half = rollHalf < 0.5 ? ok.slice(0, cut) : ok.slice(cut).length ? ok.slice(cut) : ok.slice(0, cut);
  const pick = half[0];
  return rollSide < 0.5 ? pick : { ...pick, perp: { x: -pick.perp.x, z: -pick.perp.z } };
}

// Where the Print is, relative to its hiding spot, once it has reached it: the peek leans out sideways,
// found and leaving step out. Returns null when the spot is not in charge of the position.
export function hideAnchor(s: HideState): Vec | null {
  if (!s.spot || !s.perp) return null;
  if (s.phase === "found" || s.phase === "leaving") {
    const e = ease(clamp01(s.t / phaseSeconds(s))) * HIDE.stepOut;
    return { x: s.spot.x + s.perp.x * e, z: s.spot.z + s.perp.z * e };
  }
  return s.phase === "hiding" ? s.spot : null;
}
// 0..1: how far it leans out to the side. A peek every peekEvery seconds, never at the very start.
export function peekAmount(t: number): number {
  const k = Math.floor(t / HIDE.peekEvery);
  if (k < 1) return 0;
  const u = (t - k * HIDE.peekEvery) / HIDE.peekSeconds;
  return u < 0 || u >= 1 ? 0 : Math.sin(u * Math.PI);
}

export function hidePose(s: HideState, reduced = false): HidePose {
  const c = calm(reduced), rest: HidePose = { lean: 0, squash: 1, hop: 0, shake: 0, spin: 0, side: 0 };
  switch (s.phase) {
    case "inviting": { // stop, face the player and bounce
      const u = clamp01(s.t / HIDE.inviteSeconds);
      return { ...rest, lean: -0.12 * ease(clamp01(u * 3)) * c, squash: 1 - 0.06 * Math.sin(u * Math.PI * HIDE.bounces * 2) * c, hop: (reduced ? 0.04 : 0.14) * Math.abs(Math.sin(u * Math.PI * HIDE.bounces)) };
    }
    case "dashing": return { ...rest, lean: 0.1 * c, hop: (reduced ? 0.03 : 0.08) * Math.abs(Math.sin((s.t / HIDE.hopPeriod) * Math.PI)) };
    case "hiding": // a little squashed, swaying; the peek leans out
      return { ...rest, lean: 0.05, squash: 0.9, shake: 0.06 * c * Math.sin(s.t * 1.7), side: peekAmount(s.t) };
    case "found": {
      const u = clamp01(s.t / HIDE.foundSeconds);
      return { ...rest, squash: 1 - 0.12 * Math.sin(clamp01(u * 2) * Math.PI) * c, hop: reduced ? 0 : 0.4 * Math.sin(clamp01(u * 1.4) * Math.PI), spin: reduced ? 0 : Math.PI * 2 * ease(u) };
    }
    case "leaving": { // a shake of the head, then off
      const u = clamp01(s.t / HIDE.leaveSeconds);
      return { ...rest, shake: reduced ? 0 : 0.25 * Math.sin(u * Math.PI * 5) * (1 - u) };
    }
    default: return rest;
  }
}

// Ink puffs. Wisps rise from the hiding Print so it can be found; a puff at each hop of the dash;
// a gold burst when found. Fewer and slower with reduced motion.
export function hidePuffs(s: HideState, reduced = false): HidePuff[] {
  const out: HidePuff[] = [], ink = (p: Puff | null, tone: "ink" | "gold" = "ink") => { if (p) out.push({ ...p, tone }); };
  if (s.phase === "dashing") {
    const k = Math.floor(s.t / HIDE.hopPeriod);
    for (let j = 0; j < 2; j++) ink(puffAt(k - j, s.t - (k - j) * HIDE.hopPeriod, reduced));
  } else if (s.phase === "hiding") {
    const every = HIDE.wispEvery * (reduced ? 2 : 1), life = HIDE.wispLife * (reduced ? 1.4 : 1);
    const k = Math.floor(s.t / every), age = s.t - k * every;
    if (age < life && k >= 0) {
      const u = age / life, a = k * 2.399963;
      out.push({ dx: Math.sin(u * 5 + k) * 0.12 * calm(reduced), dy: 0.9 * u * (reduced ? 0.6 : 1), scale: 0.07 * (0.6 + 0.6 * Math.sin(u * Math.PI)), opacity: Math.sin(u * Math.PI) * 0.8, angle: a, tone: "ink" });
    }
  } else if (s.phase === "found") {
    const n = reduced ? Math.ceil(HIDE.burst / 2) : HIDE.burst;
    for (let i = 0; i < n; i++) ink(puffAt(i, s.t - 0.15 - i * 0.04, reduced), "gold");
  }
  return out;
}
