import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HILLS, hillColor, hillLayers, hillTop, hillsEnabled, hillsOverride } from "@/lib/sky";
import { HALF, WORLD } from "@/lib/worldMap";

const L = hillLayers();

describe("layered hills (S31c)", () => {
  it("three to four layers, nearest to farthest", () => {
    expect(L.length).toBeGreaterThanOrEqual(3); expect(L.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < L.length; i++) expect(L[i].radius).toBeGreaterThan(L[i - 1].radius);
  });
  it("the nearest layer lies beyond the walkable half-width plus a margin ", () => {
    expect(HALF).toBe(128);
    expect(L[0].radius).toBeGreaterThanOrEqual(HALF + HILLS.margin);
    expect(Math.min(...L.map((l) => l.radius))).toBeGreaterThan(HALF + HILLS.margin - 1e-9);
  });
  it("every layer stays inside the camera far plane, so it can be seen and cannot be clipped by the world", () => {
    for (const l of L) expect(l.radius + 5).toBeLessThan(WORLD.cameraFar);
  });
  it("tops are smooth, low and positive, and the ring closes", () => {
    for (const l of L) {
      let prev = hillTop(l, 0), lo = Infinity, hi = -Infinity;
      for (let i = 1; i <= 720; i++) { const h = hillTop(l, (i / 720) * Math.PI * 2); expect(Math.abs(h - prev)).toBeLessThan(0.6); prev = h; lo = Math.min(lo, h); hi = Math.max(hi, h); }
      expect(lo).toBeGreaterThan(0); expect(hi).toBeLessThan(25);
      expect(hillTop(l, 0)).toBeCloseTo(hillTop(l, Math.PI * 2), 9);
      for (const [f] of l.sines) { expect(Number.isInteger(f)).toBe(true); expect(f).toBeLessThanOrEqual(10); }
    }
  });
  it("nearer layers are darker and warmer, farther paler and bluer (by day)", () => {
    const c = L.map((l) => hillColor("#d9e2ea", l)).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    for (let i = 1; i < c.length; i++) {
      expect(c[i][0] + c[i][1] + c[i][2]).toBeGreaterThan(c[i - 1][0] + c[i - 1][1] + c[i - 1][2]);
      expect(c[i][2] - c[i][0]).toBeGreaterThan(c[i - 1][2] - c[i - 1][0]);
    }
  });
  it("colour follows the sky: night hills are dark, and mixing is pure", () => {
    const sum = (h: string) => [1, 3, 5].reduce((s, i) => s + parseInt(h.slice(i, i + 2), 16), 0);
    for (const l of L) { expect(sum(hillColor("#161a38", l))).toBeLessThan(sum(hillColor("#d9e2ea", l)) * 0.45); expect(hillColor("#d9e2ea", l)).toBe(hillColor("#d9e2ea", l)); }
  });
  it("kill switches: layers 0 and ?hills=off (dev only)", () => {
    expect(hillsOverride("?hills=off", false)).toBe("off");
    expect(hillsOverride("?hills=off", true)).toBeNull();
    expect(hillsEnabled("?hills=off", false)).toBe(false);
    expect(hillsEnabled("?hills=off", true)).toBe(true);
    expect(hillsEnabled("", true)).toBe(true);
  });
  it("source: opaque, never depth-test-off, no random, no network, ridges kept as fallback, no world data touched", () => {
    const src = readFileSync("components/hillsScene.ts", "utf8"), shell = readFileSync("components/worldShell.ts", "utf8"), lib = readFileSync("lib/sky.ts", "utf8");
    expect(src).not.toMatch(/transparent|depthTest|Math\.random|fetch\(|localStorage/);
    expect(lib).not.toMatch(/Math\.random/);
    expect(src).toMatch(/raycast = \(\) => \{\}/);
    expect(shell).toMatch(/jagged ridge rings/);
    expect(shell).toMatch(/k < \(hills \? 0 : 3\)/);
    expect(readFileSync("components/World.tsx", "utf8")).toMatch(/hillsEnabled\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
  });
  it("draw calls: one per layer, four at most", () => { expect(L.length).toBeLessThanOrEqual(4); });
});
