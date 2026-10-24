// First-run guide: pure logic and wording. No three.js, no React, no server.
// The hint state (which steps are done) lives in local storage only. Blocked or bad storage degrades to this session.
import { PLAY } from "@/lib/play";
import { keyLabel } from "@/lib/ui";
import { isDay } from "@/lib/pond";
import mapData from "@/data/map.json";

export const STEPS = ["move", "egg", "hatch", "feed", "stroke", "map"] as const;
export type Step = (typeof STEPS)[number];

export const GUIDE_KEY = "blotty.guide";
export const GUIDE_VERSION = 1;

// The walking keys the world listens to (WASD; the arrow keys do the same).
export const WALK_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;

// Every word the player sees from the guide. Wording changes here, not in logic.
export const GUIDE_TEXT = {
  move: (walk: string, act: string) => `Walk with ${walk}, and press ${act} to do things.`,
  egg: (act: string) => `Press ${act} to collect your egg.`,
  hatchAway: "Your egg is waiting in the nest.",
  hatchWait: "Your egg is nearly ready.",
  hatch: (act: string) => `Press ${act} to hatch your egg.`,
  feed: (act: string) => `Hold ${act} beside your Print to share a snack.`,
  stroke: (key: string) => `Hold ${key} beside your Print to stroke it.`,
  map: (key: string) => `Press ${key} to open your map and see where else you can go.`,
  arrow: "Your egg is this way",
  nestArrow: "Your nest is this way",
} as const;

// S38a: the same lines for a thumb. No key names; the stick, the big button, the stroke button and the map button instead.
export const GUIDE_TEXT_TOUCH = {
  move: "Use the stick to walk. Tap the big button to do things.",
  egg: "Tap the big button to collect your egg.",
  hatch: "Tap the big button to hatch your egg.",
  feed: "Hold the big button beside your Print to share a snack.",
  stroke: "Hold the stroke button beside your Print to stroke it.",
  map: "Tap the map button to open your map and see where else you can go.",
} as const;

export const guideKeys = () => ({
  walk: WALK_CODES.map(keyLabel).join(" "),
  act: keyLabel(PLAY.keys.hold),
  stroke: keyLabel(PLAY.keys.stroke),
  map: keyLabel(mapData.key),
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
  hasWaiting?: boolean; // an egg is in the nest waiting to hatch
  nearNest?: boolean; // within reach of the nest
  hatchWait?: number; // seconds until it can hatch (0 = ready)
  fedThisSession?: boolean; // the feed step finished in this visit (never true from saved data alone)
  day?: boolean; // the stroke hint is a daytime line; undefined counts as day
  dismissed: readonly Step[]; // skipped with Escape this session (also saved as done)
};

// The one hint to show now, or null. Never more than one.
export function currentHint(done: readonly Step[], c: Ctx): Step | null {
  if (!c.ready || !c.inGarden) return null;
  const open = (s: Step) => !done.includes(s) && !c.dismissed.includes(s);
  if (c.eggPending && c.nearEgg && open("egg")) return "egg";
  if (open("move")) return "move";
  if (c.hasWaiting && !c.hasCreature && !c.eggPending && open("hatch")) return "hatch";
  if (c.hasCreature && c.printNear && c.hasSnack && open("feed")) return "feed";
  if (done.includes("stroke") && open("map")) return "map";
  if (c.fedThisSession && c.hasCreature && c.printNear && c.day !== false && open("stroke")) return "stroke";
  return null;
}

// Should the egg pointer show? Until the egg is reached; it stops near the egg and once collected.
export const pointerOn = (done: readonly Step[], c: Pick<Ctx, "ready" | "inGarden" | "nearEgg" | "eggPending">): boolean =>
  c.ready && c.inGarden && c.eggPending && !c.nearEgg && !done.includes("egg");

// Should the nest pointer show? While an egg waits and the player is away from the nest (the hatch hint is the one due).
export const nestPointerOn = (done: readonly Step[], c: Pick<Ctx, "ready" | "inGarden" | "nearNest" | "hasWaiting" | "hasCreature" | "eggPending" | "dismissed">): boolean =>
  c.ready && c.inGarden && !c.nearNest && !!c.hasWaiting && !c.hasCreature && !c.eggPending && !done.includes("hatch") && !c.dismissed.includes("hatch");

// A successful feed finishes the feed step only if the feed hint was the one on show when it landed.
// A feed done before the hint ever appeared, or after it was skipped, leaves the step alone.
export const feedFinishes = (shown: Step | null, prevTick: number, tick: number): boolean => shown === "feed" && tick > prevTick;

// A stroke that starts while the stroke hint is the one on show finishes it. One before it appeared, or after Escape, does not.
export const strokeFinishes = (shown: Step | null, prevStrokes: number, strokes: number): boolean => shown === "stroke" && strokes > prevStrokes;

// Opening the map finishes the map step at any time, even before its hint shows.
export const mapFinishes = (wasOpen: boolean, isOpen: boolean): boolean => !wasOpen && isOpen;

// The hatch line depends on where the player stands and whether the egg is ready.
export const hatchText = (nearNest: boolean, wait: number, touch = false): string => (!nearNest ? GUIDE_TEXT.hatchAway : wait > 0 ? GUIDE_TEXT.hatchWait : touch ? GUIDE_TEXT_TOUCH.hatch : GUIDE_TEXT.hatch(guideKeys().act));

export const hintText = (s: Step, nearNest = true, wait = 0, touch = false): string => {
  if (touch) return s === "hatch" ? hatchText(nearNest, wait, true) : GUIDE_TEXT_TOUCH[s];
  const k = guideKeys();
  if (s === "hatch") return hatchText(nearNest, wait);
  return s === "move" ? GUIDE_TEXT.move(k.walk, k.act) : s === "egg" ? GUIDE_TEXT.egg(k.act) : s === "feed" ? GUIDE_TEXT.feed(k.act) : s === "stroke" ? GUIDE_TEXT.stroke(k.stroke) : GUIDE_TEXT.map(k.map);
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

// ?guide=hatch, ?guide=feed, ?guide=stroke and ?guide=map (dev only, ignored in production builds): show a hint without real data.
// Move and egg count as done, a Print is near and a snack is in hand. "stroke" also starts with the feed done and fed this
// session; "map" starts with stroke done too, and opening the map finishes it; in "feed", a press of the hold key stands in for a feed and then the stroke hint follows. "hatch" starts with an egg waiting, a short fake wait and no Print; the hold key stands in for the hatch when at the nest. Nothing is read, saved or sent.
export const PREVIEW_DONE: readonly Step[] = ["move", "egg"];
export const PREVIEW_DONE_STROKE: readonly Step[] = ["move", "egg", "feed"];
export const PREVIEW_DONE_MAP: readonly Step[] = ["move", "egg", "feed", "stroke"];
export const PREVIEW_DONE_HATCH: readonly Step[] = ["move", "egg"];
export type GuidePreview = "hatch" | "feed" | "stroke" | "map";
export const guideOverride = (search: string, isProduction: boolean): GuidePreview | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("guide");
  return v === "hatch" || v === "feed" || v === "stroke" || v === "map" ? v : null;
};
// Daytime for the stroke hint.
export const guideDay = (hour: number): boolean => isDay(hour);
