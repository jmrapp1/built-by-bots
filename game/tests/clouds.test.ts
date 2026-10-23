import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLOUDS, SKY, cloudAlpha, cloudAt, cloudAzimuth, cloudColor, cloudDir, cloudHash, cloudPresence, cloudsEnabled, cloudsOverride } from "@/lib/sky";
import { WORLD } from "@/lib/worldMap";

const all = Array.from({ length: CLOUDS.count }, (_, i) => cloudAt(i));
const lum = (h: string) => (0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16)) / 255;

describe("paper clouds (S31d)", () => {
  it("six to ten clouds, calm count within it, all sitting inside the camera far plane", () => {
    expect(CLOUDS.count).toBeGreaterThanOrEqual(6); expect(CLOUDS.count).toBeLessThanOrEqual(10);
    expect(CLOUDS.calm).toBeGreaterThan(0); expect(CLOUDS.calm).toBeLessThan(CLOUDS.count);
    expect(CLOUDS.distance + CLOUDS.width[1]).toBeLessThan(WORLD.cameraFar);
  });
  it("hash and shapes are deterministic; shapes are irregular polygons", () => {
    for (let i = 0; i < 30; i++) expect(cloudHash(i)).toBe(cloudHash(i));
    expect(all).toEqual(Array.from({ length: CLOUDS.count }, (_, i) => cloudAt(i)));
    expect(new Set(all.map((c) => c.width.toFixed(3))).size).toBe(all.length);
    for (const c of all) {
      expect(c.poly).toHaveLength(CLOUDS.points);
      expect(new Set(c.poly.map(([x, y]) => Math.hypot(x / c.width, y / c.height).toFixed(3))).size).toBeGreaterThan(CLOUDS.points / 2);
      expect(c.width).toBeGreaterThanOrEqual(CLOUDS.width[0]); expect(c.width).toBeLessThanOrEqual(CLOUDS.width[1]);
      expect(c.y).toBeGreaterThanOrEqual(CLOUDS.minElevation); expect(c.y).toBeLessThanOrEqual(CLOUDS.maxElevation);
    }
  });
  it("drift is a pure function of time: same t same place, very slow, wraps round", () => {
    for (const c of all) {
      expect(cloudAzimuth(c, 123.4, false)).toBe(cloudAzimuth(c, 123.4, false));
      expect(c.speed).toBeGreaterThan(0); expect(c.speed).toBeLessThan(0.01); // under a full turn in ten minutes
      for (const t of [0, 1, 500, 86400, 1e7]) { const a = cloudAzimuth(c, t, false); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(Math.PI * 2); }
      expect(cloudAzimuth(c, 0, false)).not.toBe(cloudAzimuth(c, 600, false));
      const lap = (Math.PI * 2) / c.speed; expect(cloudAzimuth(c, lap, false)).toBeCloseTo(cloudAzimuth(c, 0, false), 6);
      const d = cloudDir(c, cloudAzimuth(c, 77, false)); expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    }
  });
  it("reduced motion stops the drift", () => {
    for (const c of all) for (const t of [0, 10, 5000, 1e6]) expect(cloudAzimuth(c, t, true)).toBe(cloudAzimuth(c, 0, true));
  });
  it("cream and thin by day, grey-violet at dusk, nearly invisible at night", () => {
    expect(cloudColor(12)).toBe(CLOUDS.day);
    expect(lum(cloudColor(21))).toBeLessThan(lum(cloudColor(12)));
    expect(cloudAlpha(12)).toBeCloseTo(CLOUDS.alpha, 9);
    expect(cloudAlpha(0)).toBeCloseTo(CLOUDS.alpha * CLOUDS.nightAlpha, 9);
    expect(cloudAlpha(0)).toBeLessThan(0.06);
    let prev = cloudAlpha(17); for (let h = 17.05; h <= 21; h += 0.05) { const v = cloudAlpha(h); expect(v).toBeLessThanOrEqual(prev + 1e-12); prev = v; }
  });
  it("weather: more clouds, heavier and greyer, never past maxAlpha", () => {
    expect(all.filter((_, i) => cloudPresence(i, 0) > 0)).toHaveLength(CLOUDS.calm);
    expect(all.filter((_, i) => cloudPresence(i, 1) > 0)).toHaveLength(CLOUDS.count);
    for (let w = 0; w < 1; w += 0.1) expect(cloudPresence(CLOUDS.count - 1, w + 0.1)).toBeGreaterThanOrEqual(cloudPresence(CLOUDS.count - 1, w) - 1e-12);
    expect(cloudAlpha(12, 1)).toBeGreaterThan(cloudAlpha(12, 0));
    expect(cloudColor(12, 1)).not.toBe(cloudColor(12, 0));
    for (let h = 0; h < 24; h += 0.25) for (const w of [0, 0.5, 1, 5]) expect(cloudAlpha(h, w)).toBeLessThanOrEqual(CLOUDS.maxAlpha);
    expect(cloudPresence(0, -3)).toBe(1);
  });
  it("kill switches: count 0 and ?clouds=off (dev only)", () => {
    expect(cloudsOverride("?clouds=off", false)).toBe("off");
    expect(cloudsOverride("?clouds=off", true)).toBeNull();
    expect(cloudsEnabled("?clouds=off", false)).toBe(false);
    expect(cloudsEnabled("?clouds=off", true)).toBe(true);
    expect(SKY.clouds.count).toBeGreaterThan(0);
  });
  it("source: one instance of the cloud mesh, depth-tested transparent material, raycast off, no random, none in Margins or Home", () => {
    const src = readFileSync("components/skyScene.ts", "utf8"), lib = readFileSync("lib/sky.ts", "utf8"), w = readFileSync("components/World.tsx", "utf8");
    expect(src).not.toMatch(/Math\.random/); expect(lib).not.toMatch(/Math\.random/);
    const mats = src.match(/new THREE\.Mesh\w*Material\(\{[^}]*\}\)/g) ?? [];
    for (const m of mats) if (/transparent:\s*true/.test(m)) { expect(m).not.toMatch(/depthTest:\s*false/); expect(m).toMatch(/depthTest:\s*true/); expect(m).toMatch(/depthWrite:\s*false/); }
    expect(src).toMatch(/cloudMesh\.raycast = \(\) => \{\}/);
    expect(src).toMatch(/cloudMesh = new THREE\.Mesh\(g, m\)/);
    expect(w).toContain("clouds: !margins && cloudsOn");
    expect(w).toMatch(/cloudsEnabled\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
  });
});
