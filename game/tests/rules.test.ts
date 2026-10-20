import { describe, expect, it } from "vitest";
import { applyFeed, canFeed, canHatch, FOODS, RULES, secondsUntilHatch } from "@/lib/rules";

const t = (s: number) => new Date(1_000_000 + s * 1000);

describe("hatching", () => {
  it("is not ready before the timer", () => {
    expect(canHatch(t(45), t(44))).toBe(false);
    expect(secondsUntilHatch(t(45), t(40))).toBe(5);
  });
  it("is ready at and after the timer", () => {
    expect(canHatch(t(45), t(45))).toBe(true);
    expect(secondsUntilHatch(t(45), t(100))).toBe(0);
  });
});

describe("feeding", () => {
  const ink = FOODS.find((f) => f.id === "ink")!;
  it("raises stats", () => {
    expect(applyFeed({ fullness: 50, mood: 50 }, ink)).toEqual({ fullness: 70, mood: 55 });
  });
  it("caps at the maximum and never lowers", () => {
    const out = applyFeed({ fullness: 95, mood: 100 }, ink);
    expect(out).toEqual({ fullness: RULES.maxStat, mood: RULES.maxStat });
    for (const f of FOODS) {
      const r = applyFeed({ fullness: 10, mood: 10 }, f);
      expect(r.fullness).toBeGreaterThanOrEqual(10);
      expect(r.mood).toBeGreaterThanOrEqual(10);
    }
  });
  it("enforces cooldown and daily cap", () => {
    expect(canFeed(t(0), t(1), 0)).toBe("too soon");
    expect(canFeed(t(0), t(RULES.feedCooldownSeconds), 0)).toBe("ok");
    expect(canFeed(null, t(0), RULES.feedsPerDay)).toBe("fed enough for today");
  });
});
