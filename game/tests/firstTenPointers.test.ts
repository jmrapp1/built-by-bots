import { describe, expect, it } from "vitest";
import { flagOn, pointersOn, signinNoteOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";
import garden from "@/data/garden.json";
import { GUIDE_KEY, GUIDE_VERSION, POINT_TEXT, duePointer, pointTargetFar, pointsAfterCrossing, readDone, signinNoteText, writeDone, STEPS } from "@/lib/guide";

const ctx = { guideDone: true, hint: false, ready: true, inGarden: true };

describe("S42 switches", () => {
  it("ship off; anything but a plain true is off", () => {
    const f = (firstTen as { firstTen: Record<string, unknown> }).firstTen;
    expect(f.pointers).toBe(false);
    expect(f.signinNote).toBe(false);
    for (const v of ["true", 1, null, undefined, {}]) {
      expect(flagOn({ firstTen: { pointers: v } }, "pointers")).toBe(false);
      expect(flagOn({ firstTen: { signinNote: v } }, "signinNote")).toBe(false);
    }
    expect(flagOn({ firstTen: { pointers: true } }, "pointers")).toBe(true);
  });
  it("?pointers= and ?signinnote= override in dev only", () => {
    expect(pointersOn("?pointers=1", false, { firstTen: { pointers: false } })).toBe(true);
    expect(pointersOn("?pointers=0", false, { firstTen: { pointers: true } })).toBe(false);
    expect(pointersOn("?pointers=1", true, { firstTen: { pointers: false } })).toBe(false);
    expect(signinNoteOn("?signinnote=1", false, { firstTen: { signinNote: false } })).toBe(true);
    expect(signinNoteOn("?signinnote=1", true, { firstTen: { signinNote: false } })).toBe(false);
  });
  it("the gate exists in the garden", () => { expect((garden as { places: { kind: string }[] }).places.some((x) => x.kind === "gate")).toBe(true); });
});

describe("S42 pointer order", () => {
  it("nothing before the guide ends, during a guide hint, or away from the garden", () => {
    expect(duePointer([], { ...ctx, guideDone: false })).toBeNull();
    expect(duePointer([], { ...ctx, hint: true })).toBeNull();
    expect(duePointer([], { ...ctx, ready: false })).toBeNull();
    expect(duePointer([], { ...ctx, inGarden: false })).toBeNull();
  });
  it("gate first, then the Home door, then nothing", () => {
    expect(duePointer([], ctx)).toBe("gate");
    expect(duePointer(["gate"], ctx)).toBe("home");
    expect(duePointer(["gate", "home"], ctx)).toBeNull();
  });
  it("Escape (skipped) moves on", () => {
    expect(duePointer([], { ...ctx, dismissed: ["gate"] })).toBe("home");
    expect(duePointer([], { ...ctx, dismissed: ["gate", "home"] })).toBeNull();
  });
  it("crossings finish their own pointer", () => {
    expect(pointsAfterCrossing("margins")).toEqual(["gate"]);
    expect(pointsAfterCrossing("home")).toEqual(["home"]);
    expect(pointsAfterCrossing("garden")).toEqual([]);
  });
  it("arrow only while away", () => {
    expect(pointTargetFar({ x: 0, z: 0 }, { x: 17.5, z: -17.5 })).toBe(true);
    expect(pointTargetFar({ x: 17, z: -17 }, { x: 17.5, z: -17.5 })).toBe(false);
    expect(pointTargetFar(null, { x: 0, z: 0 })).toBe(false);
  });
  it("no key words in the lines", () => {
    for (const t of [POINT_TEXT.gate, POINT_TEXT.home, signinNoteText]) expect(t).not.toMatch(/\b(press|key)\b/i);
  });
});

describe("S42 storage", () => {
  const mem = () => { const m: Record<string, string> = {}; return { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } }; };
  it("same key; a finished guide without marks reads exactly as before", () => {
    const s = mem();
    writeDone(s, [...STEPS]);
    expect(JSON.parse(s.getItem(GUIDE_KEY)!)).toEqual({ v: GUIDE_VERSION, done: [...STEPS] });
    expect(readDone(s)).toEqual([...STEPS]);
  });
  it("gate/home marks persist in the same list", () => {
    const s = mem();
    writeDone(s, [...STEPS, "gate"] as never);
    expect(readDone(s)).toContain("gate" as never);
  });
});
