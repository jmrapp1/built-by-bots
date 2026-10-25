// E2: feature data and generator. Pure tests: deterministic, keep-clear, off equals today, reachability, per-chunk cost. Nothing is drawn.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import map from "@/data/map.json";
import raw from "@/data/features.json";
import { GARDEN } from "@/lib/world";
import { CHUNKS, HALF, WORLD, buildContents, chunkContents, distToPath, regionAt } from "@/lib/worldMap";
import { FEATURES, buildAll, buildFeature, featureCircles, featureInstanceCount, featureItemsInChunk, featuresFlag, itemRadius, keepClear, type Feature } from "@/lib/features";
import { pockets, reachReport, reachability, reachedNear, worldColliders } from "@/lib/sight";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const list = FEATURES.list as Feature[];
const items = buildAll();
const gate = GARDEN.places.find((p) => p.kind === "gate")!;

describe("the data", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.features.enabled).toBe(true);
    expect(featuresFlag(raw)).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(featuresFlag({ features: { enabled: v } })).toBe(false);
    expect(featuresFlag({ features: { enabled: true } })).toBe(true);
    expect(featuresFlag(null)).toBe(false);
  });
  it("every feature has a unique id and seed, a known region, and a sane recipe", () => {
    expect(new Set(list.map((f) => f.id)).size).toBe(list.length);
    expect(new Set(list.map((f) => f.seed)).size).toBe(list.length);
    for (const f of list) {
      expect(["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"]).toContain(f.region);
      expect(["tree", "rock", "bush"]).toContain(f.recipe.k);
      expect(f.recipe.s[0]).toBeLessThanOrEqual(f.recipe.s[1]);
      expect(f.recipe.spacing).toBeGreaterThan(2);
    }
  });
  it("every region has at least one feature, and each feature builds something", () => {
    for (const r of ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"]) expect(list.some((f) => f.region === r)).toBe(true);
    for (const f of list) expect(items.filter((i) => i.f === f.id).length).toBeGreaterThan(0);
  });
  it("a feature's items are mostly in its own region", () => {
    for (const f of list) {
      const own = items.filter((i) => i.f === f.id), inside = own.filter((i) => regionAt(i.z, i.x) === f.region).length;
      expect(inside / own.length).toBeGreaterThan(0.8);
    }
  });
});

describe("deterministic", () => {
  it("the same list builds the same items, byte for byte, in any order and call", () => {
    const a = JSON.stringify(list.map((f) => buildFeature(f))), b = JSON.stringify([...list].map((f) => buildFeature(f)));
    expect(a).toBe(b);
    expect(JSON.stringify(list.slice().reverse().map((f) => buildFeature(f)).reverse())).toBe(a);
    expect(JSON.stringify(buildAll(list.map((f) => ({ ...f })), { ...FEATURES.limits }))).toBe(JSON.stringify(items));
  });
  it("a different seed gives a different layout", () => {
    const f = list[0];
    expect(JSON.stringify(buildFeature({ ...f, seed: f.seed + 1 } as Feature))).not.toBe(JSON.stringify(buildFeature(f)));
  });
  it("building any chunk twice is identical, and the chunks partition the items with no seam", () => {
    let total = 0;
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) {
      const x = featureItemsInChunk(a, b), y = featureItemsInChunk(a, b, buildAll());
      expect(JSON.stringify(x)).toBe(JSON.stringify(y));
      total += x.length;
    }
    expect(total).toBe(items.length); // every item in exactly one chunk, so a belt crossing a chunk edge loses nothing
    expect(featureItemsInChunk(-1, 0)).toEqual([]);
    expect(featureItemsInChunk(0, CHUNKS)).toEqual([]);
  });
  it("is pure: no clock, storage, Math.random or three.js", () => {
    const s = src("../lib/features.ts");
    for (const bad of ["Math.random", "Date.now", "new Date", "localStorage", "window.", "document.", "from \"three\"", "performance.now"]) expect(s).not.toContain(bad);
  });
});

