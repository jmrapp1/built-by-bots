import { describe, expect, it } from "vitest";
import { HINT_KEYS, HINTS_AGAIN, HINTS_BACK, resetHints } from "@/lib/hintsReset";
import { GUIDE_KEY, readDone, writeDone } from "@/lib/guide";
import { TRY_KEY, readTry, writeTry } from "@/lib/tryList";
import { HOME_HINT_KEY, readShown, writeShown } from "@/lib/homeHint";

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("resetHints (S16)", () => {
  it("removes exactly the three hint keys and leaves others", () => {
    const s = mem();
    s.setItem(GUIDE_KEY, "x"); s.setItem(TRY_KEY, "x"); s.setItem(HOME_HINT_KEY, "x"); s.setItem("other", "keep");
    expect(resetHints(s)).toBe(true);
    expect([...s.m.keys()]).toEqual(["other"]);
    expect([...HINT_KEYS].sort()).toEqual(["blotty.gentle", "blotty.guide", "blotty.homeHint", "blotty.tryList"]);
  });
  it("returns false for null or throwing storage without throwing", () => {
    expect(resetHints(null)).toBe(false);
    expect(resetHints({ removeItem() { throw new Error("blocked"); } })).toBe(false);
  });
  it("readers return their empty states afterwards", () => {
    const s = mem();
    writeDone(s, ["move", "egg"]); writeTry(s, { done: ["forage"], retired: true }); writeShown(s, ["door"]);
    resetHints(s);
    expect(readDone(s)).toEqual([]);
    expect(readTry(s)).toEqual({ done: [], retired: false });
    expect(readShown(s)).toEqual([]);
  });
  it("has the two strings", () => {
    expect(HINTS_AGAIN).toBe("Show the hints again");
    expect(HINTS_BACK).toBe("Hints will be back next time you open the game.");
  });
});
