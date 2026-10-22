import { describe, expect, it } from "vitest";
import { GENTLE_AFTER_MS, GENTLE_KEY, GENTLE_TEXT, clearGentle, gentleOverride, readGentle, shouldShow, writeGentle, type GentleState } from "@/lib/gentle";

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
const ok: GentleState = { hasPrint: true, inWorldMs: GENTLE_AFTER_MS, otherOpen: false, saved: false, doneThisSession: false, welcomeShown: false };

describe("time is gentle (S20)", () => {
  it("reads empty, bad JSON, wrong version, blocked storage as not shown", () => {
    expect(readGentle(null)).toBe(false);
    expect(readGentle(mem())).toBe(false);
    const s = mem();
    s.m.set(GENTLE_KEY, "{nope"); expect(readGentle(s)).toBe(false);
    s.m.set(GENTLE_KEY, JSON.stringify({ v: 2, shown: true })); expect(readGentle(s)).toBe(false);
    s.m.set(GENTLE_KEY, JSON.stringify({ v: 1, shown: false })); expect(readGentle(s)).toBe(false);
    expect(readGentle(boom)).toBe(false);
  });
  it("writes {v:1,shown:true}, reads it back, clears it, never throws", () => {
    const s = mem();
    expect(writeGentle(s)).toBe(true);
    expect(s.m.get(GENTLE_KEY)).toBe('{"v":1,"shown":true}');
    expect(readGentle(s)).toBe(true);
    expect(clearGentle(s)).toBe(true);
    expect(s.m.has(GENTLE_KEY)).toBe(false);
    expect(writeGentle(boom)).toBe(false);
    expect(writeGentle(null)).toBe(false);
    expect(clearGentle(boom)).toBe(false);
  });
  it("shows only with a Print, 3+ minutes, nothing else open, key unset, no Welcome back", () => {
    expect(shouldShow(ok)).toBe(true);
    expect(shouldShow({ ...ok, hasPrint: false })).toBe(false);
    expect(shouldShow({ ...ok, inWorldMs: GENTLE_AFTER_MS - 1 })).toBe(false);
    expect(shouldShow({ ...ok, otherOpen: true })).toBe(false);
    expect(shouldShow({ ...ok, saved: true })).toBe(false);
    expect(shouldShow({ ...ok, doneThisSession: true })).toBe(false);
    expect(shouldShow({ ...ok, welcomeShown: true })).toBe(false);
  });
  it("override: on, reset, other values, production is null", () => {
    expect(gentleOverride("?gentle=on", false)).toBe("on");
    expect(gentleOverride("?gentle=reset", false)).toBe("reset");
    expect(gentleOverride("?gentle=yes", false)).toBeNull();
    expect(gentleOverride("", false)).toBeNull();
    expect(gentleOverride("?gentle=on", true)).toBeNull();
    expect(gentleOverride("?gentle=reset", true)).toBeNull();
  });
  it("text has the three strings, no digits, names no other game or limits", () => {
    expect(GENTLE_TEXT).toEqual({ title: "Take your time", body: "Your Print keeps growing while you are away. Nothing is ever lost, and it will be glad to see you.", close: "Close" });
    for (const v of Object.values(GENTLE_TEXT)) expect(v).not.toMatch(/\d/);
    expect(GENTLE_TEXT.body).not.toMatch(/cap|limit|catch/i);
  });
});