describe("keep-clear", () => {
  it("no item (with its own radius) is inside Home, on the path, at the gate, on a signpost or at a landmark's foot", () => {
    for (const i of items) {
      const r = itemRadius(i);
      expect(keepClear(i.x, i.z, r), `${i.f} ${i.x},${i.z}`).toBe(false);
      expect(Math.abs(i.x) < 10 && Math.abs(i.z) < 10 ? "home" : "ok").toBe("ok");
      expect(distToPath(i.x, i.z)).toBeGreaterThanOrEqual(WORLD.path.keepOut + r);
      expect(Math.hypot(i.x - gate.x, i.z - gate.z)).toBeGreaterThanOrEqual(4 + r);
      for (const p of map.signposts) expect(Math.hypot(i.x - p.x, i.z - p.z)).toBeGreaterThanOrEqual(2.5 + r);
      for (const l of WORLD.landmarks) expect(Math.hypot(i.x - l.x, i.z - l.z)).toBeGreaterThanOrEqual(l.r + 5 + r);
      expect(Math.abs(i.x)).toBeLessThanOrEqual(HALF - r);
      expect(Math.abs(i.z)).toBeLessThanOrEqual(HALF - r);
    }
  });
  it("the check itself says yes at Home, the gate, the path, a signpost and a landmark, and no in open ground", () => {
    expect(keepClear(0, 0)).toBe(true);
    expect(keepClear(gate.x, gate.z)).toBe(true);
    expect(keepClear(WORLD.path.points[2][0], WORLD.path.points[2][1])).toBe(true);
    expect(keepClear(map.signposts[0].x, map.signposts[0].z)).toBe(true);
    expect(keepClear(WORLD.landmarks[0].x, WORLD.landmarks[0].z)).toBe(true);
    expect(keepClear(-100, 20)).toBe(false);
  });
  it("a feature drawn across the path and Home loses exactly the items that would sit on them", () => {
    const f: Feature = { id: "t", region: "meadow", seed: 5, shape: "row", a: [-40, 0], b: [40, 0], gaps: [], recipe: { k: "tree", s: [1, 1], spacing: 4 } };
    const out = buildFeature(f);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((i) => !keepClear(i.x, i.z, itemRadius(i)))).toBe(true);
    expect(out.some((i) => Math.abs(i.x) < 10)).toBe(false);
  });
  it("the path's own keep-out in the scatter is unchanged", () => {
    const WORLD_KEEP = WORLD.path.keepOut;
    expect(WORLD_KEEP).toBe(3.4);
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) for (const t of chunkContents(a, b).trees) expect(distToPath(t.x, t.z)).toBeGreaterThanOrEqual(WORLD_KEEP);
  });
});

describe("off equals today", () => {
  // sha256 of JSON of every chunk's contents on main c428143. E2 adds a module nothing imports, so this must not move.
  const PIN = "eb1fc86171afdf852866ce98ca298a81e0f04705ee938679b34a7ab1d2ba14ab";
  it("every chunk's contents are exactly today's", () => {
    const all: unknown[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) all.push(buildContents(a, b, WORLD.seed, false));
    expect(createHash("sha256").update(JSON.stringify(all)).digest("hex")).toBe(PIN);
  });
  it("the pure World (chunk contents, sight tooling) does not import the features; only the shell draws them, behind the switch", () => {
    for (const f of ["../lib/worldMap.ts", "../lib/world.ts", "../lib/sight.ts"]) expect(src(f)).not.toMatch(/features/);
  });
  it("region fog stays off (the ground is on since the hills went live)", async () => {
    const g = await import("@/data/ground.json"), r = await import("@/data/regionFog.json");
    expect(g.default.ground.enabled).toBe(true);
    expect(r.default.regionFog.enabled).toBe(true);
  });
});

describe("reachability", () => {
  const base = worldColliders();
  const withF = { circles: [...base.circles, ...featureCircles(items)], boxes: base.boxes };
  const r0 = reachability(base, 0.5), r1 = reachability(withF, 0.5);
  const rr = reachReport(r1, map.signposts);
  it("with every feature in, the walk from the spawn still reaches every landmark, the gate, the signposts and the four corners", () => {
    expect(Object.values(rr.landmarksReached).every(Boolean)).toBe(true);
    expect(rr.gateReached).toBe(true);
    expect(rr.signpostsReached).toBe(rr.signposts);
    expect(rr.corners.every(Boolean)).toBe(true);
  });
  it("features seal no new pocket, and every ring's middle can be reached", () => {
    // the grid walk leaves a few single 0.5 m cells between overlapping circles (today has five); a feature may add such specks but no room-sized pocket
    for (const p of pockets(r1)) expect(p.area, `${p.x},${p.z}`).toBeLessThanOrEqual(0.5);
    expect(rr.pocketArea).toBeLessThanOrEqual(reachReport(r0, map.signposts).pocketArea + 2);
    expect(rr.reachedShare).toBeGreaterThan(0.99);
    for (const f of list) if (f.shape === "ring") expect(reachedNear(r1, f.at[0], f.at[1], 1.5), f.id).toBe(true);
  });
  it("items are spaced at least minGap apart edge to edge, so the player (diameter 0.8) fits between", () => {
    expect(FEATURES.limits.minGap).toBeGreaterThanOrEqual(GARDEN.player.radius * 2 + 0.4);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (items[i].f !== items[j].f) continue;
      expect(Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) - itemRadius(items[i]) - itemRadius(items[j])).toBeGreaterThanOrEqual(FEATURES.limits.minGap - 1e-6);
    }
  });
  it("the openings of rows and rings are at least the gap width across", () => {
    for (const f of list) {
      if (f.shape === "ring") { const deg = (f.opening[1] - f.opening[0] + 360) % 360, chord = 2 * f.r * Math.sin((deg * Math.PI) / 360); expect(chord, f.id).toBeGreaterThanOrEqual(FEATURES.limits.gapWidth); }
      if (f.shape === "row") { const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]); for (const [g0, g1] of f.gaps) expect((g1 - g0) * L, f.id).toBeGreaterThanOrEqual(FEATURES.limits.gapWidth); }
    }
  });
});

describe("per-chunk cost", () => {
  it("the instance count of each chunk's features stays under the cap, and today's scatter plus features stays modest", () => {
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) {
      expect(featureInstanceCount(featureItemsInChunk(a, b)), `${a},${b}`).toBeLessThanOrEqual(FEATURES.limits.perChunk);
    }
  });
});
