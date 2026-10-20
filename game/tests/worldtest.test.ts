// W0 SPIKE: pins the throwaway test scene's pure helpers. Delete with the spike.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chunkContents, chunksAround, chunksPerSide, CLEAR_RADIUS, DENSITY, instanceCount, parseWorldTest } from "@/lib/worldtest";

const o = { size: 240, chunk: 64, seed: 7 };
describe("worldtest (spike)", () => {
  it("is ignored in production and for missing or silly sizes", () => {
    expect(parseWorldTest("?worldtest=240", true)).toBeNull();
    expect(parseWorldTest("", false)).toBeNull();
    expect(parseWorldTest("?worldtest=abc", false)).toBeNull();
    expect(parseWorldTest("?worldtest=5", false)).toBeNull();
    expect(parseWorldTest("?worldtest=240", false)?.size).toBe(240);
    expect(parseWorldTest("?worldtest=480&chunk=9999&fog=1", false)).toMatchObject({ chunk: 256, fogFar: 60 });
  });
  it("the page checks the production guard, and nothing else imports the spike", () => {
    expect(readFileSync(new URL("../app/worldtest/page.tsx", import.meta.url), "utf8")).toMatch(/parseWorldTest\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    for (const f of ["../components/World.tsx", "../app/page.tsx"]) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/worldtest|WorldTest/i);
  });
  it("a chunk always has the same contents, in any order, and different seeds differ", () => {
    const a = chunkContents(2, 1, o); chunkContents(0, 0, o);
    expect(chunkContents(2, 1, o)).toEqual(a);
    expect(chunkContents(2, 1, { ...o, seed: 8 })).not.toEqual(a);
  });
  it("keeps items inside their chunk, clears the spawn area, and out-of-range chunks are empty", () => {
    const half = o.size / 2;
    for (let ix = 0; ix < chunksPerSide(o.size, o.chunk); ix++) for (let iz = 0; iz < chunksPerSide(o.size, o.chunk); iz++) {
      const c = chunkContents(ix, iz, o);
      for (const it of [...c.trees, ...c.rocks, ...c.hedges, ...c.landmarks]) {
        expect(it.x).toBeGreaterThanOrEqual(-half + ix * o.chunk); expect(it.x).toBeLessThanOrEqual(Math.min(half, -half + (ix + 1) * o.chunk));
        expect(it.z).toBeGreaterThanOrEqual(-half + iz * o.chunk); expect(it.z).toBeLessThanOrEqual(Math.min(half, -half + (iz + 1) * o.chunk));
        expect(Math.hypot(it.x, it.z)).toBeGreaterThanOrEqual(CLEAR_RADIUS);
      }
    }
    expect(instanceCount(chunkContents(-1, 0, o))).toBe(0);
    expect(instanceCount(chunkContents(99, 0, o))).toBe(0);
  });
  it("the total scenery is close to the density asked for", () => {
    let trees = 0; const n = chunksPerSide(480, 64);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) trees += chunkContents(a, b, { size: 480, chunk: 64, seed: 7 }).trees.length;
    const want = 480 * 480 * DENSITY.tree;
    expect(trees).toBeGreaterThan(want * 0.9); expect(trees).toBeLessThan(want * 1.05);
  });
  it("the streaming window is nearest first, bounded, and inside the world", () => {
    const w = chunksAround(0, 0, 100, { size: 480, chunk: 64 });
    expect(w.length).toBeGreaterThan(4); expect(w.length).toBeLessThan(30);
    expect(w.every(([a, b]) => a >= 0 && b >= 0 && a < 8 && b < 8)).toBe(true);
    expect(chunksAround(-9999, -9999, 100, { size: 480, chunk: 64 })).toEqual([]);
  });
});
