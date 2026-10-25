// E1: fog by region. Pure function tests, the off-equals-main pin, and the before/after sight numbers from the E0 tooling.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/regionFog.json";
import world from "@/data/world.json";
import { REGION_FOG, fogAt, regionFogFlag, regionFogOn, regionWeights } from "@/lib/regionFog";
import { EYES, createSightField, sightReport, worldColliders, worldOccluders } from "@/lib/sight";
import { HALF, regionAt } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const R = ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"] as const;

describe("the switch", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.regionFog.enabled).toBe(true);
    expect(regionFogFlag(raw)).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(regionFogFlag({ regionFog: { enabled: v } })).toBe(false);
    expect(regionFogFlag({ regionFog: { enabled: true } })).toBe(true);
    expect(regionFogFlag(null)).toBe(false);
    expect(regionFogFlag(undefined)).toBe(false);
  });
  it("?regionfog= overrides in dev only", () => {
    const on = { regionFog: { enabled: true } }, off = { regionFog: { enabled: false } };
    expect(regionFogOn("?regionfog=1", false, off)).toBe(true);
    expect(regionFogOn("?regionfog=0", false, on)).toBe(false);
    expect(regionFogOn("?regionfog=1", true, off)).toBe(false);
    expect(regionFogOn("?regionfog=0", true, on)).toBe(true);
    expect(regionFogOn("", false, off)).toBe(false);
    expect(regionFogOn("", false)).toBe(true); expect(regionFogOn("?other=1", true)).toBe(true); // the shipped file is on
  });
});

describe("off equals main", () => {
  it("with the switch off, every point gets today's global fog exactly", () => {
    for (let x = -HALF; x <= HALF; x += 8) for (let z = -HALF; z <= HALF; z += 8) expect(fogAt(x, z, false)).toEqual([world.fog[0], world.fog[1]]);
    expect(fogAt(Number.NaN, 0, true)).toEqual([world.fog[0], world.fog[1]]);
  });
  it("World.tsx touches the fog only behind the switch, only in the garden, and still sets the global pair on entry", () => {
    const w = src("../components/World.tsx");
    expect(w).toContain('regionFogOn(window.location.search, process.env.NODE_ENV === "production")');
    expect(w).toContain('if (regionFog && zones.is("garden"))');
    expect(w).toContain("new THREE.Fog(L0.fog, WORLD.fog[0], WORLD.fog[1])");
    expect(w).toContain("(scene.fog as THREE.Fog).near = WORLD.fog[0]; (scene.fog as THREE.Fog).far = WORLD.fog[1];");
    expect((w.match(/fogAt\(/g) ?? []).length).toBe(1);
  });
  it("world.json's own fog is unchanged", () => { expect(world.fog).toEqual([70, 220]); });
  it("the module is pure", () => {
    const s = src("../lib/regionFog.ts");
    for (const bad of ["Math.random", "Date.now", "localStorage", 'from "three"', "fetch("]) expect(s).not.toContain(bad);
  });
});

describe("fog by region", () => {
  it("every region's pair is sane and no longer than today's", () => {
    for (const r of R) { const [n, f] = REGION_FOG.regions[r]; expect(n).toBeGreaterThan(0); expect(f - n).toBeGreaterThanOrEqual(10); expect(f).toBeLessThanOrEqual(world.fog[1]); expect(f).toBeGreaterThanOrEqual(30); }
  });
  it("the weights sum to 1 and are never negative", () => {
    for (let x = -HALF; x <= HALF; x += 4) for (let z = -HALF; z <= HALF; z += 4) {
      const w = regionWeights(x, z); expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9); for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(-1e-12);
    }
  });
  it("deep in a region the pair is that region's own", () => {
    for (const [x, z] of [[-100, -110], [100, -110], [-100, 0], [100, 0], [0, 120]] as const) {
      const r = regionAt(z, x); expect(fogAt(x, z, true)).toEqual(REGION_FOG.regions[r]);
    }
  });
  it("is smooth: no more than 5 m of fog distance per metre walked, anywhere (the steepest is the Inkwood to Downs seam, 70 to 170 m over 28 m)", () => {
    let worst = 0;
    for (let z = -HALF; z <= HALF; z += 1) for (let x = -HALF; x < HALF; x += 1) {
      const a = fogAt(x, z, true), b = fogAt(x + 1, z, true), c = fogAt(x, z + 1, true);
      worst = Math.max(worst, Math.abs(a[1] - b[1]), Math.abs(a[1] - c[1]), Math.abs(a[0] - b[0]), Math.abs(a[0] - c[0]));
    }
    expect(worst).toBeLessThan(5);
  });
  it("always has far above near, far within today's, and the order of regions holds (the wood is the tightest)", () => {
    for (let x = -HALF; x <= HALF; x += 3) for (let z = -HALF; z <= HALF; z += 3) { const [n, f] = fogAt(x, z, true); expect(f - n).toBeGreaterThanOrEqual(10 - 1e-9); expect(f).toBeLessThanOrEqual(world.fog[1]); }
    expect(REGION_FOG.regions.inkwood[1]).toBeLessThan(REGION_FOG.regions.meadow[1]);
  });
  it("Home, the gate and the first stretch of path sit in the Meadow's fog", () => {
    expect(fogAt(0, 0, true)).toEqual(REGION_FOG.regions.meadow);
    expect(fogAt(17.5, -17.5, true)).toEqual(REGION_FOG.regions.meadow);
  });
});

describe("what it does to the sight numbers (E0 tooling)", () => {
  const occ = worldOccluders(), cols = worldColliders();
  const before = createSightField(occ), after = createSightField(occ, { farAt: (x, z) => fogAt(x, z, true)[1] });
  it("fog off in the tool is the E0 baseline exactly, and the fog on only ever shortens views", () => {
    const a = sightReport(before, EYES.person, 16, cols), same = sightReport(createSightField(occ, { farAt: (x, z) => fogAt(x, z, false)[1] }), EYES.person, 16, cols);
    expect(same).toEqual(a);
    const b = sightReport(after, EYES.person, 16, cols);
    for (let i = 0; i < a.regions.length; i++) { expect(b.regions[i].meanView).toBeLessThanOrEqual(a.regions[i].meanView); expect(b.regions[i].openShare).toBeLessThanOrEqual(a.regions[i].openShare); }
    expect(b.endToEnd.share).toBeLessThanOrEqual(a.endToEnd.share);
  });
  it("end to end, no pair is clear once the fog is on (the longest fog is 170 m, the pairs are 180 m and more)", () => {
    expect(sightReport(after, EYES.person, 16, cols).endToEnd.clear).toBe(0);
  });
});
