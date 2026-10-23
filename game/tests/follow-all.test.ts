import { describe, expect, it } from "vitest";
import { FOLLOW, chooseFocus, followMove, followRouteTo, followTarget, homeGoal, joiners, restSpot } from "@/lib/follow";
import { GARDEN, HOME, type Colliders } from "@/lib/world";
import { WORLD } from "@/lib/worldMap";
import { NIGHT } from "@/lib/night";

const open: Colliders = { circles: [], boxes: [] };
const ps = (...a: [string, number, number][]) => a.map(([id, x, z]) => ({ id, x, z }));

describe("S33 follow beyond Home", () => {
  it("a target outside the Home square is allowed, but never outside the World", () => {
    const t = followTarget({ x: 60, z: 60 }, 0, open)!;
    expect(Math.abs(t.z - 60)).toBeLessThan(5); expect(Math.abs(t.z)).toBeGreaterThan(HOME.half);
    const edge = followTarget({ x: WORLD.size / 2 - 0.2, z: 0 }, Math.PI / 2, open);
    if (edge) expect(Math.abs(edge.x)).toBeLessThanOrEqual(WORLD.size / 2);
  });
  it("targets avoid colliders", () => {
    const cols: Colliders = { circles: [{ x: 50, z: 48.1, r: 1 }], boxes: [] };
    const t = followTarget({ x: 50, z: 50 }, 0, cols);
    if (t) expect(Math.hypot(t.x - 50, t.z - 48.1)).toBeGreaterThan(1);
  });
  it("different slots give different, spread-out spots; further slots sit further back", () => {
    const spots = [0, 1, 2, 3, 4].map((k) => followTarget({ x: 0, z: 0 }, 0, open, GARDEN.print.radius, k)!);
    expect(new Set(spots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`)).size).toBe(5);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(0.5);
    expect(spots[4].z).toBeLessThan(spots[0].z); // behind (heading 0 walks toward +z)
  });
  it("slot 0 is unchanged from before", () => {
    expect(followTarget({ x: 0, z: 9 }, 0, open)).toEqual(followTarget({ x: 0, z: 9 }, 0, open, GARDEN.print.radius, 0));
  });
  it("followMove can leave Home but not the World", () => {
    const m = followMove({ x: HOME.half - 0.5, z: 0 }, { x: HOME.half + 5, z: 0 }, 4, 1, { x: 1e6, z: 1e6 }, open);
    expect(m.pos.x).toBeGreaterThan(HOME.half);
    const e = followMove({ x: WORLD.size / 2 - 1, z: 0 }, { x: WORLD.size, z: 0 }, 40, 1, { x: 1e6, z: 1e6 }, open);
    expect(e.pos.x).toBeLessThanOrEqual(WORLD.size / 2);
  });
  it("routes stay a small window and end at the goal", () => {
    const r = followRouteTo({ x: 70, z: 70 }, { x: 90, z: 80 }, { circles: [{ x: 80, z: 75, r: 3 }], boxes: [] }, GARDEN.print.radius);
    expect(r[r.length - 1]).toEqual({ x: 90, z: 80 });
    expect(followRouteTo({ x: 0, z: 0 }, { x: 3, z: 3 }, open, GARDEN.print.radius)).toEqual([{ x: 3, z: 3 }]);
  });
});

describe("S33 several Prints", () => {
  it("homeGoal: null inside Home, a point inside Home when outside", () => {
    expect(homeGoal({ x: 0, z: 0 })).toBeNull();
    const g = homeGoal({ x: 80, z: -90 })!;
    expect(Math.abs(g.x)).toBeLessThan(HOME.half); expect(Math.abs(g.z)).toBeLessThan(HOME.half);
  });
  it("joiners: nearest first, within joinRadius, capped, ties by id", () => {
    const o = ps(["c", 3, 0], ["a", 2, 0], ["far", FOLLOW.joinRadius + 1, 0], ["b", 3, 0]);
    expect(joiners({ x: 0, z: 0 }, o)).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, x: 1 + i * 0.1, z: 0 }));
    expect(joiners({ x: 0, z: 0 }, many)).toHaveLength(FOLLOW.maxCompanions);
  });
  it("chooseFocus: stays put unless another is clearly nearer and within focusRadius", () => {
    const p = { x: 0, z: 0 };
    expect(chooseFocus(p, ps(["a", 5, 0]), "a")).toBe("a");
    expect(chooseFocus(p, ps(["a", 4, 0], ["b", 3.5, 0]), "a")).toBe("a"); // not clearly nearer
    expect(chooseFocus(p, ps(["a", 4, 0], ["b", 2, 0]), "a")).toBe("b");
    expect(chooseFocus(p, ps(["a", 20, 0], ["b", FOLLOW.focusRadius + 1, 0]), "a")).toBe("a"); // too far
    expect(chooseFocus(p, ps(["a", 20, 0], ["b", 2, 0]), null)).toBe("b");
  });
  it("rest spots are distinct and close to the bed", () => {
    const s = FOLLOW.restSpots.map((_, i) => restSpot(NIGHT.bed, i));
    expect(new Set(s.map((q) => `${q.x},${q.z}`)).size).toBe(s.length);
    for (const q of s) expect(Math.hypot(q.x - NIGHT.bed.x, q.z - NIGHT.bed.z)).toBeLessThan(3.5);
    expect(FOLLOW.restSpots.length).toBeGreaterThanOrEqual(FOLLOW.maxCompanions);
  });
});
