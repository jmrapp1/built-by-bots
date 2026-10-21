// W6 step 2: Glyph Quarter as data. Pure checks, no browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD, CHUNKS, chunkContents, regionAt } from "@/lib/worldMap";
import { CELLS, regionOfCell } from "@/lib/map";
import { REGIONS, SPOTS, spotsForDay, regionRect } from "@/lib/worldSpots";
import map from "@/data/map.json";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Glyph Quarter", () => {
  it("is the far south, from a chunk edge, with its own look and sparse trees", () => {
    expect(regionAt(WORLD.glyphZ + 1, 0)).toBe("glyph_quarter");
    expect(regionAt(WORLD.glyphZ - 1, 0)).toBe("meadow");
    expect(regionAt(WORLD.inkwoodZ + 1, 0)).toBe("meadow");
    expect(Math.abs(WORLD.glyphZ % WORLD.chunk)).toBe(0);
    expect(WORLD.look.glyph_quarter.ground).not.toBe(WORLD.look.meadow.ground);
    expect(WORLD.density.glyph_quarter.tree).toBeLessThan(WORLD.density.meadow.tree);
    expect(map.look.glyph_quarter).toBe(WORLD.look.glyph_quarter.ground);
  });
  it("chunks there are tagged glyph_quarter and are the same every time", () => {
    const ix = Math.floor((0 + WORLD.size / 2) / WORLD.chunk), iz = Math.floor((100 + WORLD.size / 2) / WORLD.chunk);
    expect(chunkContents(ix, iz).region).toBe("glyph_quarter");
    expect(chunkContents(ix, iz)).toEqual(chunkContents(ix, iz));
  });
  it("the bookshelf wall is one tall landmark inside the World, in Glyph Quarter", () => {
    const l = WORLD.landmarks.find((m) => m.id === "bookshelf-wall")!;
    expect(l.kind).toBe("shelves");
    expect(regionAt(l.z, l.x)).toBe("glyph_quarter");
    expect(l.h).toBeGreaterThanOrEqual(20);
    expect(Math.abs(l.x)).toBeLessThan(WORLD.size / 2 - l.r * 2); expect(Math.abs(l.z)).toBeLessThan(WORLD.size / 2 - l.r);
    let found = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) found += chunkContents(a, b).landmarks.filter((m) => m.id === l.id).length;
    expect(found).toBe(1);
  });
  it("the map colours its cells", () => {
    let n = 0; for (let i = 0; i < CELLS * CELLS; i++) if (regionOfCell(i) === "glyph_quarter") n++;
    expect(n).toBeGreaterThan(0);
  });
  it("spots: exactly 8 every day, inside the region, equal to the live table", () => {
    expect(REGIONS).toContain("glyph_quarter");
    expect(SPOTS.counts.glyph_quarter).toBe(8);
    const R = regionRect("glyph_quarter");
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2026, 9, 22 + d)).toISOString().slice(0, 10);
      const list = spotsForDay(day, "glyph_quarter");
      expect(list).toHaveLength(8);
      for (const s of list) { expect(s.z).toBeGreaterThanOrEqual(R.z0); expect(regionAt(s.z, s.x)).toBe("glyph_quarter"); }
    }
  });
  it("the Meadow's spot area still lies in the Meadow", () => {
    const R = regionRect("meadow");
    expect(regionAt(R.z1, 0)).toBe("meadow"); expect(regionAt(R.z0, 0)).toBe("meadow");
  });
  it("every margins_claims read keeps its region filter", () => {
    const page = src("../app/page.tsx").replace(/\/\/.*$/gm, "");
    for (const r of page.split('from("margins_claims")').slice(1).map((x) => x.slice(0, 160))) expect(r).toMatch(/\.(eq|neq)\("region"/);
  });
  it("adds no new network host or asset file", () => {
    for (const f of ["../data/world.json", "../data/map.json", "../data/spots.json"]) expect(src(f)).not.toMatch(/https?:|\.png|\.jpg|\.svg|\.glb/i);
  });
});
