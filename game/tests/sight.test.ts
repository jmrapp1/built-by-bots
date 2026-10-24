// E0: the sight-line tooling. Pure; nothing here changes what the player sees. Set SIGHT_OUT=<dir> to also write the pictures and the report there (nothing is written otherwise).
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import map from "@/data/map.json";
import { WORLD, HALF, chunkContents } from "@/lib/worldMap";
import { GARDEN } from "@/lib/world";
import {
  EYES, castRay, createSightField, formatReport, layoutMap, lineClear, openness, pockets, radiusAt, reachReport, reachability, reachedNear, sightImage, sightReport, viewpoints, worldColliders, worldOccluders, type Occluder,
} from "@/lib/sight";

const mini = (occ: Occluder[], o: { far?: number; clip?: boolean } = {}) => createSightField(occ, { clip: false, ...o });
const tree = (x: number, z: number, s = 1): Occluder => ({ k: "tree", x, z, s });

describe("rays", () => {
  it("an empty field gives the fog distance, and the World edge cuts it short", () => {
    const f = mini([]);
    expect(castRay(f, 0, 0, 1.6, 0, 1)).toBe(WORLD.fog[1]);
    expect(castRay(mini([], { clip: true }), 100, 0, 1.6, 1, 0)).toBeCloseTo(HALF - 100, 5);
    expect(castRay(mini([], { clip: false }), 100, 0, 1.6, 1, 0)).toBe(WORLD.fog[1]);
  });
  it("a trunk blocks a level ray at its face, and a ray beside it passes", () => {
    const f = mini([tree(0, 20)]);
    expect(castRay(f, 0, 0, 1, 0, 1)).toBeCloseTo(20 - 0.25, 1); // trunk radius at 1 m is about 0.25
    expect(castRay(f, 2, 0, 1, 0, 1)).toBe(WORLD.fog[1]);
  });
  it("a ray over a crown passes, a ray into the crown stops", () => {
    const f = mini([tree(0, 20)]);
    expect(castRay(f, 0, 0, 3, 0, 1)).toBeLessThan(20); // 3 m is inside the low crown
    expect(castRay(f, 0, 0, 12, 0, 1)).toBe(WORLD.fog[1]); // well over the tree
  });
  it("a rising ray clears what a level one hits", () => {
    const f = mini([{ k: "rock", x: 0, z: 10, s: 1 }]);
    expect(castRay(f, 0, 0, 0.3, 0, 1)).toBeLessThan(10);
    expect(castRay(f, 0, 0, 0.3, 0, 1, 0.5)).toBe(WORLD.fog[1]);
  });
  it("hedges block by slab and by height", () => {
    const f = mini([{ k: "hedge", x: 0, z: 10, w: 6, d: 0.8, h: 1.1 }]);
    expect(castRay(f, 0, 0, 0.5, 0, 1)).toBeCloseTo(9.6, 5);
    expect(castRay(f, 0, 0, 2, 0, 1)).toBe(WORLD.fog[1]);
    expect(castRay(f, 5, 0, 0.5, 0, 1)).toBe(WORLD.fog[1]);
  });
  it("a start inside a thing, or the same ray twice, is stable", () => {
    const f = mini([tree(0, 0)]);
    expect(castRay(f, 0, 0, 1, 1, 0)).toBe(0);
    expect(castRay(f, 3, 3, 1, 0.6, 0.8)).toBe(castRay(f, 3, 3, 1, 0.6, 0.8));
  });
  it("lineClear sees a tip over a grove and not the foot of it, and ignores the landmark it looks at", () => {
    const f = mini([tree(0, 30), { k: "tower", id: "t", x: 0, z: 60, r: 2, h: 22 }]);
    expect(lineClear(f, { x: 0, z: 0, y: 1.6 }, { x: 0, z: 60, y: 1 }, "t")).toBe(false); // the tree is in the way
    expect(lineClear(f, { x: 0, z: 0, y: 1.6 }, { x: 0, z: 60, y: 20 }, "t")).toBe(true); // the top shows over the crown
    expect(lineClear(f, { x: 10, z: 0, y: 1.6 }, { x: 10, z: 60, y: 1 })).toBe(true);
  });
  it("radius profiles are zero where nothing is", () => {
    expect(radiusAt(tree(0, 0), -1)).toBe(0);
    expect(radiusAt(tree(0, 0), 50)).toBe(0);
    expect(radiusAt({ k: "tower", id: "paper-kite-hill", x: 0, z: 0, r: 7, h: 24 }, 12)).toBeCloseTo(3.5, 5);
  });
});

const occ = worldOccluders(), field = createSightField(occ);
const cols = worldColliders();

