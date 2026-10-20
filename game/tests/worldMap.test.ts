// W2: the World's pure functions: determinism, order independence, bounds, keep-outs, collisions, streaming window.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GARDEN } from "@/lib/world";
import { atOverride, blocked, CHUNKS, chunkBounds, chunkCircles, chunkContents, chunksAround, chunkOf, distToPath, HALF, nearbyCircles, pathPoints, regionAt, WORLD } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const all = () => { const r: [number, number][] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) r.push([a, b]); return r; };

describe("world chunks", () => {
  it("the world is whole chunks, and the garden sits inside it with room round it", () => {
    expect(WORLD.size % WORLD.chunk).toBe(0);
    expect(HALF).toBeGreaterThan(GARDEN.size / 2 + 40);
    expect(Math.abs(WORLD.inkwoodZ % WORLD.chunk)).toBe(0); // the region edge is a chunk edge, so a chunk has one look
  });
  it("a chunk always has the same contents, in any order, and a different seed differs", () => {
    const first = Object.fromEntries(all().map(([a, b]) => [`${a},${b}`, chunkContents(a, b)]));
    for (const [a, b] of [...all()].reverse()) expect(chunkContents(a, b)).toEqual(first[`${a},${b}`]);
    expect(chunkContents(1, 1, WORLD.seed + 1)).not.toEqual(first["1,1"]);
  });
  it("keeps every item inside its chunk, and out of the garden, the path and the landmarks", () => {
    for (const [a, b] of all()) {
      const { x0, z0, x1, z1 } = chunkBounds(a, b), c = chunkContents(a, b);
      for (const it of [...c.trees, ...c.rocks, ...c.bushes]) {
        expect(it.x).toBeGreaterThanOrEqual(x0); expect(it.x).toBeLessThan(x1); expect(it.z).toBeGreaterThanOrEqual(z0); expect(it.z).toBeLessThan(z1);
        expect(blocked(it.x, it.z)).toBe(false);
        expect(Math.max(Math.abs(it.x), Math.abs(it.z))).toBeGreaterThanOrEqual(GARDEN.size / 2 + WORLD.gardenKeepOut);
        expect(distToPath(it.x, it.z)).toBeGreaterThanOrEqual(WORLD.path.keepOut);
      }
    }
  });
  it("out-of-range chunks are empty and every landmark lives in exactly one chunk", () => {
    expect(chunkCircles(chunkContents(-1, 0))).toEqual([]); expect(chunkCircles(chunkContents(CHUNKS, 2))).toEqual([]);
    for (const l of WORLD.landmarks) expect(all().filter(([a, b]) => chunkContents(a, b).landmarks.some((m) => m.id === l.id))).toHaveLength(1);
  });
  it("regions: the north is Inkwood Edge, denser than the meadow, with a different look", () => {
    expect(regionAt(0)).toBe("meadow"); expect(regionAt(WORLD.inkwoodZ - 1)).toBe("inkwood");
    const trees = (z: number) => { let n = 0; for (const [a, b] of all()) { const { z0, z1 } = chunkBounds(a, b); if (z >= z0 && z < z1) n += chunkContents(a, b).trees.length; } return n; };
    expect(trees(-100)).toBeGreaterThan(trees(40) * 2);
    expect(WORLD.look.meadow.crown).not.toBe(WORLD.look.inkwood.crown);
  });
  it("tall landmarks are placed and are taller than any tree", () => {
    expect(WORLD.landmarks.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...WORLD.landmarks.map((l) => l.h))).toBeGreaterThan(12);
    expect(new Set(WORLD.landmarks.map((l) => regionAt(l.z))).size).toBe(2); // both regions have one
  });
  it("the path leaves the garden edge, ends inside the world and is clear of trees", () => {
    const P = pathPoints();
    expect(P[0].z).toBeGreaterThan(-GARDEN.size / 2); expect(Math.abs(P[0].x)).toBeLessThan(GARDEN.size / 2);
    expect(P.every((p) => Math.abs(p.x) < HALF && Math.abs(p.z) < HALF)).toBe(true);
    expect(regionAt(P[P.length - 1].z)).toBe("inkwood");
    expect(distToPath(P[5].x, P[5].z)).toBeLessThan(0.01);
    for (const t of GARDEN.trees) expect(Math.hypot(t.x - P[0].x, t.z - P[0].z)).toBeGreaterThan(t.r + 1.5); // the start is not blocked by a garden tree
    // no collider sits on the path
    for (const [a, b] of all()) for (const c of chunkCircles(chunkContents(a, b))) expect(distToPath(c.x, c.z) - c.r).toBeGreaterThan(0.5);
  });
  it("the player can walk the whole path (no circle closes it)", () => {
    for (const p of pathPoints()) {
      const ix = chunkOf(p.x), iz = chunkOf(p.z);
      for (const c of nearbyCircles(ix, iz)) expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeGreaterThan(c.r + 0.4 + 0.5);
    }
  });
  it("nearbyCircles gathers the chunk and its neighbours only", () => {
    const n = (ix: number, iz: number) => nearbyCircles(ix, iz, (a, b) => [{ x: a, z: b, r: 1 }]);
    expect(n(1, 1)).toHaveLength(9); expect(n(0, 0)).toHaveLength(4); expect(n(CHUNKS - 1, 0)).toHaveLength(4);
  });
  it("the streaming window is nearest first, inside the world, and empty far outside", () => {
    const w = chunksAround(0, 0, WORLD.fog[1] + WORLD.chunk);
    expect(w.length).toBe(CHUNKS * CHUNKS); // the whole first-release world is within the fog distance of the middle
    const d = (k: [number, number]) => { const b = chunkBounds(k[0], k[1]); return Math.hypot((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); };
    expect(d(w[0])).toBeLessThanOrEqual(d(w[w.length - 1]));
    expect(chunksAround(-9999, -9999, 100)).toEqual([]);
    expect(chunksAround(HALF, HALF, 70).length).toBeLessThan(10);
  });
  it("?at= is dev-only, parsed, and kept inside the world", () => {
    expect(atOverride("?at=10,-90", true)).toBeNull();
    expect(atOverride("?hour=12", false)).toBeNull();
    expect(atOverride("?at=10,-90", false)).toEqual({ x: 10, z: -90 });
    expect(atOverride("?at=9999,-9999", false)).toEqual({ x: HALF - GARDEN.player.radius, z: -(HALF - GARDEN.player.radius) });
  });
  it("the Print and the other garden systems still use the 40 m garden, not the World", () => {
    for (const f of ["../lib/forage.ts", "../lib/hide.ts"]) expect(src(f)).toMatch(/HOME\.half/);
    expect(src("../lib/world.ts")).toMatch(/size: number = HOME\.size/); // wander, route and move defaults now read the named Home scope (W3)
    expect(src("../lib/worldMap.ts")).not.toMatch(/from "three"/);
  });
});

