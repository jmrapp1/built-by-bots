import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "@/data/fidget.json";
import { FIDGET, NONE, canFidget, fidgetOffsets, fidgetOverride, nextGap, nextKind, seedFrom, seeded, startState, stepFidget, type Ctx, type FidgetState, type Kind } from "@/lib/fidget";

const ok: Ctx = { day: true, standing: true, engaged: false, busy: false, panel: false, moving: false };
const run = (s: FidgetState, secs: number, can: (t: number) => boolean, rng: () => number, reduced = false, pick: "on" | "fast" | null = null, kinds: Kind[] = []) => {
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) {
    const before = s.kind;
    s = stepFidget(s, dt, can(t), rng, reduced, pick);
    if (!before && s.kind) kinds.push(s.kind);
  }
  return s;
};

describe("numbers come from the data file", () => {
  it("are the data file's", () => {
    expect(FIDGET).toBe(data);
    expect(nextGap(0)).toBe(data.gap[0]);
    expect(nextGap(1)).toBe(data.gap[1]);
    expect(nextGap(0.5, "fast")).toBe(data.fastGap);
  });
  it("matches the spec: 6-14 s gap, 0.6-1.2 s fidgets, 0.2 s cancel, four kinds", () => {
    expect(data.gap).toEqual([6, 14]);
    expect(data.cancelSeconds).toBeLessThanOrEqual(0.2);
    expect(data.kinds.length).toBe(4);
    for (const k of data.kinds) { const d = (data.seconds as Record<string, number>)[k]; expect(d).toBeGreaterThanOrEqual(0.6); expect(d).toBeLessThanOrEqual(1.2); }
  });
});

describe("gap and kind picker", () => {
  it("gap stays in range", () => { for (let i = 0; i <= 20; i++) { const g = nextGap(i / 20); expect(g).toBeGreaterThanOrEqual(6); expect(g).toBeLessThanOrEqual(14); } });
  it("never repeats a kind", () => {
    const r = seeded(7); let last: Kind | null = null;
    for (let i = 0; i < 500; i++) { const k = nextKind(last, r()); expect(k).not.toBe(last); last = k; }
  });
  it("uses all four kinds over time", () => {
    const r = seeded(3), seen = new Set<Kind>(); let last: Kind | null = null;
    for (let i = 0; i < 100; i++) { last = nextKind(last, r()); seen.add(last); }
    expect(seen.size).toBe(4);
  });
  it("reduced motion only blinks", () => { for (const k of ["blink", "glance", "shake", "settle"] as Kind[]) expect(nextKind(k, 0.9, true)).toBe("blink"); });
  it("is seeded: same seed same run, different Prints differ", () => {
    const a = seeded(seedFrom("print-a")), a2 = seeded(seedFrom("print-a")), b = seeded(seedFrom("print-b"));
    const xs = [a(), a(), a()], ys = [a2(), a2(), a2()], zs = [b(), b(), b()];
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(zs);
    expect(startState(seeded(seedFrom("print-a"))).wait).not.toBe(startState(seeded(seedFrom("print-b"))).wait);
  });
});

describe("busy gate", () => {
  it("allows a standing Print by day", () => expect(canFidget(ok)).toBe(true));
  it("blocks every busy state", () => {
    for (const o of [{ day: false }, { standing: false }, { engaged: true }, { busy: true }, { panel: true }, { moving: true }]) expect(canFidget({ ...ok, ...o })).toBe(false);
  });
});

describe("stepping", () => {
  it("fidgets within the gap range, then again, with no repeats in 60 s of fast-forward", () => {
    const kinds: Kind[] = [], r = seeded(11);
    run(startState(r), 120, () => true, r, false, null, kinds);
    expect(kinds.length).toBeGreaterThanOrEqual(5);
    kinds.forEach((k, i) => { if (i) expect(k).not.toBe(kinds[i - 1]); });
  });
  it("waits while busy and does not play", () => {
    const r = seeded(5), kinds: Kind[] = [];
    const s = run(startState(r), 60, () => false, r, false, null, kinds);
    expect(kinds.length).toBe(0);
    expect(s.kind).toBeNull();
  });
  it("an interruption fades out within the cancel time and leaves no pose", () => {
    const r = seeded(2);
    let s: FidgetState = { wait: 0, kind: null, t: 0, last: null, w: 0, side: 1 };
    s = stepFidget(s, 0.01, true, r);
    for (let i = 0; i < 20; i++) s = stepFidget(s, 1 / 60, true, r);
    expect(s.kind).not.toBeNull();
    let secs = 0;
    while (s.kind && secs < 1) { s = stepFidget(s, 1 / 60, false, r); secs += 1 / 60; }
    expect(s.kind).toBeNull();
    expect(secs).toBeLessThanOrEqual(0.25);
    expect(fidgetOffsets(s)).toEqual(NONE);
  });
  it("offsets are zero when idle and small while playing", () => {
    expect(fidgetOffsets({ wait: 5, kind: null, t: 0, last: null, w: 0, side: 1 })).toEqual(NONE);
    for (const k of data.kinds as Kind[]) {
      const d = data.seconds[k], mid = fidgetOffsets({ wait: 0, kind: k, t: d / 2, last: null, w: 1, side: 1 });
      expect(Math.abs(mid.yaw)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(mid.roll)).toBeLessThanOrEqual(0.1);
      expect(mid.squash).toBeGreaterThan(0.9);
      expect(fidgetOffsets({ wait: 0, kind: k, t: d, last: null, w: 1, side: 1 })).toEqual(expect.objectContaining({ blink: expect.closeTo(0, 5), yaw: expect.closeTo(0, 5), squash: expect.closeTo(1, 5) }));
    }
  });
  it("reduced motion: only the blink moves anything", () => {
    for (const k of ["glance", "shake", "settle"] as Kind[]) expect(fidgetOffsets({ wait: 0, kind: k, t: data.seconds[k] / 3, last: null, w: 1, side: 1 }, true)).toEqual(NONE);
    expect(fidgetOffsets({ wait: 0, kind: "blink", t: 0.3, last: null, w: 1, side: 1 }, true).blink).toBeGreaterThan(0.5);
  });
  it("fast mode fidgets about every 1.5 s", () => {
    const r = seeded(1), kinds: Kind[] = [];
    run(startState(r, "fast"), 30, () => true, r, false, "fast", kinds);
    expect(kinds.length).toBeGreaterThanOrEqual(10);
  });
});

describe("dev switch", () => {
  it("parses on and fast", () => { expect(fidgetOverride("?fidget=on", false)).toBe("on"); expect(fidgetOverride("?fidget=fast", false)).toBe("fast"); });
  it("is null for other values", () => { expect(fidgetOverride("?fidget=1", false)).toBeNull(); expect(fidgetOverride("", false)).toBeNull(); });
  it("is ignored in production", () => { expect(fidgetOverride("?fidget=fast", true)).toBeNull(); expect(fidgetOverride("?fidget=on", true)).toBeNull(); });
});

describe("client only", () => {
  it("lib/fidget.ts has no network, storage or server imports", () => {
    const src = readFileSync(new URL("../lib/fidget.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/fetch\(|localStorage|sessionStorage|supabase/i);
  });
});