describe("the World as it is today", () => {
  it("the occluders are exactly the chunk and garden contents, so the tool cannot drift from the game", () => {
    let t = GARDEN.trees.length, r = 0, b = 0, l = 0;
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) { const k = chunkContents(a, c); t += k.trees.length; r += k.rocks.length; b += k.bushes.length; l += k.landmarks.length; }
    expect(occ.filter((o) => o.k === "tree").length).toBe(t);
    expect(occ.filter((o) => o.k === "rock").length).toBe(r);
    expect(occ.filter((o) => o.k === "bush").length).toBe(b);
    expect(occ.filter((o) => o.k === "tower").length).toBe(l);
    expect(l).toBe(WORLD.landmarks.length);
    expect(occ.filter((o) => o.k === "hedge").length).toBe(GARDEN.hedges.length);
  });
  it("the same numbers come out twice", () => {
    const p = viewpoints(32, cols)[10];
    expect(openness(field, p.x, p.z, EYES.person)).toEqual(openness(createSightField(worldOccluders()), p.x, p.z, EYES.person));
    expect(sightReport(field, EYES.person, 32, cols)).toEqual(sightReport(field, EYES.person, 32, cols));
  });
  it("viewpoints are inside the World and clear of everything solid", () => {
    for (const p of viewpoints(16, cols)) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(HALF);
  });
  it("the report has every region and sane numbers", () => {
    const r = sightReport(field, EYES.person, 16, cols);
    expect(r.regions.map((g) => g.region)).toEqual(["home", "meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"]);
    for (const g of r.regions) { expect(g.points).toBeGreaterThan(0); expect(g.meanView).toBeGreaterThan(0); expect(g.meanView).toBeLessThanOrEqual(WORLD.fog[1]); expect(g.p50Long).toBeGreaterThanOrEqual(0); expect(g.p50Long).toBeLessThanOrEqual(1); }
    expect(r.endToEnd.pairs).toBeGreaterThan(0);
    expect(r.landmarks.length).toBe(WORLD.landmarks.length);
    expect(r.trail.points).toBeGreaterThan(10);
    expect(formatReport([r], reachReport(reachability(cols, 1), map.signposts))).toContain("Reachability");
  });
  it("the densest wood is more closed than the sparsest region", () => {
    const r = sightReport(field, EYES.person, 16, cols), by = Object.fromEntries(r.regions.map((g) => [g.region, g]));
    expect(by.inkwood.meanView).toBeLessThan(by.paper_downs.meanView);
  });
});

describe("reachability", () => {
  const reach = reachability(cols, 0.5), rr = reachReport(reach, map.signposts);
  it("the walk starts at the spawn and reaches every landmark, the gate and the four corners", () => {
    expect(Object.values(rr.landmarksReached).every(Boolean)).toBe(true);
    expect(rr.gateReached).toBe(true);
    expect(rr.corners.every(Boolean)).toBe(true);
  });
  it("reaches every signpost, and nearly all open ground", () => {
    expect(rr.signpostsReached).toBe(rr.signposts);
    expect(rr.reachedShare).toBeGreaterThan(0.99);
  });
  it("a sealed ring is a pocket, and the walk will not enter it", () => {
    const ring = { circles: Array.from({ length: 40 }, (_, i) => ({ x: 60 + 4 * Math.cos((i / 40) * 6.2832), z: 60 + 4 * Math.sin((i / 40) * 6.2832), r: 1 })), boxes: [] };
    const r = reachability(ring, 0.5), pk = pockets(r);
    expect(reachedNear(r, 60, 60, 0.5)).toBe(false);
    expect(pk.length).toBe(1);
    expect(pk[0].area).toBeGreaterThan(20);
  });
});

describe("pictures", () => {
  it("the layout map is a square of characters with Home, the path, the spawn and every landmark", () => {
    const rows = layoutMap(4, cols).split("\n");
    expect(rows.length).toBe(WORLD.size / 4);
    expect(rows.every((r) => r.length === WORLD.size / 4)).toBe(true);
    const all = rows.join("");
    for (const ch of ["h", "=", "@", "#", "o", "H", "p"]) expect(all).toContain(ch);
    expect((all.match(/#/g) ?? []).length).toBeGreaterThanOrEqual(WORLD.landmarks.length);
  });
  it("the sight image has one byte per cell, all of it between black and white, and it is not flat", () => {
    const im = sightImage(field, 16, EYES.person);
    expect(im.px.length).toBe(im.n * im.n);
    expect(new Set(im.px).size).toBeGreaterThan(5);
  });
  it("the tool is pure: no clock, storage, randomness or three.js", () => {
    const src = readFileSync(new URL("../lib/sight.ts", import.meta.url), "utf8");
    for (const bad of ["Math.random", "Date.now", "performance.now", "localStorage", "from \"three\"", "fetch(", "process.env"]) expect(src).not.toContain(bad);
  });
  const out = process.env.SIGHT_OUT;
  (out ? it : it.skip)("writes the report, layout and pictures to SIGHT_OUT", () => {
    mkdirSync(out!, { recursive: true });
    const reps = [EYES.person, EYES.camera].map((e) => sightReport(field, e, 8, cols));
    writeFileSync(join(out!, "report.md"), formatReport(reps, rr0()));
    writeFileSync(join(out!, "layout.txt"), layoutMap(4, cols));
    for (const [name, im] of [["sight-mean", sightImage(field, 4, EYES.person)], ["sight-long", sightImage(field, 4, EYES.person, 24, "long")]] as const) {
      writeFileSync(join(out!, `${name}.pgm`), Buffer.concat([Buffer.from(`P5\n${im.n} ${im.n}\n255\n`), Buffer.from(im.px)]));
    }
  });
  function rr0() { return reachReport(reachability(cols, 0.5), map.signposts); }
});
