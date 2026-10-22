import { describe, expect, it } from "vitest";
import { HOME_HINT_KEY, HOME_HINT_TEXT, homeHintOverride, markShown, nextHint, readShown, writeShown, type Ctx } from "@/lib/homeHint";

const base: Ctx = { ready: true, guideDone: true, guideHint: false, hasCreature: true, nearDoor: false, nearPlot: false, decorated: false };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("home hint", () => {
  it("shows the door line only at the door, after the guide, with a Print", () => {
    expect(nextHint([], { ...base, nearDoor: true })).toBe("door");
    expect(nextHint([], base)).toBeNull();
    expect(nextHint([], { ...base, nearDoor: true, hasCreature: false })).toBeNull();
    expect(nextHint([], { ...base, nearDoor: true, guideDone: false })).toBeNull();
    expect(nextHint([], { ...base, nearDoor: true, guideHint: true })).toBeNull();
    expect(nextHint([], { ...base, nearDoor: true, ready: false })).toBeNull();
  });
  it("shows each line once, but keeps the one on screen while its place holds", () => {
    expect(nextHint(["door"], { ...base, nearDoor: true })).toBeNull();
    expect(nextHint(["door"], { ...base, nearDoor: true }, "door")).toBe("door");
    expect(nextHint(["inside"], { ...base, nearPlot: true })).toBeNull();
  });
  it("shows the inside line at a plot until a Decorate succeeds", () => {
    expect(nextHint([], { ...base, nearPlot: true })).toBe("inside");
    expect(nextHint([], { ...base, nearPlot: true, decorated: true })).toBeNull();
  });
  it("Escape keeps a line gone", () => {
    expect(nextHint(["door"], { ...base, nearDoor: true }, "door", ["door"])).toBeNull();
  });
  it("saves and reads, and survives blocked or bad storage", () => {
    const s = mem();
    expect(writeShown(s, markShown([], "door"))).toBe(true);
    expect(readShown(s)).toEqual(["door"]);
    s.setItem(HOME_HINT_KEY, "{nope");
    expect(readShown(s)).toEqual([]);
    s.setItem(HOME_HINT_KEY, JSON.stringify({ v: 9, shown: ["door"] }));
    expect(readShown(s)).toEqual([]);
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(readShown(bad)).toEqual([]);
    expect(writeShown(bad, ["door"])).toBe(false);
    expect(writeShown(null, ["door"])).toBe(false);
  });
  it("has the spec wording", () => {
    expect(HOME_HINT_TEXT.door).toBe("Your Home is inside. Come and arrange it.");
    expect(HOME_HINT_TEXT.inside).toBe("Pick a spot to decorate. Nothing is ever lost.");
  });
  it("preview switches are off in production", () => {
    expect(homeHintOverride("?homehint=door", false)).toBe("door");
    expect(homeHintOverride("?homehint=inside", false)).toBe("inside");
    expect(homeHintOverride("?homehint=reset", false)).toBe("reset");
    expect(homeHintOverride("?homehint=door", true)).toBeNull();
    expect(homeHintOverride("?homehint=x", false)).toBeNull();
  });
});
