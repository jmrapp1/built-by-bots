// W6 step 4: Pressmark Shore as data. Pure checks, no browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORLD, CHUNKS, chunkContents, regionAt } from "@/lib/worldMap";
import { CELLS, regionOfCell } from "@/lib/map";
import { REGIONS, SPOTS, spotsForDay, regionRect } from "@/lib/worldSpots";
import map from "@/data/map.json";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("Pressmark Shore", () => {
  it("is the east of the middle band, from a chunk edge, with its own look and reedy bushes", () => {
    expect(regionAt(0, WORLD.shoreX + 1)).toBe("pressmark_shore");
    expect(regionAt(0, WORLD.shoreX - 1)).toBe("meadow");
    expect(regionAt(WORLD.glyphZ + 1, WORLD.shoreX + 1)).toBe("glyph_quarter");
    expect(regionAt(WORLD.inkwoodZ - 1, WORLD.shoreX + 1)).toBe("paper_downs");
    expect(Math.abs(WORLD.shoreX % WORLD.chunk)).toBe(0);
    expect(WORLD.look.pressmark_shore.ground).not.toBe(WORLD.look.meadow.ground);
    expect(WORLD.density.pressmark_shore.bush).toBeGreaterThan(WORLD.density.meadow.bush);
    expect(map.look.pressmark_shore).toBe(WORLD.look.pressmark_shore.ground);
  });
  it("chunks there are tagged pressmark_shore and are the same every time", () => {
    const ix = Math.floor((100 + WORLD.size / 2) / WORLD.chunk), iz = Math.floor((0 + WORLD.size / 2) / WORLD.chunk);
    expect(chunkContents(ix, iz).region).toBe("pressmark_shore");
    expect(chunkContents(ix, iz)).toEqual(chunkContents(ix, iz));
  });
  it("the lantern bridge is one landmark inside the World, on the Shore", () => {
    const l = WORLD.landmarks.find((m) => m.id === "lantern-bridge")!;
    expect(l.kind).toBe("bridge");
    expect(regionAt(l.z, l.x)).toBe("pressmark_shore");
    expect(Math.abs(l.x)).toBeLessThan(WORLD.size / 2 - 12); expect(Math.abs(l.z)).toBeLessThan(WORLD.size / 2 - 20);
    let found = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) found += chunkContents(a, b).landmarks.filter((m) => m.id === l.id).length;
    expect(found).toBe(1);
  });
  it("the map colours its cells", () => {
    let n = 0; for (let i = 0; i < CELLS * CELLS; i++) if (regionOfCell(i) === "pressmark_shore") n++;
    expect(n).toBeGreaterThan(0);
  });
  it("spots: exactly 8 every day, inside the region, equal to the live table", () => {
    expect(REGIONS).toContain("pressmark_shore");
    expect(SPOTS.counts.pressmark_shore).toBe(8);
    const R = regionRect("pressmark_shore");
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2026, 9, 22 + d)).toISOString().slice(0, 10);
      const list = spotsForDay(day, "pressmark_shore");
      expect(list).toHaveLength(8);
      for (const s of list) { expect(s.x).toBeGreaterThanOrEqual(R.x0); expect(regionAt(s.z, s.x)).toBe("pressmark_shore"); }
    }
  });
  it("the Meadow's spot area still lies in the Meadow", () => {
    const R = regionRect("meadow");
    for (const [x, z] of [[R.x1, R.z1], [R.x1, R.z0], [R.x0, R.z1], [R.x0, R.z0]]) expect(regionAt(z, x)).toBe("meadow");
    for (let d = 0; d < 30; d++) { const day = new Date(Date.UTC(2026, 9, 22 + d)).toISOString().slice(0, 10); expect(spotsForDay(day, "meadow")).toHaveLength(4); }
  });
  it("every margins_claims read keeps its region filter", () => {
    const page = src("../app/page.tsx").replace(/\/\/.*$/gm, "");
    for (const r of page.split('from("margins_claims")').slice(1).map((x) => x.slice(0, 160))) expect(r).toMatch(/\.(eq|neq)\("region"/);
  });
  it("adds no new network host or asset file", () => {
    for (const f of ["../data/world.json", "../data/map.json", "../data/spots.json"]) expect(src(f)).not.toMatch(/https?:|\.png|\.jpg|\.svg|\.glb/i);
  });
});
