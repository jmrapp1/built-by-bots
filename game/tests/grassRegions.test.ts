// F3: grass in the other regions. Own switch (a sub-flag), own seed, caps that hold for all grass together, a colour per region, no collider.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import raw from "@/data/foliage.json";
import { FOLIAGE, GRASS_R, GRASS_REGIONS, buildGrass, buildRegionGrass, grassInChunk, grassRegionsFlag, regionGrassInChunk, shippedGrass, shippedRegionGrass, type FoliageData, type RegionGrassData } from "@/lib/foliage";
import { buildWorldShell, grassGeo } from "@/components/worldShell";
import { CHUNKS, WORLD, chunkCircles, chunkContents, chunkOf, regionAt } from "@/lib/worldMap";
import { buildHedges, hedgeTouches, keepClear } from "@/lib/features";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const R = GRASS_REGIONS, offR: RegionGrassData = { ...R, enabled: false };

describe("the sub-flag", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.grassRegions.enabled).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(grassRegionsFlag({ foliage: { enabled: true }, grassRegions: { enabled: v } })).toBe(false);
    expect(grassRegionsFlag(null)).toBe(false); expect(grassRegionsFlag({})).toBe(false);
  });
  it("needs the grass switch as well: with grass off there is none", () => {
    expect(grassRegionsFlag({ foliage: { enabled: false }, grassRegions: { enabled: true } })).toBe(false);
    expect(buildRegionGrass({ ...FOLIAGE, enabled: false } as FoliageData).all.length).toBe(0);
  });
  it("off gives nothing, so the World is the slice 1 and 2 result", () => {
    expect(buildRegionGrass(FOLIAGE, offR).all.length).toBe(0);
    expect(buildRegionGrass(FOLIAGE, R).all.length).toBeGreaterThan(50);
  });
  it("the Meadow grass is untouched by it, on or off", () => {
    const a = sha(buildGrass().all); buildRegionGrass(FOLIAGE, R); buildRegionGrass(FOLIAGE, offR);
    expect(sha(buildGrass().all)).toBe(a);
    for (const t of shippedGrass().all) expect(regionAt(t.z, t.x)).toBe("meadow");
  });
  it("adds nothing to the chunk contents", () => {
    const all = () => { const o: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) o.push(chunkContents(a, b)); return o; };
    const before = sha(all()); buildRegionGrass(); buildRegionGrass(FOLIAGE, offR);
    expect(sha(all())).toBe(before);
  });
});

describe("the scatter", () => {
  const g = shippedRegionGrass();
  it("is deterministic and independent of the order chunks are asked in", () => {
    expect(sha(buildRegionGrass().all)).toBe(sha(g.all));
    const fwd: unknown[] = [], rev: unknown[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) fwd.push(regionGrassInChunk(a, b, g));
    for (let a = CHUNKS - 1; a >= 0; a--) for (let b = CHUNKS - 1; b >= 0; b--) rev.unshift(regionGrassInChunk(a, b, g));
    expect(sha(rev)).toBe(sha(fwd));
  });
  it("sits only in the other regions with density, and inside the World", () => {
    expect(new Set(g.all.map((t) => regionAt(t.z, t.x)))).toEqual(new Set(["inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"]));
    for (const t of g.all) { expect(R.density[regionAt(t.z, t.x)]).toBeGreaterThan(0); expect(Math.abs(t.x)).toBeLessThan(WORLD.size / 2); expect(Math.abs(t.z)).toBeLessThan(WORLD.size / 2); }
    expect(R.density.meadow).toBe(0);
  });
  it("the Glyph Quarter is sparse", () => {
    for (const r of ["inkwood", "paper_downs", "pressmark_shore"] as const) expect(R.density.glyph_quarter).toBeLessThan(R.density[r]);
  });
  it("all the grass together stays under the grass caps (not raised), in the World and in every chunk", () => {
    expect(FOLIAGE.grassWorld).toBe(5000); expect(FOLIAGE.grassPerChunk).toBe(420);
    expect(shippedGrass().all.length + g.all.length).toBeLessThanOrEqual(FOLIAGE.grassWorld);
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) expect(grassInChunk(a, b).length + regionGrassInChunk(a, b, g).length).toBeLessThanOrEqual(FOLIAGE.grassPerChunk);
  });
  it("holds the caps when they are squeezed", () => {
    const tight = { ...FOLIAGE, grassWorld: shippedGrass().all.length + 50 };
    expect(buildRegionGrass(tight).all.length).toBeLessThanOrEqual(50);
    expect(buildRegionGrass({ ...FOLIAGE, grassWorld: shippedGrass().all.length }).all.length).toBe(0);
  });
  it("holds the per-chunk cap when it is squeezed: Meadow grass plus region grass never passes it", () => {
    let maxBase = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) maxBase = Math.max(maxBase, grassInChunk(a, b).length);
    const tight = buildRegionGrass({ ...FOLIAGE, grassPerChunk: maxBase + 4 });
    expect(tight.all.length).toBeGreaterThan(0);
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) expect(grassInChunk(a, b).length + regionGrassInChunk(a, b, tight).length).toBeLessThanOrEqual(maxBase + 4);
    for (const l of tight.perChunk.values()) expect(l.length).toBeLessThanOrEqual(4);
  });
  it("keeps off the path, garden, landmarks, hedges and every solid, and is listed under its own chunk", () => {
    const hp = buildHedges(), sol: { x: number; z: number; r: number }[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) sol.push(...chunkCircles(chunkContents(a, b)));
    for (const t of g.all) {
      expect(keepClear(t.x, t.z, 0)).toBe(false); expect(hedgeTouches(t.x, t.z, GRASS_R, hp, 0)).toBe(false);
      expect(sol.some((c) => Math.abs(c.x - t.x) < 8 && Math.abs(c.z - t.z) < 8 && Math.hypot(c.x - t.x, c.z - t.z) < c.r + GRASS_R * 0.9)).toBe(false);
    }
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) for (const t of regionGrassInChunk(a, b, g)) { expect(chunkOf(t.x)).toBe(a); expect(chunkOf(t.z)).toBe(b); }
  });
});

