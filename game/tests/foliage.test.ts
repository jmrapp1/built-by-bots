// F1: the grass layer. Seeded and pure; own budget; no collider; off changes nothing; the bundle shape sits on the ground.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import raw from "@/data/foliage.json";
import { FOLIAGE, GRASS_R, buildGrass, foliageFlag, grassInChunk, shippedGrass, thin, type FoliageData } from "@/lib/foliage";
import { grassGeo } from "@/components/worldShell";
import { CHUNKS, WORLD, buildContents, chunkCircles, chunkContents, chunkOf, regionAt } from "@/lib/worldMap";
import { FEATURES, buildHedges, hedgeTouches, keepClear } from "@/lib/features";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const off: FoliageData = { ...FOLIAGE, enabled: false };
const allContents = () => { const o: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) o.push(buildContents(a, b, WORLD.seed, true)); return o; };

describe("the switch", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.foliage.enabled).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(foliageFlag({ foliage: { enabled: v } })).toBe(false);
    expect(foliageFlag(null)).toBe(false);
  });
  it("off builds no grass", () => { expect(buildGrass(off).all.length).toBe(0); expect(buildGrass({ ...FOLIAGE, grassWorld: 0 }).all.length).toBe(0); });
  it("grass never changes the scatter, the features or the colliders: the chunk contents are pinned with grass on or off", () => {
    const before = sha(allContents()); buildGrass(); buildGrass(off);
    expect(sha(allContents())).toBe(before);
    expect(before).toBe(PINNED_CONTENTS);
    expect(WORLD.seed).toBeDefined();
  });
});

describe("the scatter", () => {
  const g = shippedGrass();
  it("is deterministic", () => { expect(sha(buildGrass().all)).toBe(sha(buildGrass().all)); });
  it("is independent of the order chunks are asked in", () => {
    const fwd: unknown[] = [], rev: unknown[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) fwd.push(grassInChunk(a, b, g));
    for (let a = CHUNKS - 1; a >= 0; a--) for (let b = CHUNKS - 1; b >= 0; b--) rev.unshift(grassInChunk(a, b, g));
    expect(sha(rev)).toBe(sha(fwd));
  });
  it("has some grass, only in regions with density, and stays inside the World", () => {
    expect(g.all.length).toBeGreaterThan(500);
    for (const t of g.all) { expect(FOLIAGE.density[regionAt(t.z, t.x)]).toBeGreaterThan(0); expect(Math.abs(t.x)).toBeLessThan(WORLD.size / 2); expect(Math.abs(t.z)).toBeLessThan(WORLD.size / 2); expect(t.s).toBeGreaterThan(0); }
  });
  it("holds the World ceiling and the per-chunk cap", () => {
    expect(g.all.length).toBeLessThanOrEqual(FOLIAGE.grassWorld);
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) expect(grassInChunk(a, b, g).length).toBeLessThanOrEqual(FOLIAGE.grassPerChunk);
    const tight = buildGrass({ ...FOLIAGE, grassWorld: 100, grassPerChunk: 7 });
    expect(tight.all.length).toBeLessThanOrEqual(100);
    for (const l of tight.perChunk.values()) expect(l.length).toBeLessThanOrEqual(7);
  });
  it("thinning is seeded by priority, not by position in the list", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ i, p: ((i * 7919) % 20) / 20 }));
    const a = thin(items, 8, (t) => t.p).map((t) => t.i).sort((x, y) => x - y), b = thin([...items].reverse(), 8, (t) => t.p).map((t) => t.i).sort((x, y) => x - y);
    expect(a).toEqual(b); expect(a.length).toBe(8); expect(thin(items, 0, (t) => t.p)).toEqual([]);
  });
  it("keeps off the path, the garden, landmarks, hedges and every solid", () => {
    const hp = buildHedges();
    const sol: { x: number; z: number; r: number }[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) sol.push(...chunkCircles(chunkContents(a, b)));
    for (const t of g.all) {
      expect(keepClear(t.x, t.z, 0)).toBe(false); expect(hedgeTouches(t.x, t.z, GRASS_R, hp, 0)).toBe(false);
      const near = sol.filter((c) => Math.abs(c.x - t.x) < 8 && Math.abs(c.z - t.z) < 8);
      expect(near.some((c) => Math.hypot(c.x - t.x, c.z - t.z) < c.r + GRASS_R * 0.9)).toBe(false);
    }
    expect(FEATURES.limits.perChunk).toBeGreaterThan(0);
  });
  it("is in the chunk it is listed under, and is walk-through (no collider is added)", () => {
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) for (const t of grassInChunk(a, b, g)) { expect(chunkOf(t.x)).toBe(a); expect(chunkOf(t.z)).toBe(b); }
  });
});

describe("the bundle shape", () => {
  const geo = grassGeo(), p = geo.getAttribute("position");
  it("is cheap: five blades, about ten triangles", () => { const tris = p.count / 3; expect(tris).toBeGreaterThanOrEqual(10); expect(tris).toBeLessThanOrEqual(20); });
  it("starts on the ground and no blade tip floats outside the bundle", () => {
    let miny = 1e9, maxy = -1e9, maxr = 0;
    for (let i = 0; i < p.count; i++) { miny = Math.min(miny, p.getY(i)); maxy = Math.max(maxy, p.getY(i)); maxr = Math.max(maxr, Math.hypot(p.getX(i), p.getZ(i))); expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true); }
    expect(miny).toBe(0); expect(maxy).toBeLessThan(0.8); expect(maxr).toBeLessThanOrEqual(GRASS_R);
  });
  it("every blade has a root vertex on the ground", () => {
    for (let k = 0; k < 5; k++) { let roots = 0; for (let i = k * 9; i < k * 9 + 9; i++) if (p.getY(i) === 0) roots++; expect(roots).toBeGreaterThanOrEqual(2); }
  });
});

const PINNED_CONTENTS = "7d54b869449a6f66d55c50224a376216bf585db3e3a4455b6cd35ee3d18cdaa1"; // same value on main before this slice
