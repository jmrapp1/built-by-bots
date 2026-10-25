// Ink on the land: the switch, the reference maths, and that off leaves the ground material untouched.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import raw from "@/data/groundInk.json";
import { INK, contour, distFade, groundInkFlag, groundInkOn, hatch, homeEase, inkAmount, paper, regionInk, shade, shadedSide, steepness } from "@/lib/groundInk";
import { HOME_FLAT, flatDistance, flatMask, groundY } from "@/lib/ground";
import { buildWorldShell } from "@/components/worldShell";
import { inkGlsl } from "@/components/groundInkShader";
import { regionWeights } from "@/lib/regionFog";
import { HALF, regionAt } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const groundMesh = (scene: THREE.Scene) => { let m: THREE.Mesh | null = null; scene.traverse((o) => { const x = o as THREE.Mesh; if (!m && x.isMesh && x.geometry.attributes.color && x.geometry.attributes.position.count > 10000) m = x; }); return m as unknown as THREE.Mesh; };

describe("the switch", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.groundInk.enabled).toBe(true); expect(groundInkOn("", true)).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(groundInkFlag({ groundInk: { enabled: v } })).toBe(false);
    expect(groundInkFlag(null)).toBe(false); expect(groundInkFlag(undefined)).toBe(false);
  });
  it("?groundink= overrides in dev only", () => {
    const on = { groundInk: { enabled: true } }, off = { groundInk: { enabled: false } };
    expect(groundInkOn("?groundink=0", false, on)).toBe(false); expect(groundInkOn("?groundink=1", false, off)).toBe(true);
    expect(groundInkOn("?groundink=0", true, on)).toBe(true); expect(groundInkOn("?groundink=1", true, off)).toBe(false);
  });
  it("World passes the switch with the production flag", () => {
    const w = src("../components/World.tsx");
    expect(w).toContain('groundInkOn(window.location.search, process.env.NODE_ENV === "production")'); expect(w).toContain("groundInk: inkOn");
  });
  it("does not touch the ground, fog or features switches", async () => {
    const g = await import("@/data/ground.json"), r = await import("@/data/regionFog.json"), f = await import("@/data/features.json");
    expect(g.default.ground.enabled).toBe(true); expect(r.default.regionFog.enabled).toBe(false); expect(f.default.features.enabled).toBe(false);
  });
});

