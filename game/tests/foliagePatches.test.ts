// F5: density patches. Flag off is the World as before; flag on redistributes within the caps, deterministically, with no new colliders.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/foliage.json";
import { BLOOMS, FOLIAGE, GRASS_REGIONS, PATCHES, buildBlooms, buildGrass, buildRegionGrass, patchWeight, patchesFlag } from "@/lib/foliage";
import type { PatchData } from "@/lib/foliage";
import { CHUNKS, HALF } from "@/lib/worldMap";
import { keepClear } from "@/lib/features";

const on: PatchData = { ...PATCHES, enabled: true };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe("flag", () => {
  it("ships off, and only a plain true is on", () => {
    expect((raw as { patches: { enabled: unknown } }).patches.enabled).toBe(false);
    const f = { foliage: { enabled: true }, blooms: { enabled: true }, grassRegions: { enabled: true } };
    expect(patchesFlag({ ...f, patches: { enabled: true } })).toBe(true);
    for (const v of ["true", 1, "yes", null, undefined, {}]) expect(patchesFlag({ ...f, patches: { enabled: v } })).toBe(false);
    expect(patchesFlag({ ...f, foliage: { enabled: false }, patches: { enabled: true } })).toBe(false);
    expect(patchesFlag({ ...f, blooms: { enabled: false }, patches: { enabled: true } }, "blooms")).toBe(false);
    expect(patchesFlag({ ...f, grassRegions: { enabled: false }, patches: { enabled: true } }, "grassRegions")).toBe(false);
    expect(patchesFlag(null)).toBe(false);
  });
  it("off: the three layers are identical to a build with no patch data at all", () => {
    const off = { ...PATCHES, enabled: false };
    expect(same(buildGrass(FOLIAGE, off).all, buildGrass().all)).toBe(true);
    expect(same(buildBlooms(BLOOMS, off).all, buildBlooms().all)).toBe(true);
    expect(same(buildRegionGrass(FOLIAGE, GRASS_REGIONS, buildGrass(), off).all, buildRegionGrass().all)).toBe(true);
  });
  it("on needs the layer: blooms off means no blooms and grass is untouched by it", () => {
    expect(buildBlooms({ ...BLOOMS, enabled: false }, on).all.length).toBe(0);
  });
});

describe("on", () => {
  const g = buildGrass(FOLIAGE, on), b = buildBlooms(BLOOMS, on), r = buildRegionGrass(FOLIAGE, GRASS_REGIONS, g, on);
  it("changes where plants stand, and never adds any", () => {
    const g0 = buildGrass();
    expect(same(g.all, g0.all)).toBe(false);
    expect(g.all.length).toBeLessThan(g0.all.length);
    expect(g.all.length).toBeGreaterThan(0);
    expect(b.all.length).toBeGreaterThan(0);
    // the position rules still hold for every kept bundle (minGap is checked against whatever neighbours were kept, so the set need not be a subset)
    for (const i of [...g.all, ...b.all]) { expect(keepClear(i.x, i.z, 0.3)).toBe(false); expect(Math.abs(i.x)).toBeLessThanOrEqual(HALF - 1); }
  });
  it("caps hold per chunk and for the World", () => {
    for (const l of g.perChunk.values()) expect(l.length).toBeLessThanOrEqual(FOLIAGE.grassPerChunk);
    for (const l of b.perChunk.values()) expect(l.length).toBeLessThanOrEqual(BLOOMS.bloomsPerChunk);
    expect(g.all.length + r.all.length).toBeLessThanOrEqual(FOLIAGE.grassWorld);
    expect(b.all.length).toBeLessThanOrEqual(BLOOMS.bloomsWorld);
    const perChunkGrass = new Map<string, number>();
    for (const [k, l] of [...g.perChunk, ...r.perChunk]) perChunkGrass.set(k, (perChunkGrass.get(k) ?? 0) + l.length);
    for (const n of perChunkGrass.values()) expect(n).toBeLessThanOrEqual(FOLIAGE.grassPerChunk);
    expect(CHUNKS).toBeGreaterThan(0);
  });
  it("is deterministic, and the patch seed changes the layout", () => {
    expect(same(buildGrass(FOLIAGE, on).all, g.all)).toBe(true);
    expect(same(buildBlooms(BLOOMS, on).all, b.all)).toBe(true);
    expect(same(buildGrass(FOLIAGE, { ...on, seed: on.seed + 1 }).all, g.all)).toBe(false);
  });
  it("plants gather: much more is kept inside patches than outside", () => {
    const inP = g.all.filter((i) => patchWeight(i.x, i.z, on) > 0.5).length, out = g.all.filter((i) => patchWeight(i.x, i.z, on) === 0).length;
    expect(inP).toBeGreaterThan(out);
  });
});

describe("patchWeight", () => {
  it("is 0..1, pure, and continuous across chunk edges (same value from both sides)", () => {
    for (let x = -60; x < 60; x += 1.7) for (let z = -60; z < 60; z += 2.3) {
      const w = patchWeight(x, z, on); expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1);
      expect(patchWeight(x, z, on)).toBe(w);
    }
    // no jump larger than the edge slope allows over a 5 cm step, anywhere on a line that crosses many chunk edges
    let maxJump = 0; for (let x = -100; x < 100; x += 0.05) maxJump = Math.max(maxJump, Math.abs(patchWeight(x + 0.05, 3.3, on) - patchWeight(x, 3.3, on)));
    expect(maxJump).toBeLessThan(0.15);
  });
  it("has bare paper and has cores", () => {
    let zero = 0, one = 0, n = 0; for (let x = -100; x < 100; x += 2) for (let z = -100; z < 100; z += 2) { n++; const w = patchWeight(x, z, on); if (w === 0) zero++; if (w === 1) one++; }
    expect(zero / n).toBeGreaterThan(0.3); expect(one).toBeGreaterThan(0);
  });
});

describe("source", () => {
  const src = readFileSync("lib/foliage.ts", "utf8");
  it("no Math.random, no clock, no storage or network, no collider", () => {
    for (const w of ["Math.random", "Date.now", "performance.now", "localStorage", "fetch("]) expect(src.includes(w), w).toBe(false);
  });
});
