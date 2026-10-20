// Pure sit-and-rest rules: walk to the seat, settle down, and stand back up.
// The page of numbers is in data/night.json ("sit"). No three.js or clock access here.
import night from "@/data/night.json";

export const SIT = night.sit;
export type SitPhase = "standing" | "going" | "seated" | "rising";
export type SitState = { phase: SitPhase; t: number; lower0: number };
export const STANDING: SitState = { phase: "standing", t: 0, lower0: 0 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n);
// Reduced motion gets a shorter, calmer move and no sway.
const dur = (s: number, reduced: boolean) => s * (reduced ? SIT.reducedFactor : 1);

// How far along the walk to the seat (0 at the start, 1 at the seat) and how far down (0 upright, 1 seated).
export function sitFrame(s: SitState, reduced = false): { move: number; lower: number; sway: number; tilt: number } {
  let move = 0, lower = 0;
  if (s.phase === "going") {
    const u = clamp01(s.t / dur(SIT.goSeconds, reduced));
    move = ease(u);
    lower = ease(clamp01((u - 0.45) / 0.55)); // walk first, then lower onto the seat
  } else if (s.phase === "seated") {
    move = 1; lower = 1;
  } else if (s.phase === "rising") {
    move = 1;
    lower = s.lower0 * (1 - ease(clamp01(s.t / dur(SIT.riseSeconds, reduced))));
  }
  const held = s.phase === "seated" ? 1 : 0;
  // A gentle idle sway so the held pose reads as alive (none when motion is reduced).
  const sway = reduced ? 0 : held * SIT.sway * Math.sin((s.t / SIT.swaySeconds) * Math.PI * 2);
  return { move, lower, sway, tilt: SIT.tilt * lower * (reduced ? SIT.reducedFactor : 1) };
}

// Time passes. Going ends seated, rising ends standing (and control returns).
export function sitAdvance(s: SitState, dt: number, reduced = false): SitState {
  if (s.phase === "standing") return s;
  const t = s.t + dt;
  if (s.phase === "going" && t >= dur(SIT.goSeconds, reduced)) return { phase: "seated", t: 0, lower0: 1 };
  if (s.phase === "rising" && t >= dur(SIT.riseSeconds, reduced)) return STANDING;
  return { ...s, t };
}

export const isSitting = (s: SitState): boolean => s.phase !== "standing";
// Free to walk only when fully standing; while rising the player finishes getting up first.
export const canWalk = (s: SitState): boolean => s.phase === "standing";

// E at the rest spot: sit down, or get up. It does nothing while the move is already under way
// (so a double tap can't flip the pose back and forth).
export function sitToggle(s: SitState, reduced = false): SitState {
  if (s.phase === "standing") return { phase: "going", t: 0, lower0: 0 };
  if (s.phase === "seated") return { phase: "rising", t: 0, lower0: 1 };
  return s;
}
// A walking key gets you up. Mid-sit it starts rising from however low you had got.
export function sitWalkKey(s: SitState, reduced = false): SitState {
  if (s.phase === "seated") return { phase: "rising", t: 0, lower0: 1 };
  if (s.phase === "going") return { phase: "rising", t: 0, lower0: sitFrame(s, reduced).lower };
  return s;
}
export function lerpPos(from: { x: number; z: number }, to: { x: number; z: number }, k: number): { x: number; z: number } {
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}