describe("off equals today", () => {
  const ground = (ink: boolean) => { const scene = new THREE.Scene(); buildWorldShell(scene, { ground: true, groundInk: ink }); return groundMesh(scene); };
  it("off: no patch, no extra attributes, the same colours", () => {
    const off = ground(false), plain = ground(false);
    expect((off.material as THREE.Material).onBeforeCompile.toString()).toBe(new THREE.MeshToonMaterial().onBeforeCompile.toString());
    expect(off.geometry.attributes.inkRegion).toBeUndefined(); expect(off.geometry.attributes.inkHome).toBeUndefined();
    expect(Array.from((off.geometry.attributes.color as THREE.BufferAttribute).array)).toEqual(Array.from((plain.geometry.attributes.color as THREE.BufferAttribute).array));
  });
  it("on: the same colours and heights, plus the two per-vertex floats and a patched material", () => {
    const off = ground(false), on = ground(true);
    expect(Array.from((on.geometry.attributes.color as THREE.BufferAttribute).array)).toEqual(Array.from((off.geometry.attributes.color as THREE.BufferAttribute).array));
    expect(Array.from((on.geometry.attributes.position as THREE.BufferAttribute).array)).toEqual(Array.from((off.geometry.attributes.position as THREE.BufferAttribute).array));
    const reg = on.geometry.attributes.inkRegion as THREE.BufferAttribute, home = on.geometry.attributes.inkHome as THREE.BufferAttribute;
    expect(reg.count).toBe(on.geometry.attributes.position.count);
    for (let i = 0; i < reg.count; i += 97) { expect(Number.isFinite(reg.getX(i))).toBe(true); expect(home.getX(i)).toBeGreaterThanOrEqual(0); expect(home.getX(i)).toBeLessThanOrEqual(1); }
    expect(String((on.material as THREE.Material).customProgramCacheKey())).toContain("groundInk");
  });
  it("the patch only reaches the ground material, and the GLSL has no stray placeholders", () => {
    const { header, body } = inkGlsl(INK);
    for (const t of [header, body]) { expect(t).not.toMatch(/NaN|undefined|Infinity/); expect(t).not.toMatch(/\d e[+-]?\d/); }
    expect(src("../components/worldShell.ts").match(/applyInk\(/g)?.length).toBe(1);
  });
});

describe("reference maths", () => {
  it("contours: none below the minimum height or in any flat zone; some on a real hill", () => {
    expect(contour(0, 0.01)).toBe(0); expect(contour(INK.contour.minHeight, 0.01)).toBe(0);
    let flatHit = 0, hillHit = 0;
    for (let x = -HALF; x < HALF; x += 3) for (let z = -HALF; z < HALF; z += 3) {
      const h = groundY(x, z), c = contour(h, 0.02);
      if (flatDistance(x, z) <= 0 && c > 0) flatHit++;
      if (c > 0.5) hillHit++;
    }
    expect(flatHit).toBe(0); expect(hillHit).toBeGreaterThan(20);
  });
  it("a contour line sits on each multiple of the step and fades when too fine for the pixel", () => {
    const s = INK.contour.step;
    expect(contour(s * 2, 0.02)).toBeGreaterThan(0.9); expect(contour(s * 2.5, 0.02)).toBe(0);
    expect(contour(s * 2, 0.6)).toBe(0); expect(contour(s * 2, 0.5)).toBe(0);
  });
  it("hatch: zero on flat, rising with steepness, only on the shaded side", () => {
    const [lx, lz] = INK.light, l = Math.hypot(lx, lz), away = [-lx / l, -lz / l], toward = [lx / l, lz / l];
    const upOf = (slope: number) => 1 / Math.sqrt(1 + slope * slope);
    let best = (up: number, n: number[]) => { let m = 0; for (let i = 0; i < 400; i++) m = Math.max(m, hatch(i * 0.05, 3.1, up, n[0], n[1], 0.05)); return m; };
    expect(best(1, away)).toBe(0);
    expect(best(upOf(0.06), away)).toBeLessThan(best(upOf(0.15), away) + 1e-9); expect(best(upOf(0.06), away)).toBeGreaterThan(0); expect(best(upOf(0.15), away)).toBeGreaterThan(0.5);
    expect(best(upOf(0.2), toward)).toBe(0); expect(shadedSide(away[0], away[1])).toBeCloseTo(1, 9); expect(shadedSide(toward[0], toward[1])).toBe(0); expect(shadedSide(0, 0)).toBe(0);
    expect(steepness(1)).toBe(0); expect(steepness(upOf(0.2))).toBeGreaterThan(0.99); expect(steepness(upOf(0.1))).toBeGreaterThan(steepness(upOf(0.05)));
  });
  it("fade: 1 near, 0 at and past the far distance, far before the fog's far edge, monotone", () => {
    expect(distFade(0)).toBe(1); expect(distFade(INK.fade.near)).toBe(1); expect(distFade(INK.fade.far)).toBe(0); expect(distFade(1e6)).toBe(0); expect(distFade(NaN)).toBe(1);
    expect(INK.fade.far).toBeLessThan(220); expect(INK.fade.near).toBeLessThan(INK.fade.far);
    let prev = 1; for (let d = 0; d <= 150; d += 5) { const f = distFade(d); expect(f).toBeLessThanOrEqual(prev + 1e-12); prev = f; }
    const p = { x: -75, z: 10, h: INK.contour.step * 3, up: 0.97, nx: -1, nz: 0, pxH: 0.02, pxX: 0.02 };
    expect(inkAmount({ ...p, dist: 5 })).toBeGreaterThan(0); expect(inkAmount({ ...p, dist: INK.fade.far })).toBe(0);
  });
  it("region strength matches the table and blends like the ground colour", () => {
    const at: [string, number, number][] = [["meadow", 0, -20], ["inkwood", -80, -100], ["paper_downs", 80, -100], ["glyph_quarter", 0, 110], ["pressmark_shore", 110, 0]];
    for (const [r, x, z] of at) { expect(regionAt(z, x)).toBe(r); expect(regionInk(x, z)).toBeCloseTo((INK.regions as Record<string, number>)[r], 6); }
    for (let x = -HALF; x <= HALF; x += 9) for (let z = -HALF; z <= HALF; z += 9) {
      const w = regionWeights(x, z), sum = Object.values(w).reduce((a, b) => a + b, 0); expect(sum).toBeCloseTo(1, 9);
      const v = regionInk(x, z); expect(v).toBeGreaterThanOrEqual(Math.min(...Object.values(INK.regions)) - 1e-9); expect(v).toBeLessThanOrEqual(Math.max(...Object.values(INK.regions)) + 1e-9);
    }
    expect(INK.regions.paper_downs).toBe(Math.max(...Object.values(INK.regions)));
  });
  it("grain eases to 0 inside Home and is small and finite everywhere", () => {
    expect(homeEase(0, 0)).toBeCloseTo(0, 12); expect(homeEase(HOME_FLAT, 0)).toBeCloseTo(0, 12); expect(homeEase(HOME_FLAT + INK.homeEase, 0)).toBe(1);
    for (let x = -HALF; x <= HALF; x += 4) for (let z = -HALF; z <= HALF; z += 4) {
      const v = paper(x, z, 20); expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v)).toBeLessThanOrEqual(INK.grain.amount + INK.wash.amount + 1e-9);
      if (Math.max(Math.abs(x), Math.abs(z)) <= HOME_FLAT) expect(v).toBeCloseTo(0, 12);
    }
  });
  it("shade: darker on a shaded slope than a lit one; all values finite for bad input", () => {
    const [lx, lz] = INK.light, l = Math.hypot(lx, lz);
    expect(shade(1, 0.97, -lx / l, -lz / l)).toBeLessThan(shade(1, 0.97, lx / l, lz / l));
    for (const bad of [NaN, Infinity, -Infinity]) { expect(Number.isFinite(shade(bad, bad, bad, bad))).toBe(true); expect(Number.isFinite(paper(bad, bad, bad))).toBe(true); expect(Number.isFinite(contour(bad, bad))).toBe(true); expect(Number.isFinite(inkAmount({ x: bad, z: bad, h: bad, up: bad, nx: bad, nz: bad, dist: bad, pxH: bad, pxX: bad }))).toBe(true); }
  });
  it("flatMask is the ground's own rule: 0 in every flat zone, 1 deep in open land", () => {
    expect(flatMask(0, 0)).toBe(0); let top = 0; for (let x = -HALF; x < HALF; x += 4) for (let z = -HALF; z < HALF; z += 4) top = Math.max(top, flatMask(x, z)); expect(top).toBeGreaterThan(0.99); expect(flatMask(HALF, 0)).toBe(0);
  });
});
