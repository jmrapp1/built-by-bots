import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pond from "@/data/pond.json";
import { POND, PONDIDLE, isDay, pondPlace, pondStart } from "@/lib/pond";
import { SKIP, canSkip, handPoint, printWatches, seedRoll, skipFrame, skipLandings, skipPlan, skipRadius, skipWorld, watcherHop } from "@/lib/skip";
import { keyLabel } from "@/lib/ui";

const seeds = Array.from({ length: 200 }, (_, i) => 1000 + i * 37);

describe("skipPlan", () => {
  it("gives 2 to 4 hops for 200 different seeds, and uses every count", () => {
    const counts = new Set<number>();
    for (const s of seeds) { const n = skipPlan(s).hops; expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(4); counts.add(n); }
    expect(counts.size).toBe(3);
  });
  it("is the same plan for the same seed", () => {
    for (const s of seeds.slice(0, 20)) expect(skipPlan(s)).toEqual(skipPlan(s));
  });
  it("lands every hop inside the pond radius minus the edge inset", () => {
    const c = pondPlace(), from = { x: c.x - 6, z: c.z + 1 };
    for (const s of seeds) for (const l of skipPlan(s).landings) {
      expect(Math.hypot(l.along, l.side)).toBeLessThanOrEqual(skipRadius() + 1e-9);
      const w = skipWorld(l, from);
      expect(Math.hypot(w.x - c.x, w.z - c.z)).toBeLessThanOrEqual(c.r - POND.player.edgeInset + 1e-9);
    }
  });
  it("moves away from the thrower, in order", () => {
    for (const s of seeds) { const L = skipPlan(s).landings; for (let i = 1; i < L.length; i++) expect(L[i].along).toBeGreaterThan(L[i - 1].along); }
  });
  it("totals its seconds from its parts", () => {
    for (const s of seeds) { const p = skipPlan(s); expect(p.seconds).toBeCloseTo(p.hops * SKIP.hopSeconds + SKIP.settleSeconds + SKIP.soakSeconds); }
  });
  it("is one gentle hop when reduced", () => { expect(skipPlan(5, true).hops).toBe(SKIP.reducedHops); });
  it("seed rolls are in 0..1", () => { for (const s of seeds) { const r = seedRoll(s, 3); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(1); } });
});

describe("canSkip", () => {
  it("is false at night and true by day", () => {
    expect(canSkip(POND.dayFrom - 0.1, { flying: false })).toBe(false);
    expect(canSkip(23, { flying: false })).toBe(false);
    expect(canSkip(12, { flying: false })).toBe(true);
    expect(isDay(12)).toBe(true);
  });
  it("is false while a page is in flight", () => { expect(canSkip(12, { flying: true })).toBe(false); });
  it("does not depend on the pond state: the Print patting or splashing does not block it", () => {
    // canSkip takes no pond state at all, so a visit in any phase cannot block it.
    expect(canSkip.length).toBe(2);
    for (const st of [PONDIDLE, pondStart(), { ...pondStart(), phase: "patting" as const }, { ...pondStart(), phase: "splashing" as const }]) expect(canSkip(12, { flying: false })).toBe(true && !!st);
  });
});

describe("skipFrame", () => {
  const plan = skipPlan(77), hand = handPoint({ x: pondPlace().x - 6, z: pondPlace().z });
  it("starts in the hand, lands on each landing point and ends gone", () => {
    for (let i = 0; i < plan.hops; i++) {
      const f = skipFrame(plan, (i + 1) * plan.hopSeconds - 1e-6, hand);
      expect(f.at.along).toBeCloseTo(plan.landings[i].along, 3);
      expect(f.y).toBeLessThan(0.1);
    }
    expect(skipFrame(plan, plan.seconds + 0.01, hand).done).toBe(true);
    expect(skipFrame(plan, plan.seconds - 0.01, hand).opacity).toBeLessThan(0.05);
  });
  it("arcs low, squashes on landing, floats, then soaks in", () => {
    let top = 0, low = 1;
    for (let a = 0; a < plan.hops * plan.hopSeconds; a += 0.01) { const f = skipFrame(plan, a, hand); top = Math.max(top, f.y); low = Math.min(low, f.squash); }
    expect(top).toBeGreaterThan(0.2); expect(top).toBeLessThan(1.2); expect(low).toBeLessThan(0.95);
    const mid = skipFrame(plan, plan.hops * plan.hopSeconds + SKIP.settleSeconds * 0.5, hand);
    expect(mid.opacity).toBe(1);
    const late = skipFrame(plan, plan.seconds - SKIP.soakSeconds * 0.5, hand);
    expect(late.opacity).toBeLessThan(1); expect(late.opacity).toBeGreaterThan(0);
  });
  it("reduced motion hops lower and does not spin", () => {
    const a = skipFrame(plan, plan.hopSeconds * 0.5, hand, false), b = skipFrame(plan, plan.hopSeconds * 0.5, hand, true);
    expect(b.y).toBeLessThan(a.y); expect(b.spin).toBe(0);
  });
  it("drops one ring per landing", () => {
    const all = skipLandings(plan, 0, plan.seconds);
    expect(all).toEqual(Array.from({ length: plan.hops }, (_, i) => i));
    expect(skipLandings(plan, 0, plan.hopSeconds * 0.5)).toEqual([]);
  });
});

