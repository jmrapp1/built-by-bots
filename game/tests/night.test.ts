import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NIGHT, fireflyAnchors, fireflyAt, fireflyLevel, mixPose, routeTo, sleepPhase, sleepPose, stretchPose, swirlPuffs, walkRoute } from "@/lib/night";
import { hourOverride, lightingAt } from "@/lib/daynight";
import { GARDEN, colliders, insideAny } from "@/lib/world";
import { PLAY } from "@/lib/play";
import { BOARD_PAGES } from "@/lib/board";

const cols = colliders();
const R = GARDEN.print.radius;

describe("sleep follows the local hour", () => {
  it("is awake by day, goes to bed in the evening, sleeps through the night", () => {
    expect(sleepPhase(7)).toBe("awake");
    expect(sleepPhase(12)).toBe("awake");
    expect(sleepPhase(19)).toBe("awake");
    expect(sleepPhase(20)).toBe("going");
    expect(sleepPhase(22)).toBe("asleep");
  });
  it("wraps at midnight: asleep either side of it, awake again by morning", () => {
    for (const h of [23.99, 0, 0.01, 3, 6.49]) expect(sleepPhase(h)).toBe("asleep");
    expect(sleepPhase(6.5)).toBe("awake");
    expect(sleepPhase(7)).toBe("awake");
    expect(sleepPhase(24 + 2)).toBe("asleep"); // 26h is 02:00
    expect(sleepPhase(-1)).toBe("asleep"); // -1h is 23:00
  });
  it("works with the ?hour= preview", () => {
    expect(sleepPhase(hourOverride("?hour=22")!)).toBe("asleep");
    expect(sleepPhase(hourOverride("?hour=12")!)).toBe("awake");
    expect(sleepPhase(hourOverride("?hour=7")!)).toBe("awake");
    expect(sleepPhase(hourOverride("?hour=19.7")!)).toBe("going");
  });
  it("bedtime comes after the light has turned to dusk", () => {
    expect(NIGHT.bedtimeFrom).toBeGreaterThanOrEqual(18.5);
    expect(lightingAt(NIGHT.sleepFrom + 1).sunIntensity).toBeLessThan(lightingAt(12).sunIntensity);
  });
});

describe("fireflies", () => {
  it("are off by day, fade in at dusk, glow all night, and fade out at dawn", () => {
    expect(fireflyLevel(12)).toBe(0);
    expect(fireflyLevel(18)).toBe(0);
    const dusk = [18.7, 19.2, 19.8, 20.3].map(fireflyLevel);
    expect(dusk).toEqual([...dusk].sort((a, b) => a - b));
    expect(fireflyLevel(22)).toBe(1);
    expect(fireflyLevel(0)).toBe(1);
    expect(fireflyLevel(5.9)).toBe(1);
    expect(fireflyLevel(6.5)).toBeLessThan(1);
    expect(fireflyLevel(6.5)).toBeGreaterThan(0);
    expect(fireflyLevel(7.5)).toBe(0);
  });
  it("loop near trees and the pond, in the air, forever", () => {
    const a = fireflyAnchors();
    expect(a.length).toBeGreaterThan(5);
    for (let i = 0; i < NIGHT.fireflies.count; i++) for (const t of [0, 10, 1000, 100000]) {
      const p = fireflyAt(i, t, a);
      const anchor = a[i % a.length];
      expect(Math.hypot(p.x - anchor.x, p.z - anchor.z)).toBeLessThanOrEqual(NIGHT.fireflies.orbit + 0.01);
      expect(p.y).toBeGreaterThan(0.2);
      expect(p.glow).toBeGreaterThan(0);
    }
  });
  it("drift slower and do not twinkle when motion is reduced", () => {
    const a = fireflyAnchors();
    const move = (r: boolean) => Math.hypot(fireflyAt(0, 5, a, r).x - fireflyAt(0, 0, a, r).x, fireflyAt(0, 5, a, r).z - fireflyAt(0, 0, a, r).z);
    expect(move(true)).toBeLessThan(move(false));
    expect(fireflyAt(2, 1, a, true).glow).toBe(fireflyAt(2, 9, a, true).glow);
  });
});

