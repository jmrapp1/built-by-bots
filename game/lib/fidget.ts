// Idle fidgets (S22): a standing Print now and then does a tiny life sign. Pure logic only: no three.js,
// clock or storage here, so it is all unit-tested. Tuning is in data/fidget.json. No text, no sound, no saves.
import fidget from "@/data/fidget.json";

export const FIDGET = fidget;
export type Kind = "blink" | "glance" | "shake" | "settle";

export type FidgetState = {
  wait: number; // seconds until the next fidget is due (keeps counting while busy; it fires at the next standing moment)
  kind: Kind | null; // the one playing
  t: number; // seconds into it
  last: Kind | null; // the previous one, so a kind never repeats
  w: number; // 0..1 strength: eases in, and eases out within cancelSeconds when something interrupts
  side: 1 | -1; // which way a glance looks
};

export type Ctx = {
  day: boolean; // awake, and not heading to bed, curled up or yawning
  standing: boolean; // the Print is pausing, not walking
  engaged: boolean; // being fed, stroked or reacting
  busy: boolean; // pond or hide play, coming along, page skipping, travelling between zones, or the player sitting
  panel: boolean; // a card, the map or the picker is open
  moving: boolean; // the player is walking away
};
export const canFidget = (c: Ctx): boolean => c.day && c.standing && !c.engaged && !c.busy && !c.panel && !c.moving;

export type Pick = "on" | "fast" | null;
// Dev-only: "?fidget=on" first fidget after about a second, "?fidget=fast" a fidget every 1.5 s. Ignored in production.
export const fidgetOverride = (search: string, isProduction: boolean): Pick => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("fidget");
  return v === "on" || v === "fast" ? v : null;
};

// A small seeded generator (mulberry32), so two Prints with different looks do not move in sync.
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const nextGap = (roll: number, pick: Pick = null): number => (pick === "fast" ? FIDGET.fastGap : FIDGET.gap[0] + clamp01(roll) * (FIDGET.gap[1] - FIDGET.gap[0]));
// Never the same kind twice in a row. With reduced motion only the blink is allowed (so it can repeat).
export function nextKind(last: Kind | null, roll: number, reduced = false): Kind {
  if (reduced) return "blink";
  const pool = (FIDGET.kinds as Kind[]).filter((k) => k !== last);
  return pool[Math.min(pool.length - 1, Math.floor(clamp01(roll) * pool.length))];
}

export const startState = (rng: () => number, pick: Pick = null): FidgetState => ({ wait: pick === "on" ? 1 : nextGap(rng(), pick), kind: null, t: 0, last: null, w: 0, side: 1 });

export function stepFidget(s: FidgetState, dt: number, can: boolean, rng: () => number, reduced = false, pick: Pick = null): FidgetState {
  if (s.kind) {
    // An interruption fades it out; it never snaps. Otherwise it plays to its end.
    if (!can) {
      const w = s.w - dt / FIDGET.cancelSeconds;
      return w <= 0 ? { ...s, kind: null, t: 0, w: 0, wait: nextGap(rng(), pick) } : { ...s, t: s.t + dt, w };
    }
    const t = s.t + dt;
    return t >= FIDGET.seconds[s.kind] ? { ...s, kind: null, t: 0, w: 0, last: s.kind, wait: nextGap(rng(), pick) } : { ...s, t, w: Math.min(1, s.w + dt / FIDGET.cancelSeconds) };
  }
  const wait = s.wait - dt;
  if (wait > 0 || !can) return { ...s, wait: Math.max(0, wait) };
  return { ...s, kind: nextKind(s.last, rng(), reduced), t: 0, w: 0, wait: 0, side: rng() < 0.5 ? -1 : 1 };
}

export type Offsets = { blink: number; yaw: number; roll: number; squash: number }; // blink 0 open..1 shut; squash is a multiplier
export const NONE: Offsets = { blink: 0, yaw: 0, roll: 0, squash: 1 };
const bell = (u: number) => Math.sin(Math.PI * clamp01(u));
export function fidgetOffsets(s: FidgetState, reduced = false): Offsets {
  if (!s.kind || s.w <= 0) return NONE;
  const u = s.t / FIDGET.seconds[s.kind], k = s.w;
  switch (s.kind) {
    case "blink": return { ...NONE, blink: FIDGET.blink.close * bell(u) * k };
    case "glance": return reduced ? NONE : { ...NONE, yaw: FIDGET.glance.angle * bell(u) * k * s.side };
    case "shake": return reduced ? NONE : { ...NONE, roll: FIDGET.shake.roll * Math.sin(2 * Math.PI * FIDGET.shake.wobbles * u) * (1 - u) * k };
    case "settle": return reduced ? NONE : { ...NONE, squash: 1 - FIDGET.settle.squash * bell(u) * k };
  }
}
