// H3: camera never under the ground; flag off keeps today's camera heights. Pure, no WebGL.
import { describe, expect, it } from "vitest";
import { GARDEN } from "@/lib/world";
import { cameraHeights } from "@/lib/follow";
import { GROUND, groundOn, groundY } from "@/lib/ground";
import { cameraOnGround, keepAbove, shadowLift, smoothPivot } from "@/lib/groundCamera";
import { HALF } from "@/lib/worldMap";

// A seeded generator so the "random" targets are the same on every run.
const rng = (s: number) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const big = (x: number, z: number) => groundY(x, z, { scale: 1 }); // full-size rises: a harder case than the shipped scale

describe("H3 camera on rises", () => {
  it("random targets, directions and pitches: the camera is never below groundY at its own spot (shipped and full-size rises)", () => {
    const r = rng(7), c = GARDEN.camera;
    for (const gy of [groundY, big]) for (let i = 0; i < 4000; i++) {
      const x = (r() * 2 - 1) * (HALF - 2), z = (r() * 2 - 1) * (HALF - 2), a = r() * Math.PI * 2, pitch = c.minPitch + r() * (c.maxPitch - c.minPitch);
      const s = cameraOnGround(x, z, { x: Math.sin(a), z: Math.cos(a) }, pitch, c.distance, gy(x, z), gy);
      expect(s.y).toBeGreaterThanOrEqual(gy(s.x, s.z) + c.minHeight - 1e-9);
      expect(s.dist).toBeGreaterThanOrEqual(c.minDistance - 1e-9); expect(s.dist).toBeLessThanOrEqual(c.distance);
      expect(Number.isFinite(s.y) && Number.isFinite(s.look)).toBe(true);
    }
  });
  it("the smoothed camera is held above the land too", () => {
    expect(keepAbove(-75, 0, 10, big)).toBeGreaterThanOrEqual(big(-75, 10) + GARDEN.camera.minHeight);
    expect(keepAbove(0, 5, 0, groundY)).toBe(5);
  });
  it("on flat ground it is exactly today's camera (same heights, full distance)", () => {
    const c = GARDEN.camera;
    for (const p of [-0.5, 0.1, 0.45, 1.2]) {
      const s = cameraOnGround(0, 0, { x: 0, z: 1 }, p, c.distance, 0, () => 0), h = cameraHeights(0, p, c.distance);
      expect(s.y).toBeCloseTo(h.cam, 9); expect(s.look).toBeCloseTo(h.look, 9); expect(s.dist).toBe(c.distance);
    }
  });
  it("production: the data file decides (on), ?ground= is inert; the flat formulas still hold with the switch forced off", () => {
    expect(GROUND.enabled).toBe(true);
    expect(groundOn("", true)).toBe(true);
    expect(groundOn("?ground=0", true)).toBe(true);
        for (const p of [0.1, 0.45, 1.2]) { const h = cameraHeights(0, p, 6); expect(h.cam).toBeCloseTo(GARDEN.camera.height + Math.sin(p) * 6); expect(h.look).toBeCloseTo(GARDEN.camera.height * 0.7); }
  });
  it("pull-in shortens the distance when a rise is behind the player", () => {
    const rise = (x: number, z: number) => (z > 3 ? 4 : 0); // a wall of land 3 m behind
    const s = cameraOnGround(0, 0, { x: 0, z: 1 }, 0.1, 6, 0, rise);
    expect(s.dist).toBeLessThan(6); expect(s.y).toBeGreaterThanOrEqual(rise(s.x, s.z) + GARDEN.camera.minHeight);
  });
  it("pivot smoothing moves toward the target, never overshoots, and holds at dt 0", () => {
    expect(smoothPivot(0, 1, 0)).toBe(0);
    let v = 0; for (let i = 0; i < 20; i++) { const n = smoothPivot(v, 1, 1 / 60); expect(n).toBeGreaterThan(v); expect(n).toBeLessThan(1); v = n; }
    expect(smoothPivot(0, 1, 5)).toBeGreaterThan(0.99);
  });
  it("shadow lift is 0 on flat ground and capped on slopes", () => {
    expect(shadowLift(() => 0, 3, 3)).toBe(0);
    expect(shadowLift((x) => x * 5, 0, 0)).toBe(0.1);
    for (const [x, z] of [[-75, 10], [30, -100]]) { const v = shadowLift(groundY, x, z); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.1); }
  });
});
