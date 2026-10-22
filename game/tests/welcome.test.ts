import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOUR_MS, WELCOME_KEY, WELCOME_TEXT, forgetShown, readSeen, toneFor, welcomeFor, welcomeOverride, writeSeen } from "@/lib/welcome";
import { resetBrowserHints } from "@/lib/hintsReset";

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const now = 1_000_000_000_000;
const pet = { id: "a", stage: "blot", hungry: false };

describe("welcome back (S17)", () => {
  it("tones by time away, none under 2 h", () => {
    expect(toneFor(1.9 * HOUR_MS)).toBeNull();
    expect(toneFor(2 * HOUR_MS)).toBe("short");
    expect(toneFor(23.9 * HOUR_MS)).toBe("short");
    expect(toneFor(24 * HOUR_MS)).toBe("days");
    expect(toneFor(72 * HOUR_MS)).toBe("days");
    expect(toneFor(73 * HOUR_MS)).toBe("long");
    expect(toneFor(NaN)).toBeNull();
  });
  it("words", () => {
    expect(welcomeFor({ t: now - 3 * HOUR_MS }, now, pet)?.lines).toEqual(["Your Print missed you."]);
    expect(welcomeFor({ t: now - 48 * HOUR_MS }, now, pet)?.lines[0]).toBe("Your Print waited by the gate.");
    expect(welcomeFor({ t: now - 120 * HOUR_MS }, now, pet)?.lines[0]).toBe("Your Print kept your page warm.");
  });
  it("second line only if true: grew, else hungry, else none", () => {
    const prev = { t: now - 5 * HOUR_MS, creatureId: "a", stage: "blot" };
    expect(welcomeFor(prev, now, { ...pet, stage: "sprout" })?.lines[1]).toBe(WELCOME_TEXT.grew("Your Print"));
    expect(welcomeFor(prev, now, { ...pet, hungry: true })?.lines[1]).toBe(WELCOME_TEXT.hungry("Your Print"));
    expect(welcomeFor({ ...prev, creatureId: "other" }, now, { ...pet, stage: "sprout" })?.lines).toHaveLength(1);
    expect(welcomeFor(prev, now, pet)?.lines).toHaveLength(1);
  });
  it("no card without history, a Print, or after a recent card", () => {
    expect(welcomeFor(null, now, pet)).toBeNull();
    expect(welcomeFor({ t: now - 5 * HOUR_MS }, now, null)).toBeNull();
    expect(welcomeFor({ t: now - 5 * HOUR_MS, shownAt: now - 5 * HOUR_MS }, now, pet)).toBeNull();
    expect(welcomeFor({ t: now - 8 * HOUR_MS, shownAt: now - 7 * HOUR_MS }, now, pet)).not.toBeNull();
    expect(welcomeFor({ t: now + HOUR_MS }, now, pet)).toBeNull();
  });
  it("storage: round trip, bad data, blocked", () => {
    const s = mem();
    expect(writeSeen(s, { t: 5, creatureId: "a", stage: "blot", shownAt: 9 })).toBe(true);
    expect(readSeen(s)).toEqual({ t: 5, creatureId: "a", stage: "blot", shownAt: 9 });
    s.setItem(WELCOME_KEY, "{nope"); expect(readSeen(s)).toBeNull();
    s.setItem(WELCOME_KEY, JSON.stringify({ v: 2, t: 1 })); expect(readSeen(s)).toBeNull();
    expect(readSeen(null)).toBeNull();
    expect(writeSeen(null, { t: 1 })).toBe(false);
    expect(writeSeen({ getItem: () => null, setItem() { throw new Error("x"); } }, { t: 1 })).toBe(false);
    expect(readSeen({ getItem() { throw new Error("x"); }, setItem() {} })).toBeNull();
  });
  it("hints reset forgets only shownAt", () => {
    const s = mem();
    writeSeen(s, { t: 5, creatureId: "a", stage: "blot", shownAt: 9 });
    expect(forgetShown(s)).toBe(true);
    expect(readSeen(s)).toEqual({ t: 5, creatureId: "a", stage: "blot" });
    expect(forgetShown(null)).toBe(false);
    expect(typeof resetBrowserHints).toBe("function");
  });
  it("preview switch is ignored in production", () => {
    expect(welcomeOverride("?welcome=2d", false)).toBe("2d");
    expect(welcomeOverride("?welcome=2d", true)).toBeNull();
    expect(welcomeOverride("?welcome=zz", false)).toBeNull();
  });
  it("lib/welcome is pure: no network, server or three", () => {
    const code = readFileSync(new URL("../lib/welcome.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/supabase|fetch\(|\.rpc\(|three|Date\.now/);
  });
});