describe("the watching Print", () => {
  it("watches only when awake and within its call radius; no hop when reduced", () => {
    const c = pondPlace();
    expect(printWatches(true, { x: c.x + 3, z: c.z })).toBe(true);
    expect(printWatches(false, { x: c.x + 3, z: c.z })).toBe(false);
    expect(printWatches(true, { x: c.x + POND.callRadius + 5, z: c.z })).toBe(false);
    const plan = skipPlan(9), at = plan.hops * plan.hopSeconds + SKIP.headTurnSeconds / 2;
    expect(watcherHop(plan, at, false)).toBeGreaterThan(0);
    expect(watcherHop(plan, at, true)).toBe(0);
    expect(watcherHop(plan, 0.1, false)).toBe(0);
  });
});

describe("data/pond.json skip block", () => {
  const k = pond.skip;
  it("has every field in range", () => {
    expect(typeof k.key).toBe("string"); expect(k.key).toMatch(/^Key[A-Z]$/);
    expect(k.key).not.toBe("KeyE"); expect(k.key).not.toBe("KeyQ"); expect(k.key).not.toBe("KeyR"); expect(k.key).not.toBe("KeyM");
    expect(k.hops).toHaveLength(2); expect(k.hops[0]).toBeGreaterThanOrEqual(2); expect(k.hops[1]).toBeLessThanOrEqual(4); expect(k.hops[0]).toBeLessThanOrEqual(k.hops[1]);
    expect(k.reducedHops).toBe(1);
    for (const f of ["hopLength", "hopHeight", "hopSeconds", "settleSeconds", "soakSeconds", "fadeInSeconds", "reducedFadeSeconds", "cancelSeconds", "headTurnSeconds"] as const) { expect(k[f]).toBeGreaterThan(0); expect(k[f]).toBeLessThan(5); }
    expect(k.hopDecay).toBeGreaterThan(0); expect(k.hopDecay).toBeLessThanOrEqual(1);
    expect(k.maxPages).toBe(1);
    expect(k.prompt.picture).toBe("page"); expect(k.prompt.line.length).toBeGreaterThan(0); expect(k.prompt.line).not.toMatch(/\d/);
    expect(k.cancelSeconds).toBeLessThanOrEqual(0.25);
    expect(k.watcherHop).toBeGreaterThanOrEqual(0);
    expect(k.hopLength * k.hops[1]).toBeLessThan(pondPlace().r * 2);
  });
  it("the key label is a plain letter", () => { expect(keyLabel(k.key)).toBe(k.key.slice(3)); });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("skip logic has no three.js, clock, randomness, storage or network", () => {
    expect(src("../lib/skip.ts")).not.toMatch(/three|Math\.random|Date\.now|performance|localStorage|fetch|supabase|rpc/);
  });
  it("World uses no network or storage for a skip, and disposes the page", () => {
    const w = src("../components/World.tsx");
    expect(w).not.toMatch(/supabase|\.rpc\(|fetch\(/);
    expect(w).toMatch(/endSkip\(\);\n\s*saveWalked/);
  });
  it("the pond card has no numbers or inspiration names", () => { expect(JSON.stringify(k_prompt())).not.toMatch(/\d/); });
});
function k_prompt() { return pond.skip.prompt; }
