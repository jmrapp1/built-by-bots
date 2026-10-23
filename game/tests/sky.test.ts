import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import data from "@/data/sky.json";
import { KEYS } from "@/lib/daynight";
import { SKY, bodyLevel, domeColor, marginsZenith, moonDir, moonLevel, moonOffset, moonPhase, moonShade, skyEnabled, skyOverride, sunDir, sunLevel, zenithAt } from "@/lib/sky";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const files = ["lib/sky.ts", "components/skyScene.ts"].map((f) => [f, strip(readFileSync(f, "utf8"))] as const);
const hex = /^#[0-9a-f]{6}$/i;

describe("sky data (S31a)", () => {
  it("zenith keys mirror daynight.json hours, all colours are valid hex", () => {
    expect(data.zenith.map((z) => z.hour)).toEqual(KEYS.map((k) => k.hour));
    for (const z of data.zenith) expect(z.color).toMatch(hex);
    for (const c of [SKY.sun.disc, SKY.sun.ink, SKY.moon.disc, SKY.moon.ink, SKY.moon.shade]) expect(c).toMatch(hex);
  });
  it("eight moon phases, finite numbers, dome sits inside the camera far plane", () => {
    expect(SKY.phases).toHaveLength(8);
    for (const p of SKY.phases) expect(Number.isFinite(p.offset)).toBe(true);
    const world = JSON.parse(readFileSync("data/world.json", "utf8"));
    expect(SKY.dome.radius).toBeLessThan(world.cameraFar);
    expect(SKY.sun.distance + SKY.sun.radius + SKY.sun.rayGap + SKY.sun.rayLength).toBeLessThan(SKY.dome.radius);
  });
  it("is on, and ?sky=off turns it off in dev only", () => {
    expect(SKY.enabled).toBe(true);
    expect(skyOverride("?sky=off", true)).toBeNull();
    expect(skyOverride("?sky=off", false)).toBe("off");
    expect(skyOverride("?sky=x", false)).toBeNull();
    expect(skyEnabled("?sky=off", false)).toBe(false);
    expect(skyEnabled("", false)).toBe(true);
    expect(skyEnabled("?sky=off", true)).toBe(true);
  });
});

describe("sun and moon placement", () => {
  const hours = Array.from({ length: 96 }, (_, i) => i / 4);
  it("sun is high at midday, below the horizon at night, unit length", () => {
    expect(sunDir(12.75).y).toBeGreaterThan(0.6);
    expect(sunDir(0).y).toBeLessThan(0);
    expect(sunDir(23).y).toBeLessThan(0);
    for (const h of hours) { const d = sunDir(h); expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6); }
  });
  it("rises on the east side and sets on the west side", () => {
    expect(sunDir(7.5).x).toBeGreaterThan(0.5);
    expect(sunDir(18).x).toBeLessThan(-0.5);
  });
  it("moon is opposite the sun in height and never shown with the sun at noon", () => {
    for (const h of hours) expect(moonDir(h).y).toBeCloseTo(-sunDir(h).y, 9);
    expect(sunLevel(12)).toBe(1);
    expect(moonLevel(12)).toBe(0);
    expect(moonLevel(1)).toBe(1);
    expect(sunLevel(1)).toBe(0);
  });
  it("levels stay in 0..1 and move smoothly (no pop)", () => {
    let ps = sunLevel(0), pm = moonLevel(0);
    for (let h = 0.05; h <= 24; h += 0.05) {
      const s = sunLevel(h), m = moonLevel(h);
      expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1);
      expect(Math.abs(s - ps)).toBeLessThan(0.15); expect(Math.abs(m - pm)).toBeLessThan(0.15);
      ps = s; pm = m;
    }
    expect(bodyLevel(-1, 0, 0.1)).toBe(0);
    expect(bodyLevel(1, 0, 0.1)).toBe(1);
  });
  it("wraps past midnight and negative hours", () => {
    expect(sunDir(25).y).toBeCloseTo(sunDir(1).y, 9);
    expect(sunDir(-1).y).toBeCloseTo(sunDir(23).y, 9);
  });
});

describe("moon phase", () => {
  it("is deterministic for a date, 0..7, and walks through all eight", () => {
    expect(moonPhase("2026-10-23")).toBe(moonPhase("2026-10-23"));
    const seen = new Set<number>();
    for (let d = 20000; d < 20040; d++) { const p = moonPhase(d); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(8); seen.add(p); }
    expect(seen.size).toBe(8);
    expect(moonPhase("junk")).toBeGreaterThanOrEqual(0);
  });
  it("shade: whole disc at new, nothing at full, a lens in between, mirrored for waning", () => {
    expect(moonShade(moonOffset(0)).length).toBeGreaterThan(8);
    expect(moonShade(moonOffset(4))).toEqual([]);
    const wax = moonShade(moonOffset(1)), wan = moonShade(moonOffset(7));
    expect(wax.length).toBeGreaterThan(8);
    expect(Math.max(...wax.map((p) => p[0]))).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.min(...wan.map((p) => p[0]))).toBeGreaterThanOrEqual(-1 - 1e-9);
    for (const [x, y] of wax) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1 + 1e-9); // always inside the moon
  });
});

describe("sky colours", () => {
  it("zenith is valid hex at every hour and deeper than noon at night", () => {
    for (let h = 0; h < 24; h += 0.5) expect(zenithAt(h)).toMatch(hex);
    const lum = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
    expect(lum(zenithAt(0))).toBeLessThan(lum(zenithAt(12)));
  });
  it("gradient runs horizon to zenith, flat below the horizon", () => {
    expect(domeColor("#ffffff", "#000000", 0)).toBe("#ffffff");
    expect(domeColor("#ffffff", "#000000", 1)).toBe("#000000");
    expect(domeColor("#ffffff", "#000000", -0.5)).toBe("#ffffff");
    expect(marginsZenith("#ffffff", "#000000")).toMatch(hex);
  });
});

describe("sky source rules", () => {
  it("no randomness, network, storage or loaders; no raw primitives from the ratchet's list", () => {
    for (const [f, src] of files) {
      expect(src, f).not.toMatch(/Math\.random|fetch\(|localStorage|sessionStorage|XMLHttpRequest|GLTFLoader|TextureLoader|\.glb/);
      expect(src, f).not.toMatch(/new\s+(?:THREE\.)?(?:Sphere|Box|Cone|Cylinder)Geometry\b/);
    }
  });
  it("World wires the sky only into the garden and the Margins, never Home", () => {
    const w = readFileSync("components/World.tsx", "utf8");
    expect(w).toContain("showSky(true)");
    expect(w).toContain("showSky(false)");
    expect(w).not.toMatch(/enterHomeZone = \(\) => \{\s*showSky/);
    expect(w).toContain("dropSky()");
  });
});
