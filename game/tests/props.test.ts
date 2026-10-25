// E5: region prop families (Meadow tufts and haystacks; Inkwood drips and ferns). Pure builder, seeded, capped per chunk, kept clear, reachable, and off equals today.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import map from "@/data/map.json";
import { GARDEN } from "@/lib/world";
import { CHUNKS, HALF, WORLD, buildContents, chunkContents, regionAt } from "@/lib/worldMap";
import { PROPS, PROP_LIMITS, buildPatch, buildProps, buildAll, buildHedges, featureCircles, hedgeBoxes, hedgeTouches, keepClear, propCircles, propItemsInChunk, propRadius, QUARTER_GAP, featuresOn } from "@/lib/features";
import { buildWorldShell } from "@/components/worldShell";
import { reachability, reachReport, pockets, worldColliders } from "@/lib/sight";

const items = buildProps().filter((i) => PROPS.some((p) => p.id === i.f)); // the authored patches; the cluster props (C1) are tested in clusters.test.ts
const shellOf = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(-34, 0, true); return { scene, shell }; };

describe("prop data", () => {
  it("has unique ids, Meadow, Inkwood, Paper Downs and Pressmark Shore and Glyph Quarter only so far, all eleven shapes, and counts that fit the cap", () => {
    expect(new Set(PROPS.map((p) => p.id)).size).toBe(PROPS.length);
    for (const p of PROPS) { expect(["meadow", "inkwood", "paper_downs", "pressmark_shore", "glyph_quarter"], p.id).toContain(p.region); expect(p.count).toBeLessThanOrEqual(PROP_LIMITS.perChunk); }
    expect(new Set(PROPS.map((p) => p.kind))).toEqual(new Set(["tuft", "haystack", "drip", "fern", "pinwheel", "pagestone", "reed", "driftwood", "bookstack", "glyphpillar", "lamppost"]));
  });
  it("every patch builds something", () => { for (const p of PROPS) expect(buildPatch(p).length, p.id).toBeGreaterThan(0); });
});

describe("determinism", () => {
  it("same seed, same layout byte for byte; building twice is identical; a changed seed changes it", () => {
    expect(JSON.stringify(PROPS.flatMap((p) => buildPatch(p)))).toBe(JSON.stringify(PROPS.flatMap((p) => buildPatch(p))));
    expect(JSON.stringify(buildProps([...PROPS]))).toBe(JSON.stringify(items));
    expect(JSON.stringify(buildPatch({ ...PROPS[0], seed: PROPS[0].seed + 1 }))).not.toBe(JSON.stringify(buildPatch(PROPS[0])));
  });
  it("chunks partition the items with no loss and building a chunk twice matches", () => {
    let n = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) { const c = propItemsInChunk(a, b); n += c.length; expect(JSON.stringify(propItemsInChunk(a, b))).toBe(JSON.stringify(c)); }
    expect(n).toBe(buildProps().length); expect(propItemsInChunk(-1, 0)).toEqual([]);
  });
});

describe("cost and clearance", () => {
  it("each chunk stays under the cap, and a tiny cap is honoured", () => {
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) expect(propItemsInChunk(a, b).length).toBeLessThanOrEqual(PROP_LIMITS.perChunk);
    const tight = buildProps([...PROPS], { ...PROP_LIMITS, perChunk: 3 });
    for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) expect(propItemsInChunk(a, b, tight).length).toBeLessThanOrEqual(3);
  });
  it("every item is in its own region, inside the World, and clear of Home, the path, the gate, signposts, landmarks, hedges, features and the scatter", () => {
    const hp = buildHedges(), fc = featureCircles(buildAll());
    const scatter = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) { const c = chunkContents(a, b); scatter.push(...c.trees.map((t) => ({ ...t, r2: 0.55 * t.s })), ...c.rocks.map((t) => ({ ...t, r2: 0.7 * t.s })), ...c.bushes.map((t) => ({ ...t, r2: 0.8 * t.s }))); }
    for (const i of items) {
      const r = propRadius(i);
      expect(regionAt(i.z, i.x), i.f).toBe(PROPS.find((p) => p.id === i.f)!.region);
      expect(Math.abs(i.x) + r).toBeLessThan(HALF); expect(Math.abs(i.z) + r).toBeLessThan(HALF);
      expect(keepClear(i.x, i.z, r), `${i.f} ${i.x},${i.z}`).toBe(false);
      expect(hedgeTouches(i.x, i.z, r, hp, 0)).toBe(false);
      expect(fc.some((c) => Math.hypot(c.x - i.x, c.z - i.z) < c.r + r)).toBe(false);
      if (i.x > -80 && i.x < 80) expect(scatter.some((c) => Math.hypot(c.x - i.x, c.z - i.z) < c.r2 + r)).toBe(false);
    }
  });
  it("haystacks do not overlap each other", () => {
    const h = items.filter((i) => i.k === "haystack");
    for (let a = 0; a < h.length; a++) for (let b = a + 1; b < h.length; b++) expect(Math.hypot(h[a].x - h[b].x, h[a].z - h[b].z)).toBeGreaterThan(propRadius(h[a]) + propRadius(h[b]));
  });
});