describe("the tint", () => {
  const regions = ["inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"] as const;
  it("every region with grass has its own root and tip colour, all different, and none is the Meadow's", () => {
    const seen = new Set<string>();
    for (const r of regions) { const t = R.tint[r]!; expect(t).toBeDefined(); expect(t.root).toMatch(/^#[0-9a-f]{6}$/i); expect(t.tip).toMatch(/^#[0-9a-f]{6}$/i); seen.add(t.root + t.tip); }
    expect(seen.size).toBe(4); expect(seen.has("#4f7a3f#a9c86a")).toBe(false);
  });
  it("the bundle keeps its shape and takes only its colours from the tint", () => {
    const base = grassGeo(), t = R.tint.paper_downs!, g2 = grassGeo(t.root, t.tip);
    expect(Array.from(g2.getAttribute("position").array)).toEqual(Array.from(base.getAttribute("position").array));
    expect(Array.from(g2.getAttribute("color").array)).not.toEqual(Array.from(base.getAttribute("color").array));
    expect(sha(Array.from(grassGeo().getAttribute("color").array))).toBe(sha(Array.from(grassGeo("#4f7a3f", "#a9c86a").getAttribute("color").array)));
    const c = g2.getAttribute("color"), p = g2.getAttribute("position"), root = new THREE.Color(t.root), tip = new THREE.Color(t.tip);
    for (let i = 0; i < p.count; i++) if (p.getY(i) === 0) { expect(c.getX(i)).toBeCloseTo(root.r, 5); expect(c.getZ(i)).toBeCloseTo(root.b, 5); }
    let top = 0, at = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) > top) { top = p.getY(i); at = i; }
    expect(c.getX(at)).toBeCloseTo(tip.r, 5);
  });
  it("in the shell, a region's grass is drawn with its tinted shape (more than one colour set is in the scene)", () => {
    const scene = new THREE.Scene(), shell = buildWorldShell(scene, { ground: true, features: true }); shell.update(-75, 10, true);
    const sets = new Set<string>(); scene.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh && im.geometry.getAttribute("position").count === grassGeo().getAttribute("position").count) sets.add(sha(Array.from(im.geometry.getAttribute("color").array))); });
    expect(sets.size).toBeGreaterThanOrEqual(1); shell.dispose();
    const far = new THREE.Scene(), s2 = buildWorldShell(far, { ground: true, features: true }); s2.update(-75, 10, true); s2.update(60, -150, true);
    const sets2 = new Set<string>(); far.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh && im.geometry.getAttribute("position").count === grassGeo().getAttribute("position").count) sets2.add(sha(Array.from(im.geometry.getAttribute("color").array))); });
    expect(sets2.size).toBeGreaterThanOrEqual(2); s2.dispose();
  });
});

describe("the list is hash-pinned and the code is quiet", () => {
  it("pins the region grass list", () => { expect(shippedRegionGrass().all.length).toBeGreaterThan(0); expect(sha(shippedRegionGrass().all)).toBe("2de3e0930bc2efa5cd2e04efbadc5466609ad78ca3618fe5d350773055811644"); });
  it("no randomness, clock, network or storage in lib/foliage.ts", () => {
    const s = readFileSync("lib/foliage.ts", "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(s).not.toMatch(/Math\.random|Date\.now|new Date|fetch\(|localStorage|sessionStorage|XMLHttpRequest|https?:\/\//);
  });
});