describe("the shell and the garden wiring", () => {
  const world = src("../components/World.tsx"), shell = src("../components/worldShell.ts");
  it("the World is built by the garden zone and freed when it leaves, through the zone controller", () => {
    expect(world).toMatch(/\{ id: "garden", enter: enterGardenZone, leave: leaveGardenZone \}/);
    expect(world).toMatch(/const leaveGardenZone = \(\) => \{ shell\?\.dispose\(\); shell = null; \};/);
    expect(world.match(/buildWorldShell\(/g)).toHaveLength(1);
  });
  it("chunks stream at most buildsPerFrame at a time, and the first call may build all", () => {
    expect(shell).toMatch(/if \(!all && made >= WORLD\.buildsPerFrame\) break;/);
    expect(WORLD.buildsPerFrame).toBe(2); expect(WORLD.chunk).toBe(64);
    expect(world).toMatch(/shell\.update\(pos\.x, pos\.z\)/);
  });
  it("a dropped chunk frees its instance buffers and the shell frees everything it made", () => {
    expect(shell).toMatch(/for \(const im of c\.ims\) im\.dispose\(\)/);
    expect(shell).toMatch(/for \(const d of own\) d\.dispose\(\)/);
    expect(shell).toMatch(/scene\.remove\(group\)/);
  });
  it("garden collision is merged with the World's, and the player is bounded by the World, not the garden", () => {
    expect(world).toMatch(/gardenCols\(\), WORLD\.size,/);
    expect(world).toMatch(/GARDEN\.camera\.minDistance, gardenCols\(\)\)/);
  });
  it("the Print, bedtime and hide and seek still use the garden's own colliders and bounds", () => {
    expect(world).toMatch(/routeTo\(wander, NIGHT\.approach, cols, R\)/);
    expect(world).toMatch(/stepWander\(wander, dt, rng, GARDEN\.print\.radius, GARDEN\.print\.s/);
    expect(world).toMatch(/pickSpot\(pos, wander, hideLast, cols,/);
  });
  it("the dev spawn is gated for production and nothing in the World reads the network", () => {
    expect(world).toMatch(/atOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    expect(shell).not.toMatch(/fetch\(|supabase|XMLHttpRequest/);
  });
});

describe("W3: the Print is scoped to Home", async () => {
  const { HOME, GARDEN: G, inHome, colliders: cols0, stepWander, newWander, movePlayer: mv } = await import("@/lib/world");
  const { routeTo, NIGHT } = await import("@/lib/night");
  const { FORAGE, spotsAreClear } = await import("@/lib/forage");
  const { pickSpot, previewSpot, HIDE } = await import("@/lib/hide");
  const { mulberry32 } = await import("@/lib/margins");
  it("Home is the 40 m garden, named in one place, inside the Meadow", () => {
    expect(HOME.size).toBe(G.size); expect(HOME.half * 2).toBe(HOME.size);
    expect(inHome({ x: 0, z: 0 })).toBe(true); expect(inHome({ x: 20, z: -20 })).toBe(true); expect(inHome({ x: 20.1, z: 0 })).toBe(false); expect(inHome({ x: 19, z: 0 }, 2)).toBe(false);
    expect(HOME.half).toBeLessThan(HALF);
  });
  it("no file outside world.ts reads the garden size directly any more", () => {
    for (const f of ["../lib/forage.ts", "../lib/hide.ts", "../lib/night.ts", "../lib/worldMap.ts", "../components/World.tsx"]) expect(src(f)).not.toMatch(/GARDEN\.size/);
  });
  it("a wandering Print never leaves Home, even when started at the edge and walked for a long time", () => {
    const cols = cols0(), rng = mulberry32(5);
    for (const start of [{ x: 0, z: 0 }, { x: 19.4, z: 19.4 }, { x: -19.4, z: -19.4 }, { x: 19.4, z: -19.4 }]) {
      let w = newWander(start);
      for (let i = 0; i < 6000; i++) { w = stepWander(w, 0.05, rng, G.print.radius, G.print.speed * 4, cols); expect(inHome(w, G.print.radius - 0.001)).toBe(true); }
    }
  });
  it("routes the Print takes (to bed, to the pond) stay inside Home", () => {
    const cols = cols0(), R = G.print.radius, rng = mulberry32(9);
    for (let i = 0; i < 40; i++) {
      const from = { x: (rng() - 0.5) * 36, z: (rng() - 0.5) * 36 };
      for (const r of routeTo(from, NIGHT.approach, cols, R)) expect(inHome(r)).toBe(true);
    }
    expect(inHome(NIGHT.approach)).toBe(true); expect(inHome(NIGHT.bed)).toBe(true);
  });
  it("hide and seek picks only spots inside Home, and the foraging spots are inside it", () => {
    const cols = cols0(), rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const player = { x: (rng() - 0.5) * 36, z: (rng() - 0.5) * 36 }, print = { x: (rng() - 0.5) * 30, z: (rng() - 0.5) * 30 };
      const pick = pickSpot(player, print, -1, cols, rng(), rng(), rng());
      if (pick) expect(inHome(pick.spot, G.print.radius + HIDE.mapMargin - 0.001)).toBe(true);
    }
    for (let yaw = 0; yaw < 6.3; yaw += 0.7) expect(previewSpot({ x: 18, z: 18 }, yaw, cols).spot).toBeDefined();
    expect(spotsAreClear()).toBe(true); for (const s of FORAGE.spots) expect(inHome(s, 1)).toBe(true);
  });
  it("the player, unlike the Print, can walk beyond Home when given the World's size", () => {
    const cols = cols0(); let p = { x: 18, z: 0 };
    for (let i = 0; i < 100; i++) p = mv(p, { forward: 0, right: 1 }, 0, 7, 0.1, G.player.radius, cols, WORLD.size).pos;
    expect(p.x).toBeGreaterThan(HOME.half);
  });
});
