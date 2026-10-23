import { describe, expect, it } from "vitest";
import { GARDEN } from "@/lib/world";
import { CLOUDS } from "@/lib/sky";
import { cameraHeights, clampPitch } from "@/lib/follow";

describe("look-up camera", () => {
  it("limits come from data; min is below the horizon-level, default sits inside", () => {
    const c = GARDEN.camera;
    expect(c.minPitch).toBeLessThan(0); expect(c.minPitch).toBeGreaterThanOrEqual(-0.6);
    expect(c.maxPitch).toBeGreaterThan(c.pitch); expect(c.pitch).toBeGreaterThan(c.minPitch);
    expect(c.pitch).toBe(0.45);
    expect(clampPitch(-5)).toBe(c.minPitch); expect(clampPitch(5)).toBe(c.maxPitch); expect(clampPitch(0.45)).toBe(0.45);
  });
  it("camera y never below ground + minHeight, and still looks up when pitch is negative", () => {
    for (const ground of [0, 0.3, 2]) for (let p = GARDEN.camera.minPitch; p <= GARDEN.camera.maxPitch; p += 0.05) for (const d of [GARDEN.camera.minDistance, 3, GARDEN.camera.distance]) {
      const h = cameraHeights(ground, p, d);
      expect(h.cam).toBeGreaterThanOrEqual(ground + GARDEN.camera.minHeight - 1e-9);
    }
  });
  it("at the lowest pitch and full distance the view looks up well above the horizon", () => {
    const h = cameraHeights(0, GARDEN.camera.minPitch, GARDEN.camera.distance);
    const up = Math.atan2(h.look - h.cam, GARDEN.camera.distance * Math.cos(GARDEN.camera.minPitch));
    expect(up).toBeGreaterThan(0.35);
  });
  it("unchanged for the old pitch range", () => {
    for (const p of [0.1, 0.45, 1.2]) { const h = cameraHeights(0, p, 6); expect(h.cam).toBeCloseTo(GARDEN.camera.height + Math.sin(p) * 6); expect(h.look).toBeCloseTo(GARDEN.camera.height * 0.7); }
  });
  it("clouds reach the horizon and stay reachable by looking up", () => {
    expect(CLOUDS.minElevation).toBeLessThanOrEqual(0.08);
    expect(CLOUDS.maxElevation).toBeLessThanOrEqual(0.5);
    expect(CLOUDS.maxElevation).toBeGreaterThan(CLOUDS.minElevation);
  });
});
