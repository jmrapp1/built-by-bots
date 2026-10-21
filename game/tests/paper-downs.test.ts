// W6 step 1: Paper Downs as data. Pure checks, no browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD, chunkContents, chunkCircles, regionAt, CHUNKS } from "@/lib/worldMap";
import { SIGNPOSTS, regionOfCell, cellCentre, CELLS } from "@/lib/map";
import { REGIONS, SPOTS, spotsForDay } from "@/lib/worldSpots";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Paper Downs", () => {
  it("is the north-east: north of the edge and east of the split, with its own look and density", () => {
    expect(regionAt(WORLD.inkwoodZ - 1, WORLD.paperDownsX + 1)).toBe("paper_downs");
    expect(regionAt(WORLD.inkwoodZ - 1, WORLD.paperDownsX - 1)).toBe("inkwood");
    expect(regionAt(WORLD.inkwoodZ + 1, 50)).toBe("meadow");
    expect(Math.abs(WORLD.paperDownsX % WORLD.chunk)).toBe(0);
    expect(WORLD.look.paper_downs.ground).not.toBe(WORLD.look.inkwood.ground);
    expect(WORLD.density.paper_downs.tree).toBeLessThan(WORLD.density.inkwood.tree);
  });
  it("chunks there are tagged paper_downs, and the same chunk is the same every time", () => {
    const ix = Math.floor((30 + WORLD.size / 2) / WORLD.chunk), iz = Math.floor((-100 + WORLD.size / 2) / WORLD.chunk);
    expect(chunkContents(ix, iz).region).toBe("paper_downs");
    expect(chunkContents(ix, iz)).toEqual(chunkContents(ix, iz));
  });
  it("the paper-kite hill is a landmark inside the World, in Paper Downs, tall enough to read through fog", () => {
    const l = WORLD.landmarks.find((m) => m.id === "paper-kite-hill")!;
    expect(l.kind).toBe("hill");
    expect(regionAt(l.z, l.x)).toBe("paper_downs");
    expect(l.h).toBeGreaterThanOrEqual(20);
    expect(Math.abs(l.x)).toBeLessThan(WORLD.size / 2); expect(Math.abs(l.z)).toBeLessThan(WORLD.size / 2);
    let found = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) found += chunkContents(a, b).landmarks.filter((m) => m.id === l.id).length;
    expect(found).toBe(1);
    expect(chunkCircles(chunkContents(Math.floor((l.x + WORLD.size / 2) / WORLD.chunk), Math.floor((l.z + WORLD.size / 2) / WORLD.chunk))).some((c) => c.x === l.x && c.z === l.z)).toBe(true);
  });
  it("has a picture signpost (no words) inside Paper Downs", () => {
    const k = SIGNPOSTS.find((s) => s.icon === "kite")!;
    expect(k).toBeTruthy();
    expect(regionAt(k.z, k.x)).toBe("paper_downs");
  });
  it("the map colours its cells", () => {
    let n = 0; for (let i = 0; i < CELLS * CELLS; i++) if (regionOfCell(i) === "paper_downs") n++;
    expect(n).toBeGreaterThan(0);
    const c = cellCentre(0); expect(typeof regionOfCell(0)).toBe("string"); expect(c.x).toBeLessThan(0);
  });
  it("spots: exactly 8, matching the live table, every day", () => {
    expect(REGIONS).toContain("paper_downs");
    expect(SPOTS.counts.paper_downs).toBe(8);
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2026, 9, 22 + d)).toISOString().slice(0, 10);
      expect(spotsForDay(day, "paper_downs")).toHaveLength(8);
    }
  });
  it("every margins_claims read keeps its region filter, and the world reads cover the new region", () => {
    const page = src("../app/page.tsx").replace(/\/\/.*$/gm, "");
    const reads = page.split('from("margins_claims")').slice(1).map((r) => r.slice(0, 160));
    for (const r of reads) expect(r).toMatch(/\.(eq|neq)\("region"/);
    expect(page).toContain('.rpc("world_unfold", { p_region: r, p_spot: n })');
  });
  it("adds no new network host or asset file", () => {
    for (const f of ["../data/world.json", "../data/map.json", "../data/spots.json"]) expect(src(f)).not.toMatch(/https?:|\.png|\.jpg|\.svg|\.glb/i);
  });
});
