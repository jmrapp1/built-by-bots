// E4: hedgerows. Pure builder, box colliders, reachability with the hedges in, the scatter cleared from under them, and off equals today.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import map from "@/data/map.json";
import { GARDEN, pushOut } from "@/lib/world";
import { CHUNKS, HALF, WORLD, chunkContents, regionAt } from "@/lib/worldMap";
import { FEATURES, HEDGES, buildHedge, buildHedges, featureCircles, buildAll, hedgeBoxes, hedgePiecesInChunk, hedgeTouches, keepClear, type Hedge } from "@/lib/features";
import { buildWorldShell } from "@/components/worldShell";
import { createSightField, castRay, worldOccluders, reachability, reachReport, pockets, worldColliders } from "@/lib/sight";

const pieces = buildHedges();
const shellOf = (features: boolean) => { const scene = new THREE.Scene(), shell = buildWorldShell(scene, { features }); shell.update(-34, 0, true); return { scene, shell }; };

describe("hedge data", () => {
  it("has unique ids, known regions, axis-aligned runs, sane sizes and gaps at least gapWidth across", () => {
    expect(new Set(HEDGES.map((h) => h.id)).size).toBe(HEDGES.length);
    expect(HEDGES.length).toBeGreaterThan(3);
    for (const h of HEDGES) {
      expect(h.a[0] === h.b[0] || h.a[1] === h.b[1], h.id).toBe(true);
      expect(h.h).toBeGreaterThanOrEqual(3); expect(h.h).toBeLessThanOrEqual(5); // about 4 m, per the plan
      const L = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]);
      expect(h.gaps.length, h.id).toBeGreaterThan(0);
      for (const [g0, g1] of h.gaps) expect((g1 - g0) * L, h.id).toBeGreaterThanOrEqual(FEATURES.limits.gapWidth);
    }
  });
  it("every hedge builds pieces, mostly inside its own region", () => {
    for (const h of HEDGES) {
      const own = pieces.filter((p) => p.f === h.id);
      expect(own.length, h.id).toBeGreaterThan(0);
      expect(own.filter((p) => regionAt(p.z, p.x) === h.region).length / own.length, h.id).toBeGreaterThan(0.8);
    }
  });
});

describe("builder", () => {
  it("is deterministic and partitions into chunks with no loss", () => {
    expect(JSON.stringify(HEDGES.flatMap(buildHedge))).toBe(JSON.stringify(pieces));
    let n = 0; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) n += hedgePiecesInChunk(a, b).length;
    expect(n).toBe(pieces.length);
    expect(hedgePiecesInChunk(-1, 0)).toEqual([]);
  });
  it("leaves each gap open, and every piece is clear of Home, the path, the gate, signposts and landmark feet", () => {
    for (const h of HEDGES) {
      const L = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1]), alongX = h.a[1] === h.b[1];
      for (const [g0, g1] of h.gaps) for (let t = g0 + 0.01; t < g1; t += 0.02) {
        const x = h.a[0] + (h.b[0] - h.a[0]) * t, z = h.a[1] + (h.b[1] - h.a[1]) * t;
        expect(pieces.some((p) => p.f === h.id && Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2), `${h.id} gap ${t}`).toBe(false);
      }
      expect(L).toBeGreaterThan(0); expect(typeof alongX).toBe("boolean");
    }
    for (const p of pieces) {
      expect(keepClear(p.x, p.z, Math.min(p.w, p.d) / 2), `${p.f} ${p.x},${p.z}`).toBe(false);
      expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(HALF); expect(Math.abs(p.z) + p.d / 2).toBeLessThanOrEqual(HALF);
    }
  });
  it("a hedge laid across Home and the path loses exactly the stretch that would sit on them", () => {
    const h: Hedge = { id: "t", region: "meadow", a: [-40, 0], b: [40, 0], thick: 1.6, h: 3.6, gaps: [] };
    const out = buildHedge(h);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((p) => Math.abs(p.x) < 10)).toBe(false);
  });
  it("pieces are short enough to be culled per chunk (4 m or less along the run)", () => { for (const p of pieces) expect(Math.max(p.w, p.d)).toBeLessThanOrEqual(4.5); });
});

