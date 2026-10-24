// S37 step 2: the pure half of the touch controls. A thumb stick, a camera drag and a few buttons turn into the SAME key codes the keyboard
// sends, so there is one game-logic path. No three.js, DOM, storage or network here. Numbers live in data/mobile.json.
import { MOBILE } from "@/lib/touchInput";
import { PLAY } from "@/lib/play";
import { FOLLOW } from "@/lib/follow";
import { SKIP } from "@/lib/skip";
import { BOOK } from "@/lib/printBook";
import mapData from "@/data/map.json";

export const KEYS = {
  up: "KeyW", left: "KeyA", down: "KeyS", right: "KeyD", jog: "ShiftLeft",
  hold: PLAY.keys.hold, swap: PLAY.keys.swap, stroke: PLAY.keys.stroke, follow: FOLLOW.key, skip: SKIP.key, book: BOOK.key, map: mapData.key,
} as const;

/** Stick position (dx, dy in px from the centre, y down) to the set of keys held. Inside the dead zone nothing; past the outer ring Shift too. */
export function stickKeys(dx: number, dy: number, radius: number, dead = MOBILE.stickDeadZone, jogRing = MOBILE.stickJogRing): Set<string> {
  const out = new Set<string>();
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return out;
  const len = Math.hypot(dx, dy) / radius;
  if (len < dead) return out;
  const a = Math.atan2(dy, dx); // 0 = right, +pi/2 = down
  const c = Math.cos(a), s = Math.sin(a), t = 0.38; // a direction counts when its share is over about 22 degrees from the other axis
  if (s < -t) out.add(KEYS.up);
  if (s > t) out.add(KEYS.down);
  if (c < -t) out.add(KEYS.left);
  if (c > t) out.add(KEYS.right);
  if (len >= jogRing) out.add(KEYS.jog);
  return out;
}

/** The key presses and releases needed to go from the held set to the wanted set. */
export function keyDiff(prev: ReadonlySet<string>, next: ReadonlySet<string>): { down: string[]; up: string[] } {
  return { down: [...next].filter((k) => !prev.has(k)), up: [...prev].filter((k) => !next.has(k)) };
}

/** Clamp the stick knob to the ring, for drawing. */
export function knobOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  return len <= radius ? { x: dx, y: dy } : { x: (dx / len) * radius, y: (dy / len) * radius };
}

/** A drag on the picture, in client pixels, to the change in yaw and pitch (touch has no movementX). Same sign rule as the mouse. */
export function lookDelta(prev: { x: number; y: number }, now: { x: number; y: number }, turnSpeed: number): { yaw: number; pitch: number } {
  const dx = now.x - prev.x, dy = now.y - prev.y;
  if (![dx, dy, turnSpeed].every(Number.isFinite)) return { yaw: 0, pitch: 0 };
  return { yaw: -dx * turnSpeed, pitch: dy * turnSpeed };
}

/** Which prompt-driven buttons show. Each shows exactly when the matching on-screen prompt does (the booleans page.tsx already uses). */
export type Prompts = { snack: boolean; follow: boolean; skip: boolean; stroke: boolean };
export type ButtonId = "do" | "stroke" | "snack" | "follow" | "skip";
export function touchButtons(p: Prompts): ButtonId[] {
  const out: ButtonId[] = ["do"];
  if (p.stroke) out.push("stroke");
  if (p.snack) out.push("snack");
  if (p.follow) out.push("follow");
  if (p.skip) out.push("skip");
  return out;
}
/** Key each button sends; holds are the ones the game reads each frame. */
export const BUTTON_KEY: Record<ButtonId | "map" | "book", { key: string; hold: boolean }> = {
  do: { key: KEYS.hold, hold: true }, stroke: { key: KEYS.stroke, hold: true },
  snack: { key: KEYS.swap, hold: false }, follow: { key: KEYS.follow, hold: false }, skip: { key: KEYS.skip, hold: false },
  map: { key: KEYS.map, hold: false }, book: { key: KEYS.book, hold: false },
};

/** "No keyboard needed": every key the game uses has a touch control, or a stated reason (Close buttons arrive in step 3). */
export const KEYBOARD_COVERAGE: Record<string, string> = {
  KeyW: "stick", KeyA: "stick", KeyS: "stick", KeyD: "stick", ArrowUp: "stick", ArrowDown: "stick", ArrowLeft: "stick", ArrowRight: "stick",
  ShiftLeft: "stick outer ring", ShiftRight: "stick outer ring",
  KeyE: "Do button", KeyQ: "Snack button", KeyR: "Stroke button", KeyC: "Come along button", KeyF: "Skip button", KeyM: "Map button", KeyB: "Book button",
  Escape: "reason: Close buttons on panels (step 3); Menu button already toggles its panel",
};
