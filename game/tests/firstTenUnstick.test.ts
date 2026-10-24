import { describe, expect, it } from "vitest";
import { flagOn, unstickOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";
import { STEPS, currentHint, guideFinished, type Ctx, type Step } from "@/lib/guide";

const base: Ctx = { ready: true, inGarden: true, nearEgg: false, eggPending: false, printNear: true, hasSnack: false, hasCreature: true, dismissed: [] };
const upToHatch: Step[] = ["move", "egg", "hatch"];
const fed: Step[] = [...upToHatch, "feed"];

describe("S38c switch", () => {
  it("ships on; anything but a plain true is off", () => {
    expect((firstTen as { firstTen: { unstick: unknown } }).firstTen.unstick).toBe(true);
    for (const v of ["true", 1, null, undefined, {}]) expect(flagOn({ firstTen: { unstick: v } }, "unstick")).toBe(false);
    expect(flagOn({ firstTen: { unstick: true } }, "unstick")).toBe(true);
    expect(flagOn(null, "unstick")).toBe(false);
  });
  it("?unstick= overrides in dev only", () => {
    expect(unstickOn("?unstick=1", false, { firstTen: { unstick: false } })).toBe(true);
    expect(unstickOn("?unstick=0", false, { firstTen: { unstick: true } })).toBe(false);
    expect(unstickOn("?unstick=1", true, { firstTen: { unstick: false } })).toBe(false);
  });
});

describe("S38c flag on", () => {
  const on = { ...base, unstick: true };
  it("1. fed at night: map line; opening the map finishes the guide", () => {
    expect(currentHint(fed, { ...on, fedThisSession: true, day: false })).toBe("map");
    expect(guideFinished([...fed, "map"], true)).toBe(true);
  });
  it("2. fed earlier, reload by day: stroke, then map", () => {
    expect(currentHint(fed, { ...on, day: true })).toBe("stroke");
    expect(currentHint([...fed, "stroke"], { ...on, day: true })).toBe("map");
  });
  it("3. fed earlier, reload at night: map", () => {
    expect(currentHint(fed, { ...on, day: false })).toBe("map");
  });
  it("4. normal day path unchanged: feed, stroke, map", () => {
    const d = { ...on, day: true };
    expect(currentHint(upToHatch, { ...d, hasSnack: true })).toBe("feed");
    expect(currentHint(fed, { ...d, fedThisSession: true })).toBe("stroke");
    expect(currentHint([...fed, "stroke"], { ...d, fedThisSession: true })).toBe("map");
  });
  it("no stroke or map before the feed; stroke needs a Print near", () => {
    expect(currentHint(upToHatch, { ...on, day: false })).toBeNull();
    expect(currentHint(fed, { ...on, day: true, printNear: false })).toBeNull();
    expect(currentHint(fed, { ...on, day: true, hasCreature: false })).toBeNull();
  });
  it("a map hint is shown at most once done; stroke is not a gate for finishing", () => {
    expect(currentHint([...fed, "map"], { ...on, day: false })).toBeNull();
    expect(guideFinished([...fed, "map"], true)).toBe(true);
    expect(guideFinished(fed, true)).toBe(false);
  });
});

describe("S38c flag off equals main", () => {
  const off = { ...base };
  it("fed at night / earlier visit: stall as today", () => {
    expect(currentHint(fed, { ...off, fedThisSession: true, day: false })).toBeNull();
    expect(currentHint(fed, { ...off, day: false })).toBeNull();
    expect(currentHint(fed, { ...off, day: true })).toBeNull();
    expect(currentHint(fed, { ...off, unstick: false, day: true })).toBeNull();
    expect(guideFinished([...fed, "map"])).toBe(false);
  });
  it("day path as today", () => {
    expect(currentHint(fed, { ...off, fedThisSession: true, day: true })).toBe("stroke");
    expect(currentHint([...fed, "stroke"], off)).toBe("map");
    expect(guideFinished([...STEPS])).toBe(true);
  });
});