describe("walking", () => {
  const base = worldColliders(), boxes = hedgeBoxes(pieces);
  const withH = { circles: [...base.circles, ...featureCircles(buildAll())], boxes: [...base.boxes, ...boxes] };
  const r1 = reachability(withH, 0.5), rr = reachReport(r1, map.signposts);
  it("with the hedges in, the walk from the spawn still reaches every landmark, the gate, the signposts and the corners, and seals no room-sized pocket", () => {
    expect(Object.values(rr.landmarksReached).every(Boolean)).toBe(true);
    expect(rr.gateReached).toBe(true); expect(rr.signpostsReached).toBe(rr.signposts); expect(rr.corners.every(Boolean)).toBe(true);
    expect(rr.reachedShare).toBeGreaterThan(0.99);
    for (const p of pockets(r1)) expect(p.area, `${p.x},${p.z}`).toBeLessThanOrEqual(0.5);
  });
  it("the player is pushed out of a hedge box, and walks through a gap", () => {
    const p = pieces[0], r = GARDEN.player.radius;
    const out = pushOut({ x: p.x, z: p.z }, r, { circles: [], boxes });
    expect(hedgeTouches(out.x, out.z, 0, pieces, -r + 0.01)).toBe(false);
    const h = HEDGES.find((q) => q.id === "meadow-south-wall")!, mid = (h.gaps[0][0] + h.gaps[0][1]) / 2;
    const gx = h.a[0] + (h.b[0] - h.a[0]) * mid, gz = h.a[1];
    const still = pushOut({ x: gx, z: gz }, r, { circles: [], boxes });
    expect(Math.hypot(still.x - gx, still.z - gz)).toBeLessThan(1e-6);
  });
  it("a hedge blocks the eye at camera height, and a ray through its gap passes", () => {
    const f = createSightField([...worldOccluders(), ...pieces.map((p) => ({ k: "hedge" as const, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h }))], { far: 200 });
    const h = HEDGES.find((q) => q.id === "meadow-south-wall")!;
    const mid = (h.gaps[0][0] + h.gaps[0][1]) / 2, gx = h.a[0] + (h.b[0] - h.a[0]) * mid, solidX = h.a[0] + (h.b[0] - h.a[0]) * 0.1;
    expect(castRay(f, solidX, 30, 1.6, 0, 1)).toBeLessThan(14);
    expect(castRay(f, gx, 30, 1.6, 0, 1)).toBeGreaterThan(14);
  });
});

describe("the scatter under the hedges", () => {
  it("with the features on, no scatter item overlaps a hedge piece; with them off, nothing moves", () => {
    const on = shellOf(true).shell, off = shellOf(false).shell;
    const p = pieces[0];
    const touching = (cs: { x: number; z: number; r: number }[]) => cs.filter((c) => hedgeTouches(c.x, c.z, c.r, pieces, 0) && Math.abs(c.x - p.x) < 60);
    expect(touching(on.circlesNear(p.x, p.z, 40)).length).toBe(0);
    expect(off.boxesNear(p.x, p.z, 40)).toEqual([]);
    expect(on.boxesNear(p.x, p.z, 8).length).toBeGreaterThan(0);
  });
  it("off equals today: the shell's instance count and circles match a shell built without the option", () => {
    const a = shellOf(false), scene = new THREE.Scene(), plain = buildWorldShell(scene); plain.update(-34, 0, true);
    expect(a.shell.stats().instances).toBe(plain.stats().instances);
    expect(JSON.stringify(a.shell.circlesNear(-34, 0, 40))).toBe(JSON.stringify(plain.circlesNear(-34, 0, 40)));
  });
  it("on: more instances than off (the hedge meshes), and the scatter itself still pinned to today's contents", () => {
    expect(shellOf(true).shell.stats().instances).toBeGreaterThan(shellOf(false).shell.stats().instances);
    const all: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) all.push(chunkContents(a, b));
    expect(createHash("sha256").update(JSON.stringify(all)).digest("hex")).toBe("eb1fc86171afdf852866ce98ca298a81e0f04705ee938679b34a7ab1d2ba14ab");
  });
  it("wiring: World passes the hedge boxes into the walking and follow colliders; the pure World does not import features", () => {
    const w = readFileSync(new URL("../components/World.tsx", import.meta.url), "utf8");
    expect(w.match(/shell\.boxesNear\(/g)?.length).toBe(2);
    for (const f of ["../lib/worldMap.ts", "../lib/world.ts", "../lib/sight.ts"]) expect(readFileSync(new URL(f, import.meta.url), "utf8")).not.toMatch(/features/);
    expect(WORLD.size).toBe(256);
  });
});