describe("Inkwood Edge", () => {
  const ink = items.filter((i) => regionAt(i.z, i.x) === "inkwood");
  it("has both drips and ferns, every one inside Inkwood, and none solid", () => {
    expect(new Set(ink.map((i) => i.k))).toEqual(new Set(["drip", "fern"]));
    expect(ink.length).toBe(items.filter((i) => i.k === "drip" || i.k === "fern").length);
    expect(propCircles(ink).length).toBe(0);
    for (const p of PROPS.filter((q) => q.region === "inkwood")) expect(buildPatch(p).length, p.id).toBeGreaterThanOrEqual(Math.floor(p.count / 2));
  });
  it("is deterministic and a changed seed changes it", () => {
    const p = PROPS.find((q) => q.kind === "fern")!;
    expect(JSON.stringify(buildPatch(p))).toBe(JSON.stringify(buildPatch(p)));
    expect(JSON.stringify(buildPatch({ ...p, seed: p.seed + 1 }))).not.toBe(JSON.stringify(buildPatch(p)));
  });
  it("with the features on, a shell in Inkwood draws the new shapes; off draws none", () => {
    const at = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(-72, -100, true); return shell.stats().instances; };
    expect(at(true)).toBeGreaterThan(at(false));
  });
});

describe("Paper Downs", () => {
  const dn = items.filter((i) => regionAt(i.z, i.x) === "paper_downs");
  it("has pinwheels and page-stones, every one inside the Downs; only page-stones are solid", () => {
    expect(new Set(dn.map((i) => i.k))).toEqual(new Set(["pinwheel", "pagestone"]));
    expect(dn.length).toBe(items.filter((i) => i.k === "pinwheel" || i.k === "pagestone").length);
    expect(propCircles(dn).length).toBe(dn.filter((i) => i.k === "pagestone").length);
    for (const p of PROPS.filter((q) => q.region === "paper_downs")) expect(buildPatch(p).length, p.id).toBeGreaterThanOrEqual(Math.floor(p.count / 2));
  });
  it("is deterministic and a changed seed changes it", () => {
    for (const kind of ["pinwheel", "pagestone"]) {
      const p = PROPS.find((q) => q.kind === kind)!;
      expect(JSON.stringify(buildPatch(p))).toBe(JSON.stringify(buildPatch(p)));
      expect(JSON.stringify(buildPatch({ ...p, seed: p.seed + 1 }))).not.toBe(JSON.stringify(buildPatch(p)));
    }
  });
  it("with the features on, a shell in the Downs draws the new shapes; off draws none", () => {
    const at = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(92, -90, true); return shell.stats().instances; };
    expect(at(true)).toBeGreaterThan(at(false));
  });
});

describe("Pressmark Shore", () => {
  const sh = items.filter((i) => regionAt(i.z, i.x) === "pressmark_shore");
  it("has reeds and driftwood, every one inside the Shore; only driftwood is solid", () => {
    expect(new Set(sh.map((i) => i.k))).toEqual(new Set(["reed", "driftwood"]));
    expect(sh.length).toBe(items.filter((i) => i.k === "reed" || i.k === "driftwood").length);
    expect(propCircles(sh).length).toBe(sh.filter((i) => i.k === "driftwood").length);
    for (const p of PROPS.filter((q) => q.region === "pressmark_shore")) expect(buildPatch(p).length, p.id).toBeGreaterThanOrEqual(Math.floor(p.count / 2));
  });
  it("is deterministic and a changed seed changes it", () => {
    for (const kind of ["reed", "driftwood"]) {
      const p = PROPS.find((q) => q.kind === kind)!;
      expect(JSON.stringify(buildPatch(p))).toBe(JSON.stringify(buildPatch(p)));
      expect(JSON.stringify(buildPatch({ ...p, seed: p.seed + 1 }))).not.toBe(JSON.stringify(buildPatch(p)));
    }
  });
  it("with the features on, a shell on the Shore draws the new shapes; off draws none", () => {
    const at = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(100, -20, true); return shell.stats().instances; };
    expect(at(true)).toBeGreaterThan(at(false));
  });
});

