import { describe, expect, it } from "vitest";
import raw from "@/data/sights.json";
import { SIGHTS, checkSights, levelStep, pickSights, sightLevel, sightUsable, sightsForDay } from "@/lib/sights";
import { MARGINS, buildField, generateLayout, reachable, spotsForDay, zoneOf } from "@/lib/margins";
import { NPCS, npcSpot } from "@/lib/npcs";
import { hourOverride } from "@/lib/daynight";

const S = SIGHTS!;
const layout = generateLayout(), field = buildField(layout.cols);
const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));
const good = () => JSON.parse(JSON.stringify(raw));

describe("the data file", () => {
  it("loads with 10 to 14 points of the three kinds in all three zones", () => {
    expect(S).not.toBeNull();
    expect(S.points.length).toBeGreaterThanOrEqual(10);
    expect(S.points.length).toBeLessThanOrEqual(14);
    expect(new Set(S.points.map((p) => p.kind)).size).toBe(3);
    for (const z of MARGINS.zones) expect(S.points.some((p) => zoneOf(p)?.id === z.id)).toBe(true);
  });
  it("has short captions with no promise of a reward", () => {
    for (const c of Object.values(S.captions)) { expect(c.length).toBeLessThanOrEqual(60); expect(c).not.toMatch(/reward|trade|gift|prize|coin|egg|food/i); }
  });
  it("rejects bad data without throwing, and skips only a bad point", () => {
    for (const junk of [null, undefined, 5, "x", [], {}]) expect(checkSights(junk)).toBeNull();
    const a = good(); a.window.inTo = 18; expect(checkSights(a)).toBeNull();
    const b = good(); b.captions.moth = ""; expect(checkSights(b)).toBeNull();
    const c = good(); c.points[0] = null; c.points[1].kind = "ghost"; c.points[2].x = 999;
    expect(checkSights(c)!.points).toHaveLength(raw.points.length - 3);
    const d = good(); d.points = "no"; expect(checkSights(d)).toBeNull();
  });
});

describe("the hour window", () => {
  const w = S.window;
  it("is off by day, half in at dusk, on at night, half out at dawn", () => {
    expect(sightLevel(12, w)).toBe(0);
    expect(sightLevel(9, w)).toBe(0);
    expect(sightLevel(18, w)).toBe(0);
    expect(sightLevel(19.5, w)).toBeCloseTo(0.5, 5);
    expect(sightLevel(21.5, w)).toBe(1);
    expect(sightLevel(2, w)).toBe(1);
    expect(sightLevel(6.5, w)).toBeCloseTo(0.5, 5);
    expect(sightLevel(8, w)).toBe(0);
  });
  it("is smooth across both boundaries and across midnight", () => {
    let last = sightLevel(0, w);
    for (let h = 0; h <= 24; h += 0.02) { const v = sightLevel(h, w); expect(Math.abs(v - last)).toBeLessThan(0.03); last = v; }
    expect(sightLevel(24, w)).toBe(sightLevel(0, w));
    expect(sightLevel(-2, w)).toBe(sightLevel(22, w));
  });
  it("fades toward the target in about 2 s, or 0.15 s with reduced motion, never popping", () => {
    let v = 0, t = 0; while (v < 1 && t < 5) { v = levelStep(v, 1, 0.01, false); t += 0.01; }
    expect(t).toBeGreaterThan(1.9); expect(t).toBeLessThan(2.1);
    v = 0; t = 0; while (v < 1 && t < 5) { v = levelStep(v, 1, 0.01, true); t += 0.01; }
    expect(t).toBeLessThanOrEqual(0.17);
    expect(levelStep(1, 0, 0.016, false)).toBeGreaterThan(0.99);
  });
  it("?hour= is read the same way as for the light", () => {
    expect(hourOverride("?area=margins&hour=21.5")).toBe(21.5);
  });
});

describe("tonight's pick", () => {
  it("gives min..max points, the same for the same day, from the list", () => {
    for (const d of days) {
      const a = pickSights(d, S.points, S.perNight);
      expect(a.length).toBeGreaterThanOrEqual(S.perNight.min); expect(a.length).toBeLessThanOrEqual(S.perNight.max);
      expect(pickSights(d, S.points, S.perNight)).toEqual(a);
      expect(new Set(a).size).toBe(a.length);
      for (const p of a) expect(S.points).toContain(p);
    }
  });
  it("varies by day and reaches every point over a month, and every zone each night", () => {
    const sets = new Set(days.map((d) => pickSights(d, S.points, S.perNight).map((p) => `${p.x},${p.z}`).sort().join("|")));
    expect(sets.size).toBeGreaterThan(20);
    const seen = new Set<string>();
    for (const d of days) { const a = pickSights(d, S.points, S.perNight); for (const p of a) seen.add(`${p.x},${p.z}`); expect(new Set(a.map((p) => zoneOf(p)?.id)).size).toBe(3); }
    expect(seen.size).toBe(S.points.length);
  });
  it("handles a bad day or no points", () => {
    expect(pickSights("nope", S.points, S.perNight)).toEqual([]);
    expect(pickSights(days[0], [], S.perNight)).toEqual([]);
  });
});

describe("placement", () => {
  const npcs = NPCS.flatMap((n) => (n.spots ? n.spots.map((s) => ({ x: s.at[0], z: s.at[1] })) : [npcSpot(n)]));
  const pagesOn = (d: string) => spotsForDay(d, layout, field).map((s) => ({ x: s.x, z: s.z }));
  it("every point is clear of scenery, the gate path and every neighbour spot, and is reachable", () => {
    for (const p of S.points) {
      expect(sightUsable(p, layout, [], npcs, S.clear), `${p.x},${p.z}`).toBe(true);
      expect(reachable(field, p)).toBe(true);
    }
  });
  it("each night shows at least the minimum, none on a folded page, none on a neighbour, spread over the zones", () => {
    for (const d of days) {
      const pages = pagesOn(d), a = sightsForDay(d, layout, pages, npcs, S);
      expect(a.length).toBeGreaterThanOrEqual(S.perNight.min); expect(a.length).toBeLessThanOrEqual(S.perNight.max);
      for (const p of a) {
        expect(Math.min(...pages.map((q) => Math.hypot(q.x - p.x, q.z - p.z)))).toBeGreaterThanOrEqual(S.clear.pages);
        expect(Math.min(...npcs.map((q) => Math.hypot(q.x - p.x, q.z - p.z)))).toBeGreaterThanOrEqual(S.clear.npc);
      }
      expect(new Set(a.map((p) => zoneOf(p)?.id)).size).toBeGreaterThanOrEqual(2);
      expect(sightsForDay(d, layout, pages, npcs, S)).toEqual(a);
    }
  });
  it("rejects a point on a tree, on a page or on a neighbour", () => {
    const t = layout.trees[0];
    expect(sightUsable({ x: t.x, z: t.z }, layout, [], [], S.clear)).toBe(false);
    expect(sightUsable({ x: 20, z: 20 }, layout, [{ x: 20, z: 20.5 }], [], S.clear)).toBe(false);
    expect(sightUsable({ x: 20, z: 20 }, layout, [], [{ x: 20, z: 21 }], S.clear)).toBe(false);
  });
});
