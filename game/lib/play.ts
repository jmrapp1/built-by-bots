// Pure helpers for the hold-to-feed gesture and the Print's reactions.
// Tuning lives in data/play.json. Nothing here touches three.js, the clock or the server.
import play from "@/data/play.json";

export const PLAY = play;

export type Pose = { lean: number; squash: number; hop: number };
export type Puff = { dx: number; dy: number; scale: number; opacity: number; angle: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => n * n * (3 - 2 * n); // smoothstep

// How far through the hold we are, 0..1.
export function holdProgress(heldSeconds: number, holdSeconds: number = PLAY.holdSeconds): number {
  return clamp01(heldSeconds / holdSeconds);
}
export const holdDone = (heldSeconds: number, holdSeconds: number = PLAY.holdSeconds): boolean => heldSeconds >= holdSeconds;

// Q swaps the food in hand, cycling through the foods that exist.
export function nextFood(current: string, foodIds: string[]): string {
  if (foodIds.length === 0) return current;
  const i = foodIds.indexOf(current);
  return foodIds[(i + 1) % foodIds.length];
}

const calm = (reduced: boolean) => (reduced ? PLAY.calmFactor : 1);

// The Print's body language after a successful feed: lean in, chew, one small hop, settle.
// t is seconds since the feed landed. After reactionSeconds it is back to rest.
export function feedPose(t: number, reduced = false): Pose {
  const f = PLAY.feed;
  if (t < 0 || t >= PLAY.reactionSeconds) return { lean: 0, squash: 1, hop: 0 };
  const c = calm(reduced);
  const settle = clamp01((PLAY.reactionSeconds - t) / 0.5); // ease back to rest at the end
  const lean = f.leanRadians * c * ease(clamp01(t / f.leanIn)) * settle;
  let squash = 1;
  if (t >= f.chewStart && t <= f.chewEnd) {
    const u = (t - f.chewStart) / (f.chewEnd - f.chewStart);
    squash = 1 - f.chewDepth * c * Math.sin(u * Math.PI * 2 * f.chewCycles) ** 2;
  }
  let hop = 0;
  if (!reduced && t >= f.hopAt && t <= f.hopAt + f.hopLength) {
    hop = f.hopHeight * Math.sin(((t - f.hopAt) / f.hopLength) * Math.PI);
  }
  return { lean, squash, hop };
}

// Stroking: a soft looping squish and a small hop each beat. held=false eases out.
export function strokePose(t: number, reduced = false, releasedFor = 0): Pose {
  const s = PLAY.stroke;
  const c = calm(reduced);
  const fade = 1 - ease(clamp01(releasedFor / s.easeOut));
  if (t < 0 || fade <= 0) return { lean: 0, squash: 1, hop: 0 };
  const phase = (t % s.period) / s.period;
  const squash = 1 - s.squashDepth * c * Math.sin(phase * Math.PI) ** 2 * fade;
  const hop = !reduced && phase < 0.35 ? s.hopHeight * Math.sin((phase / 0.35) * Math.PI) * fade : 0;
  return { lean: 0.08 * c * fade, squash, hop };
}

// One ink drop. age is seconds since it launched. Returns null when it is not visible.
export function puffAt(slot: number, age: number, reduced = false): Puff | null {
  const d = PLAY.drop;
  if (age < 0 || age >= d.life) return null;
  const u = age / d.life;
  const angle = slot * 2.399963; // golden angle, so drops fan out evenly
  const c = calm(reduced);
  return {
    dx: Math.cos(angle) * d.spread * u * c,
    dy: d.height * Math.sin(u * Math.PI * 0.8) * c,
    scale: d.size * (1 - u * 0.6),
    opacity: 1 - u,
    angle,
  };
}

// Every drop visible during a feed reaction.
export function feedPuffs(t: number, reduced = false): Puff[] {
  const out: Puff[] = [];
  const launches = reduced ? PLAY.feed.dropLaunches.slice(0, 2) : PLAY.feed.dropLaunches;
  launches.forEach((l, i) => { const p = puffAt(i, t - l, reduced); if (p) out.push(p); });
  return out;
}

// Every drop visible while stroking, looping in slots.
export function strokePuffs(t: number, reduced = false): Puff[] {
  const s = PLAY.stroke;
  const cycle = s.dropEvery * s.dropSlots;
  const out: Puff[] = [];
  if (t < 0) return out;
  for (let i = 0; i < s.dropSlots; i++) {
    const age = (((t - i * s.dropEvery) % cycle) + cycle) % cycle;
    if (t - i * s.dropEvery < 0) continue;
    const p = puffAt(i, age, reduced);
    if (p) out.push(p);
  }
  return out;
}