describe("Glyph Quarter", () => {
  const gq = items.filter((i) => regionAt(i.z, i.x) === "glyph_quarter" && ["bookstack", "glyphpillar", "lamppost"].includes(i.k));
  it("has book stacks, glyph pillars and lamp posts, every one inside the Quarter and solid", () => {
    expect(new Set(gq.map((i) => i.k))).toEqual(new Set(["bookstack", "glyphpillar", "lamppost"]));
    expect(gq.length).toBe(items.filter((i) => ["bookstack", "glyphpillar", "lamppost"].includes(i.k)).length);
    expect(propCircles(gq).length).toBe(gq.length);
    for (const p of PROPS.filter((q) => q.region === "glyph_quarter")) expect(buildPatch(p).length, p.id).toBeGreaterThanOrEqual(Math.floor(p.count / 2));
  });
  it("leaves a walkable gap of at least 4 m between any two solid props, and none is pinned against another", () => {
    const solids = gq.map((i) => ({ x: i.x, z: i.z, r: propRadius(i) }));
    for (let a = 0; a < solids.length; a++) for (let b = a + 1; b < solids.length; b++) expect(Math.hypot(solids[a].x - solids[b].x, solids[a].z - solids[b].z) - solids[a].r - solids[b].r, `${a}-${b}`).toBeGreaterThanOrEqual(QUARTER_GAP);
  });
  it("is deterministic and a changed seed changes it", () => {
    for (const kind of ["bookstack", "glyphpillar", "lamppost"]) {
      const p = PROPS.find((q) => q.kind === kind)!;
      expect(JSON.stringify(buildPatch(p))).toBe(JSON.stringify(buildPatch(p)));
      expect(JSON.stringify(buildPatch({ ...p, seed: p.seed + 1 }))).not.toBe(JSON.stringify(buildPatch(p)));
    }
  });
  it("with the features on, a shell in the Quarter draws the new shapes; off draws none", () => {
    const at = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(-30, 100, true); return shell.stats().instances; };
    expect(at(true)).toBeGreaterThan(at(false));
  });
});

describe("walking", () => {
  const base = worldColliders(), withP = { circles: [...base.circles, ...featureCircles(buildAll()), ...propCircles(items)], boxes: [...base.boxes, ...hedgeBoxes(buildHedges())] };
  it("with the haystacks in (tufts, drips, ferns, pinwheels and reeds are walk-through), the walk from the spawn still reaches every landmark, the gate, the signposts and the corners, and seals no room-sized pocket", () => {
    expect(propCircles(items).length).toBe(items.filter((i) => i.k === "haystack" || i.k === "pagestone" || i.k === "driftwood" || i.k === "bookstack" || i.k === "glyphpillar" || i.k === "lamppost").length);
    const r1 = reachability(withP, 0.5), rr = reachReport(r1, map.signposts);
    expect(Object.values(rr.landmarksReached).every(Boolean)).toBe(true);
    expect(rr.gateReached).toBe(true); expect(rr.signpostsReached).toBe(rr.signposts); expect(rr.corners.every(Boolean)).toBe(true);
    expect(rr.reachedShare).toBeGreaterThan(0.99);
    for (const p of pockets(r1)) expect(p.area, `${p.x},${p.z}`).toBeLessThanOrEqual(0.5);
    expect(GARDEN.player.radius).toBeGreaterThan(0);
  });
});

describe("off equals today", () => {
  it("shell with the features off matches a shell built without the option, in instances and circles", () => {
    const a = shellOf(false), plain = buildWorldShell(new THREE.Scene()); plain.update(-34, 0, true);
    expect(a.shell.stats().instances).toBe(plain.stats().instances);
    expect(JSON.stringify(a.shell.circlesNear(-34, 0, 40))).toBe(JSON.stringify(plain.circlesNear(-34, 0, 40)));
  });
  it("off draws no prop meshes; on draws them (more instances, and the circles gain only haystacks)", () => {
    const off = shellOf(false), on = shellOf(true);
    expect(on.shell.stats().instances).toBeGreaterThan(off.shell.stats().instances);
    const names = (s: { scene: THREE.Scene }) => { let n = 0; s.scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).material && ((o as THREE.InstancedMesh).material as THREE.MeshToonMaterial).vertexColors) n++; }); return n; };
    expect(names(off)).toBe(0); expect(names(on)).toBeGreaterThan(0);
  });
  it("the scatter itself is pinned to today's contents; the switch is on in the data, and ?features= still overrides in dev only", () => {
    const all: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) all.push(buildContents(a, b, WORLD.seed, false));
    expect(createHash("sha256").update(JSON.stringify(all)).digest("hex")).toBe("4ce8c673f1e291d52539444a70fde2f47fdc0aa83d996d1ebc7eeec081f4f45f");
    expect(featuresOn("", true)).toBe(true); expect(featuresOn("?features=0", false)).toBe(false); expect(featuresOn("?features=1", true)).toBe(true);
  });
});
