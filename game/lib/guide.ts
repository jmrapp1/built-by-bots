// First-run guide: pure logic and wording. No three.js, no React, no server.
// The hint state (which steps are done) lives in local storage only. Blocked or bad storage degrades to this session.
import { PLAY } from "@/lib/play";
import { keyLabel } from "@/lib/ui";

export const STEPS = ["move", "egg", "feed"] as const;
export type Step = (typeof STEPS)[number];

export const GUIDE_KEY = "blotty.guide";
export const GUIDE_VERSION = 1;

// The walking keys the world listens to (WASD; the arrow keys do the same).
export const WALK_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;

// Every word the player sees from the guide. Wording changes here, not in logic.
export const GUIDE_TEXT = {
  move: (walk: string, act: string) => `Walk with ${walk}, and press ${act} to do things.`,
  egg: (act: string) => `Press ${act} to collect your egg.`,
  feed: (act: string) => `Hold ${act} beside your Print to share a snack.`,
  arrow: "Your egg is this way",
} as const;

export const guideKeys = () => ({
  walk: WALK_CODES.map(keyLabel).join(" "),
  act: keyLabel(PLAY.keys.hold),
});

export type Store = Pick<Storage, "getItem" | "setItem">;

// Storage can be missing, blocked or throw; every path here returns quietly.
export function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage ?? null;
  } catch {
    return null;
  }
}

// Reads the done steps. Anything unreadable, unknown or from another version is an empty list.
export function readDone(store: Store | null): Step[] {
  try {
    const raw = store?.getItem(GUIDE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as { v?: unknown; done?: unknown };
    if (!v || v.v !== GUIDE_VERSION || !Array.isArray(v.done)) return [];
    return STEPS.filter((s) => (v.done as unknown[]).includes(s));
  } catch {
    return [];
  }
}

// Returns whether it stuck. A false means "this session only", which is fine.
export function writeDone(store: Store | null, done: readonly Step[]): boolean {
  try {
    if (!store) return false;
    store.setItem(GUIDE_KEY, JSON.stringify({ v: GUIDE_VERSION, done: STEPS.filter((s) => done.includes(s)) }));
    return true;
  } catch {
    return false;
  }
}

export const markDone = (done: readonly Step[], step: Step): Step[] => (done.includes(step) ? [...done] : [...done, step]);

// Someone with saved progress (a Print, or an egg that already hatched) sees nothing at all.
export const isExistingPlayer = (creatureCount: number, hatchedEggCount: number): boolean => creatureCount > 0 || hatchedEggCount > 0;
// Having collected the egg means walking and finding it are behind them.
export const afterEggClaimed = (done: readonly Step[]): Step[] => markDone(markDone(done, "move"), "egg");

export type Ctx = {
  ready: boolean; // signed in, progress read, world visible and not covered by a panel
  inGarden: boolean;
  nearEgg: boolean; // within reach of the egg spot
  eggPending: boolean; // the starter egg is not collected yet
  printNear: boolean;
  hasSnack: boolean;
  hasCreature: boolean;
  dismissed: readonly Step[]; // skipped with Escape this session (also saved as done)
};

// The one hint to show now, or null. Never more than one.
export function currentHint(done: readonly Step[], c: Ctx): Step | null {
  if (!c.ready || !c.inGarden) return null;
  const open = (s: Step) => !done.includes(s) && !c.dismissed.includes(s);
  if (c.eggPending && c.nearEgg && open("egg")) return "egg";
  if (open("move")) return "move";
  if (c.hasCreature && c.printNear && c.hasSnack && open("feed")) return "feed";
  return null;
}

// Should the egg pointer show? Until the egg is reached; it stops near the egg and once collected.
export const pointerOn = (done: readonly Step[], c: Pick<Ctx, "ready" | "inGarden" | "nearEgg" | "eggPending">): boolean =>
  c.ready && c.inGarden && c.eggPending && !c.nearEgg && !done.includes("egg");

// A successful feed finishes the feed step only if the feed hint was the one on show when it landed.
// A feed done before the hint ever appeared, or after it was skipped, leaves the step alone.
export const feedFinishes = (shown: Step | null, prevTick: number, tick: number): boolean => shown === "feed" && tick > prevTick;

export const hintText = (s: Step): string => {
  const k = guideKeys();
  return s === "move" ? GUIDE_TEXT.move(k.walk, k.act) : s === "egg" ? GUIDE_TEXT.egg(k.act) : GUIDE_TEXT.feed(k.act);
};

// Where the egg is relative to the way the camera looks. Returns an angle in radians (0 = straight ahead,
// positive = to the right) and whether it is roughly in view.
export function eggBearing(pose: { x: number; z: number; yaw: number }, egg: { x: number; z: number }, halfView = 0.6): { angle: number; inView: boolean } {
  const dx = egg.x - pose.x, dz = egg.z - pose.z;
  const fx = -Math.sin(pose.yaw), fz = -Math.cos(pose.yaw); // the camera sits behind the player and looks this way
  const ahead = dx * fx + dz * fz, side = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
  const angle = Math.atan2(side, ahead);
  return { angle, inView: Math.abs(angle) < halfView };
}

// Has the player walked? (A small step from where they started.)
export const hasMoved = (from: { x: number; z: number } | null, to: { x: number; z: number }, min = 0.3): boolean =>
  !!from && Math.hypot(to.x - from.x, to.z - from.z) >= min;

// ?guide=feed (dev only, ignored in production builds): shows the feed hint without real data.
// Move and egg count as done, a Print is near and a snack is in hand. Nothing is read, saved or sent.
export const PREVIEW_DONE: readonly Step[] = ["move", "egg"];
export const guideOverride = (search: string, isProduction: boolean): "feed" | null =>
  !isProduction && new URLSearchParams(search).get("guide") === "feed" ? "feed" : null;
