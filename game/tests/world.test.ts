import { describe, expect, it } from "vitest";
import {
  GARDEN, cameraDistance, clampToBounds, colliders, insideAny, movePlayer, nearestPlace, newWander, pushOut, stepWander,
} from "@/lib/world";

const cols = colliders();

// Exact circle-vs-collider overlap (insideAny is a looser square test used for picking spots).
function overlaps(p: { x: number; z: number }, r: number) {
  return (
    cols.circles.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + r) ||
    cols.boxes.some((b) => Math.hypot(p.x - Math.max(b.x - b.w / 2, Math.min(b.x + b.w / 2, p.x)), p.z - Math.max(b.z - b.d / 2, Math.min(b.z + b.d / 2, p.z))) < r)
  );
}
const P = GARDEN.player;

describe("garden data", () => {
  it("has the six places inside the garden", () => {
    expect(GARDEN.places.map((p) => p.id).sort()).toEqual(["egg-spot", "inkwell", "nest", "notice-board", "pond", "rest-spot"]);
    for (const p of GARDEN.places) {
      expect(Math.abs(p.x)).toBeLessThan(GARDEN.size / 2);
      expect(Math.abs(p.z)).toBeLessThan(GARDEN.size / 2);
    }
  });
  it("starts the player in free space", () => {
    expect(insideAny({ x: P.start[0], z: P.start[1] }, P.radius, cols)).toBe(false);
  });
  it("lets the player reach every place", () => {
    for (const p of GARDEN.places) {
      const free = { x: p.x, z: p.z + (p.solid ?? 0) + 1 };
      // some side of the place is free to stand on
      const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => ({ x: p.x + a * ((p.solid ?? 0) + 1.2), z: p.z + b * ((p.solid ?? 0) + 1.2) }));
      expect(sides.some((s) => !insideAny(s, P.radius, cols)), p.id).toBe(true);
      expect(nearestPlace(free)?.id).toBe(p.id);
    }
  });
});

describe("movement", () => {
  const start = { x: 0, z: 9 };
  it("moves forward along -z at yaw 0", () => {
    const r = movePlayer(start, { forward: 1, right: 0 }, 0, 4, 1, P.radius, cols);
    expect(r.pos.z).toBeCloseTo(5);
    expect(r.pos.x).toBeCloseTo(0);
  });
  it("moves right along +x at yaw 0", () => {
    expect(movePlayer(start, { forward: 0, right: 1 }, 0, 4, 1, P.radius, cols).pos.x).toBeCloseTo(4);
  });
  it("does not go faster on diagonals", () => {
    const r = movePlayer(start, { forward: 1, right: 1 }, 0, 4, 1, P.radius, { circles: [], boxes: [] });
    expect(Math.hypot(r.pos.x - start.x, r.pos.z - start.z)).toBeCloseTo(4);
  });
  it("stays still with no input", () => {
    expect(movePlayer(start, { forward: 0, right: 0 }, 1, 4, 1, P.radius, cols).moving).toBe(false);
  });
  it("cannot leave the garden", () => {
    let pos = { x: 0, z: 0 };
    for (let i = 0; i < 400; i++) pos = movePlayer(pos, { forward: 1, right: 0.3 }, 0.7, 7, 0.1, P.radius, { circles: [], boxes: [] }).pos;
    expect(Math.abs(pos.x)).toBeLessThanOrEqual(GARDEN.size / 2 - P.radius + 1e-9);
    expect(Math.abs(pos.z)).toBeLessThanOrEqual(GARDEN.size / 2 - P.radius + 1e-9);
  });
  it("is stopped by solid objects", () => {
    const tree = { x: 0, z: 0, r: 1 };
    const c = { circles: [tree], boxes: [] };
    let pos = { x: 0, z: 5 };
    for (let i = 0; i < 100; i++) pos = movePlayer(pos, { forward: 1, right: 0 }, 0, 4, 0.1, 0.4, c).pos;
    expect(Math.hypot(pos.x - tree.x, pos.z - tree.z)).toBeGreaterThanOrEqual(1.4 - 1e-6);
  });
  it("pushes out of boxes, including from inside", () => {
    const c = { circles: [], boxes: [{ x: 0, z: 0, w: 4, d: 1 }] };
    const out = pushOut({ x: 0.2, z: 0.1 }, 0.4, c);
    expect(insideAny(out, 0.39, c)).toBe(false);
  });
  it("clamps to bounds", () => {
    expect(clampToBounds({ x: 99, z: -99 }, 0.5)).toEqual({ x: GARDEN.size / 2 - 0.5, z: -(GARDEN.size / 2 - 0.5) });
  });
});

describe("camera and interaction", () => {
  it("pulls in near scenery and otherwise keeps its distance", () => {
    const c = { circles: [{ x: 0, z: 3, r: 1 }], boxes: [] };
    expect(cameraDistance({ x: 0, z: 0 }, { x: 0, z: 1 }, 6, 1.5, c)).toBeLessThan(3);
    expect(cameraDistance({ x: 0, z: 0 }, { x: 0, z: -1 }, 6, 1.5, c)).toBe(6);
  });
  it("finds a place only when close enough", () => {
    const nest = GARDEN.places.find((p) => p.id === "nest")!;
    expect(nearestPlace({ x: nest.x + 1, z: nest.z })?.id).toBe("nest");
    expect(nearestPlace({ x: 0, z: 0 + 18 })).toBeNull();
  });
});

describe("Print wandering", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  it("stays in the garden, out of scenery, and moves around", () => {
    const rng = seeded(7);
    let w = newWander({ x: 0, z: -2 });
    const r = GARDEN.print.radius;
    let travelled = 0;
    for (let i = 0; i < 6000; i++) {
      const before = { x: w.x, z: w.z };
      w = stepWander(w, 0.1, rng, r, GARDEN.print.speed, cols);
      travelled += Math.hypot(w.x - before.x, w.z - before.z);
      expect(Math.abs(w.x)).toBeLessThanOrEqual(GARDEN.size / 2 - r + 1e-6);
      expect(Math.abs(w.z)).toBeLessThanOrEqual(GARDEN.size / 2 - r + 1e-6);
      expect(overlaps(w, r - 0.05)).toBe(false);
    }
    expect(travelled).toBeGreaterThan(50);
  });
});
