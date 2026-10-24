import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUTTON_KEY, KEYBOARD_COVERAGE, KEYS, keyDiff, knobOffset, lookDelta, stickKeys, touchButtons } from "@/lib/touchControls";
import { MOBILE, MOBILE_ENABLED } from "@/lib/touchInput";

const R = MOBILE.stickSize / 2;
const at = (deg: number, frac: number) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * R * frac, Math.sin(a) * R * frac] as const; };
const keysAt = (deg: number, frac: number) => [...stickKeys(...at(deg, frac), R)].sort();

describe("the stick", () => {
  it("does nothing inside the dead zone or on bad input", () => {
    expect(keysAt(0, MOBILE.stickDeadZone * 0.9)).toEqual([]);
    expect(stickKeys(0, 0, R).size).toBe(0);
    expect(stickKeys(NaN, 5, R).size).toBe(0);
    expect(stickKeys(5, 5, 0).size).toBe(0);
  });
  it("walks in all eight directions (screen y is down, so up is W)", () => {
    expect(keysAt(-90, 0.5)).toEqual([KEYS.up]);
    expect(keysAt(90, 0.5)).toEqual([KEYS.down]);
    expect(keysAt(180, 0.5)).toEqual([KEYS.left]);
    expect(keysAt(0, 0.5)).toEqual([KEYS.right]);
    expect(keysAt(-45, 0.5)).toEqual([KEYS.right, KEYS.up].sort());
    expect(keysAt(-135, 0.5)).toEqual([KEYS.left, KEYS.up].sort());
    expect(keysAt(45, 0.5)).toEqual([KEYS.right, KEYS.down].sort());
    expect(keysAt(135, 0.5)).toEqual([KEYS.left, KEYS.down].sort());
  });
  it("never holds opposite keys", () => {
    for (let d = 0; d < 360; d += 5) { const k = stickKeys(...at(d, 0.7), R); expect(k.has(KEYS.up) && k.has(KEYS.down)).toBe(false); expect(k.has(KEYS.left) && k.has(KEYS.right)).toBe(false); expect(k.size).toBeGreaterThan(0); }
  });
  it("jogs only past the outer ring", () => {
    expect(stickKeys(...at(0, MOBILE.stickJogRing - 0.05), R).has(KEYS.jog)).toBe(false);
    expect(stickKeys(...at(0, 1), R).has(KEYS.jog)).toBe(true);
    expect(stickKeys(...at(0, 3), R).has(KEYS.jog)).toBe(true); // a thumb dragged far out
  });
  it("letting go (empty set) releases everything that was held", () => {
    const held = stickKeys(...at(-45, 1), R);
    const d = keyDiff(held, new Set());
    expect(d.down).toEqual([]); expect(d.up.sort()).toEqual([...held].sort());
  });
  it("keyDiff sends only changes", () => {
    expect(keyDiff(new Set(["KeyW"]), new Set(["KeyW", "KeyD"]))).toEqual({ down: ["KeyD"], up: [] });
    expect(keyDiff(new Set(["KeyW"]), new Set(["KeyD"]))).toEqual({ down: ["KeyD"], up: ["KeyW"] });
    expect(keyDiff(new Set(), new Set())).toEqual({ down: [], up: [] });
  });
  it("the knob stays on the ring", () => {
    expect(knobOffset(3, 4, 10)).toEqual({ x: 3, y: 4 });
    const k = knobOffset(30, 40, 10); expect(Math.hypot(k.x, k.y)).toBeCloseTo(10);
    expect(knobOffset(NaN, 1, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe("look", () => {
  it("uses client deltas with the mouse's signs", () => {
    expect(lookDelta({ x: 100, y: 100 }, { x: 110, y: 100 }, 0.01)).toEqual({ yaw: -0.1, pitch: 0 });
    const d = lookDelta({ x: 100, y: 100 }, { x: 100, y: 90 }, 0.01); expect(d.yaw).toBeCloseTo(0); expect(d.pitch).toBeCloseTo(-0.1);
    expect(lookDelta({ x: 0, y: 0 }, { x: NaN, y: 0 }, 0.01)).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe("buttons follow the prompts", () => {
  const none = { snack: false, follow: false, skip: false, stroke: false };
  it("Do is always there; the others only with their prompt", () => {
    expect(touchButtons(none)).toEqual(["do"]);
    expect(touchButtons({ ...none, snack: true })).toEqual(["do", "snack"]);
    expect(touchButtons({ ...none, follow: true })).toEqual(["do", "follow"]);
    expect(touchButtons({ ...none, skip: true })).toEqual(["do", "skip"]);
    expect(touchButtons({ ...none, stroke: true })).toEqual(["do", "stroke"]);
    expect(touchButtons({ snack: true, follow: true, skip: true, stroke: true })).toHaveLength(5);
  });
  it("sends the game's own key codes; feed/unfold and stroke are holds", () => {
    expect(BUTTON_KEY.do).toEqual({ key: "KeyE", hold: true });
    expect(BUTTON_KEY.stroke).toEqual({ key: "KeyR", hold: true });
    expect(BUTTON_KEY.snack).toEqual({ key: "KeyQ", hold: false });
    expect(BUTTON_KEY.follow).toEqual({ key: "KeyC", hold: false });
    expect(BUTTON_KEY.skip).toEqual({ key: "KeyF", hold: false });
    expect(BUTTON_KEY.map).toEqual({ key: "KeyM", hold: false });
    expect(BUTTON_KEY.book).toEqual({ key: "KeyB", hold: false });
  });
  it("no keyboard needed: every key the controls or the game use is covered or has a reason", () => {
    for (const k of [...Object.values(KEYS), "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftRight"]) expect(KEYBOARD_COVERAGE[k], k).toBeTruthy();
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("the flag stays off in this PR", () => { expect(MOBILE_ENABLED).toBe(false); });
  it("controls make no network call and touch no storage; only key events go out", () => {
    for (const f of ["lib/touchControls.ts", "components/TouchControls.tsx"]) expect(read(f)).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon/);
    expect(read("components/TouchControls.tsx")).toMatch(/new KeyboardEvent\(type, \{ code, bubbles: true \}\)/);
  });
  it("every cancel path lets go of the keys", () => {
    const s = read("components/TouchControls.tsx");
    for (const t of ["onPointerCancel={stickEnd}", "onLostPointerCapture={stickEnd}", "onPointerCancel={lift}", "onLostPointerCapture={lift}", "visibilitychange", "pagehide", '"blur"']) expect(s).toContain(t);
    expect(s).toMatch(/return \(\) => \{[^}]*releaseAll\(\)/);
  });
  it("controls mount only in touch mode, after sign-in, not under the portrait cover", () => {
    expect(read("components/MobileShell.tsx")).toMatch(/touch && signedIn && !cover && <TouchControls/);
  });
  it("the camera drag uses client deltas for touch and keeps the mouse path", () => {
    const w = read("components/World.tsx");
    expect(w).toMatch(/lookDelta\(lastLook/); expect(w).toMatch(/e\.movementX \* GARDEN\.camera\.turnSpeed/);
  });
});