describe("poses", () => {
  it("sleeping is flat and breathes slowly; reduced motion breathes less", () => {
    const range = (r: boolean) => { const v = Array.from({ length: 80 }, (_, i) => sleepPose(i * 0.1, r).squash); return Math.max(...v) - Math.min(...v); };
    expect(sleepPose(0).squash).toBeLessThan(0.8);
    expect(range(false)).toBeGreaterThan(0.03);
    expect(range(true)).toBeLessThan(range(false));
  });
  it("a yawn stretches then squashes and ends at rest; waking adds a small hop unless reduced", () => {
    const y = Array.from({ length: 40 }, (_, i) => stretchPose((i / 40) * NIGHT.yawnSeconds, false).squash);
    expect(Math.max(...y)).toBeGreaterThan(1.05);
    expect(Math.min(...y)).toBeLessThan(0.95);
    expect(stretchPose(NIGHT.yawnSeconds, false).squash).toBeCloseTo(1);
    expect(stretchPose(NIGHT.wakeSeconds / 2, true).hop).toBeGreaterThan(0.05);
    expect(stretchPose(NIGHT.wakeSeconds / 2, true, true).hop).toBe(0);
    expect(stretchPose(0, false).hop).toBe(0);
  });
  it("blends between poses gently", () => {
    const m = mixPose({ lean: 0, squash: 1, hop: 0.2 }, sleepPose(0), 0.5);
    expect(m.squash).toBeCloseTo((1 + sleepPose(0).squash) / 2);
    expect(mixPose({ lean: 0, squash: 1, hop: 0 }, sleepPose(0), 0).squash).toBe(1);
  });
  it("ink swirls rise and fade, a few at a time", () => {
    for (let t = 0; t < 30; t += 0.3) {
      const p = swirlPuffs(t);
      expect(p.length).toBeLessThanOrEqual(NIGHT.swirl.slots);
      for (const s of p) { expect(s.opacity).toBeGreaterThanOrEqual(0); expect(s.dy).toBeLessThanOrEqual(NIGHT.swirl.rise + 1e-9); }
    }
    expect(Array.from({ length: 100 }, (_, i) => swirlPuffs(i * 0.2).length).some((n) => n > 0)).toBe(true);
  });
});

describe("getting to bed", () => {
  const rest = GARDEN.places.find((p) => p.kind === "rest")!;
  it("the bed is on the rest spot and the approach point is clear", () => {
    expect(NIGHT.bed.x).toBe(rest.x);
    expect(NIGHT.bed.z).toBe(rest.z);
    expect(insideAny(NIGHT.approach, R + 0.15, cols)).toBe(false);
    expect(Math.hypot(NIGHT.approach.x - rest.x, NIGHT.approach.z - rest.z)).toBeGreaterThan((rest.solid ?? 0) + R);
  });
  it("the sitting place is clear, beside the bed and within feeding reach of the sleeper", () => {
    expect(insideAny(NIGHT.sit, GARDEN.player.radius, cols)).toBe(false);
    expect(Math.hypot(NIGHT.sit.x - NIGHT.bed.x, NIGHT.sit.z - NIGHT.bed.z)).toBeLessThanOrEqual(GARDEN.print.feedReach);
  });
  it("from anywhere clear in the garden the Print can walk to the approach point and never gets stuck", () => {
    const lim = GARDEN.size / 2 - R - 1;
    let tried = 0;
    for (let x = -lim; x <= lim; x += 2.5) for (let z = -lim; z <= lim; z += 2.5) {
      if (insideAny({ x, z }, R + 0.15, cols)) continue;
      tried++;
      let pos = { x, z }, leg = 0, steps = 0, done = false;
      const route = routeTo(pos, NIGHT.approach, cols, R);
      expect(route[route.length - 1]).toEqual(NIGHT.approach);
      while (!done && steps++ < 5000) {
        const r = walkRoute(pos, route, leg, 0.05, R, cols);
        expect(insideAny(r.pos, R - 0.05, cols)).toBe(false); // never inside scenery
        pos = r.pos; leg = r.leg; done = r.done;
      }
      expect(done, `stuck from ${x},${z}`).toBe(true);
      expect(Math.hypot(pos.x - NIGHT.approach.x, pos.z - NIGHT.approach.z)).toBeLessThan(0.3);
    }
    expect(tried).toBeGreaterThan(40);
  });
  it("walks around the hedge between the nest and the bench", () => {
    const route = routeTo({ x: 0, z: -2 }, NIGHT.approach, cols, R);
    expect(route.length).toBeGreaterThan(1);
  });
  it("a body in the way is pushed out, not through", () => {
    const r = walkRoute({ x: 4, z: 3 }, [{ x: 6, z: 3 }], 0, 1, R, cols);
    expect(insideAny(r.pos, R - 0.05, cols)).toBe(false);
  });
});

describe("waking and wandering are gentle", () => {
  it("a nap lasts long enough to see and the wake-up is slow", () => {
    expect(NIGHT.napSeconds).toBeGreaterThan(PLAY.reactionSeconds);
    expect(NIGHT.wakeSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("makes no server call for sleep, and feed_creature stays the only feed path", () => {
    expect(src("../lib/night.ts")).not.toMatch(/supabase|rpc|three|Date\.now|performance|fetch/);
    expect(src("../components/World.tsx")).not.toMatch(/supabase|\.rpc\(|fetch\(/);
    const calls = [...src("../app/page.tsx").matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_decorations", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold", "set_home_decoration", "set_worn_cosmetic", "world_unfold"]);
  });
  it("the board mentions the evening without numbers or times", () => {
    const text = BOARD_PAGES.flatMap((p) => p.lines).join(" ");
    expect(text).toMatch(/evening|night/i);
    expect(JSON.stringify(BOARD_PAGES)).not.toMatch(/\d/);
  });
});
