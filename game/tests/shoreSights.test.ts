import { describe, expect, it } from "vitest";
import raw from "@/data/shoreSights.json";
import marginsRaw from "@/data/sights.json";
import { SIGHTS, checkSights, pickSights } from "@/lib/sights";
import { SHORE_BOUNDS, SHORE_SALT, SHORE_SIGHTS, shoreSightsForDay, shoreUsable } from "@/lib/shoreSights";
import { WORLD, blocked, chunkCircles, chunkContents, regionAt } from "@/lib/worldMap";
import { spotsForDay } from "@/lib/worldSpots";

const S = SHORE_SIGHTS!;
const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));
const good = () => JSON.parse(JSON.stringify(raw));
const key = (p: { x: number; z: number }) => `${p.x},${p.z}`;

describe("the shore data file", () => {
  it("loads with 10 to 14 points of the three kinds, all inside the shore", () => {
    expect(S).not.toBeNull();
    expect(S.points.length).toBeGreaterThanOrEqual(10); expect(S.points.length).toBeLessThanOrEqual(14);
    expect(S.points).toHaveLength(raw.points.length); // none dropped by the bounds
    expect(new Set(S.points.map((p) => p.kind)).size).toBe(3);
    for (const p of S.points) expect(regionAt(p.z, p.x)).toBe("pressmark_shore");
  });
  it("has the same hour window as the Margins and short fixed captions", () => {
    expect(S.window).toEqual(SIGHTS!.window);
    for (const c of Object.values(S.captions)) { expect(c.length).toBeLessThanOrEqual(60); expect(c).not.toMatch(/reward|trade|gift|prize|coin|egg|food/i); }
  });
  it("has per-night counts of 5 to 7", () => { expect(S.perNight).toEqual({ min: 5, max: 7 }); });
});

describe("the validator bounds", () => {
  it("keeps the Margins default: a shore point is rejected there, a Margins point is kept", () => {
    expect(checkSights(raw)!.points).toHaveLength(0);
    expect(checkSights(marginsRaw)!.points).toHaveLength(marginsRaw.points.length);
    expect(SIGHTS!.points).toHaveLength(marginsRaw.points.length);
  });
  it("takes bounds as a parameter, edges inclusive", () => {
    const b = { x0: 0, x1: 10, z0: 0, z1: 10 };
    const d = good(); d.points = [{ x: 0, z: 10, kind: "moth" }, { x: 11, z: 5, kind: "ink" }, { x: 5, z: -1, kind: "glint" }];
    expect(checkSights(d, b)!.points).toEqual([{ x: 0, z: 10, kind: "moth" }]);
  });
  it("skips only a bad shore point, and gives null for bad top-level data", () => {
    const c = good(); c.points[0] = null; c.points[1].kind = "ghost"; c.points[2].x = 999;
    expect(checkSights(c, SHORE_BOUNDS)!.points).toHaveLength(raw.points.length - 3);
    for (const junk of [null, undefined, 5, "x", [], {}]) expect(checkSights(junk, SHORE_BOUNDS)).toBeNull();
    const d = good(); d.points = "no"; expect(checkSights(d, SHORE_BOUNDS)).toBeNull();
  });
  it("shore bounds are the shore rectangle", () => {
    expect(SHORE_BOUNDS.x0).toBeGreaterThan(WORLD.shoreX); expect(SHORE_BOUNDS.x1).toBeLessThan(WORLD.size / 2);
    expect(SHORE_BOUNDS.z0).toBeGreaterThan(WORLD.inkwoodZ); expect(SHORE_BOUNDS.z1).toBeLessThan(WORLD.glyphZ);
  });
});

describe("the shore usable check", () => {
  it("every authored point is not blocked and is clear of scenery (so the data is placeable)", () => {
    for (const p of S.points) {
      expect(blocked(p.x, p.z), key(p)).toBe(false);
      expect(shoreUsable(p, [], S.clear), key(p)).toBe(true);
    }
  });
  it("rejects a blocked point, a tree, and a point on a folded page", () => {
    expect(shoreUsable({ x: 100, z: -8 }, [], S.clear)).toBe(false); // the lantern-bridge
    expect(shoreUsable({ x: 70, z: 36 }, [], S.clear)).toBe(false); // the page-tower
    const circle = [-1, 0, 1, 2].flatMap((cx) => [-1, 0, 1, 2].map((cz) => chunkCircles(chunkContents(cx + 2, cz + 1)))).flat().find((c) => c.x > SHORE_BOUNDS.x0 && c.x < SHORE_BOUNDS.x1 && c.z > SHORE_BOUNDS.z0 && c.z < SHORE_BOUNDS.z1 && !blocked(c.x, c.z));
    expect(circle).toBeTruthy();
    expect(shoreUsable({ x: circle!.x, z: circle!.z }, [], S.clear)).toBe(false);
    expect(shoreUsable({ x: 90, z: 0 }, [{ x: 90, z: 0.5 }], S.clear)).toBe(false);
  });
});

describe("tonight's shore pick", () => {
  it("gives 5 to 7 points from the list, the same for the same day, none on a shore folded page", () => {
    for (const d of days) {
      const a = shoreSightsForDay(d, S), pages = spotsForDay(d, "pressmark_shore");
      expect(a.length).toBeGreaterThanOrEqual(5); expect(a.length).toBeLessThanOrEqual(7);
      expect(shoreSightsForDay(d, S)).toEqual(a);
      expect(new Set(a.map(key)).size).toBe(a.length);
      for (const p of a) {
        expect(S.points.map(key)).toContain(key(p));
        for (const q of pages) expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThanOrEqual(S.clear.pages);
      }
    }
  });
  it("varies by day and reaches every point over two months", () => {
    const sets = new Set(days.map((d) => shoreSightsForDay(d, S).map(key).sort().join("|")));
    expect(sets.size).toBeGreaterThan(20);
    const seen = new Set<string>(); for (const d of days) for (const p of shoreSightsForDay(d, S)) seen.add(key(p));
    expect(seen.size).toBe(S.points.length);
  });
  it("the seed salt makes the pick differ from the same list picked with the Margins seed", () => {
    let differ = 0;
    for (const d of days) {
      const a = pickSights(d, S.points, S.perNight, { salt: SHORE_SALT, spread: false }).map(key).join("|");
      const b = pickSights(d, S.points, S.perNight, { spread: false }).map(key).join("|");
      if (a !== b) differ++;
    }
    expect(differ).toBeGreaterThan(days.length * 0.8);
  });
  it("leaves the Margins pick as it was (default salt 0 and zone spread on)", () => {
    for (const d of days) expect(pickSights(d, SIGHTS!.points, SIGHTS!.perNight)).toEqual(pickSights(d, SIGHTS!.points, SIGHTS!.perNight, { salt: 0, spread: true }));
  });
  it("handles a bad day", () => { expect(shoreSightsForDay("nope", S)).toEqual([]); });
});
