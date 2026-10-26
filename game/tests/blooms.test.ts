// F2: blooms. Seeded and pure; own switch, seed and caps; no collider; the grass is untouched; one baked mesh per chunk, no shadow.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import raw from "@/data/foliage.json";
import { BLOOMS, BLOOM_R, FOLIAGE, bloomsFlag, bloomsInChunk, buildBlooms, buildGrass, shippedBlooms, type BloomData } from "@/lib/foliage";
import { bakeBlooms, bloomGeo, buildWorldShell } from "@/components/worldShell";
import { CHUNKS, WORLD, chunkCircles, chunkContents, chunkOf, regionAt } from "@/lib/worldMap";
import { buildHedges, hedgeTouches, keepClear } from "@/lib/features";
import { readFileSync } from "node:fs";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const off: BloomData = { ...BLOOMS, enabled: false };

describe("the blooms switch", () => {
  it("ships on, and only a plain true is on", () => {
    expect(raw.blooms.enabled).toBe(true);
    for (const v of ["true", 1, "1", null, undefined, {}, []]) expect(bloomsFlag({ blooms: { enabled: v } })).toBe(false);
    expect(bloomsFlag(null)).toBe(false); expect(bloomsFlag({})).toBe(false);
  });
  it("off builds nothing; bloomsWorld 0 removes only blooms; an empty palette builds nothing", () => {
    expect(buildBlooms(off).all.length).toBe(0);
    expect(buildBlooms({ ...BLOOMS, bloomsWorld: 0 }).all.length).toBe(0);
    expect(buildBlooms({ ...BLOOMS, palette: [] }).all.length).toBe(0);
    expect(buildGrass().all.length).toBeGreaterThan(100);
  });
  it("is independent of the grass switch, both ways", () => {
    expect(buildBlooms().all.length).toBeGreaterThan(0);
    expect(buildGrass({ ...FOLIAGE, enabled: false }).all.length).toBe(0);
    expect(buildBlooms().all.length).toBe(shippedBlooms().all.length);
    expect(sha(buildGrass().all)).toBe(sha(buildGrass().all));
  });
  it("blooms never change the chunk contents (no collider, nothing in chunkContents)", () => {
    const all = () => { const o: unknown[] = []; for (let a = 0; a < CHUNKS; a++) for (let b = 0; b < CHUNKS; b++) o.push(chunkContents(a, b)); return o; };
    const before = sha(all()); buildBlooms(); buildBlooms(off);
    expect(sha(all())).toBe(before);
  });
});

describe("the bloom scatter", () => {
  const b = shippedBlooms();
  it("is deterministic and independent of the order chunks are asked in", () => {
    expect(sha(buildBlooms().all)).toBe(sha(b.all));
    const fwd: unknown[] = [], rev: unknown[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) fwd.push(bloomsInChunk(a, c, b));
    for (let a = CHUNKS - 1; a >= 0; a--) for (let c = CHUNKS - 1; c >= 0; c--) rev.unshift(bloomsInChunk(a, c, b));
    expect(sha(rev)).toBe(sha(fwd));
  });
  it("has some blooms, only in regions with density, inside the World, each with a palette colour", () => {
    expect(b.all.length).toBeGreaterThan(10);
    for (const t of b.all) {
      expect(BLOOMS.density[regionAt(t.z, t.x)]).toBeGreaterThan(0);
      expect(Math.abs(t.x)).toBeLessThan(WORLD.size / 2); expect(Math.abs(t.z)).toBeLessThan(WORLD.size / 2);
      expect(Number.isInteger(t.v)).toBe(true); expect(t.v).toBeGreaterThanOrEqual(0); expect(t.v).toBeLessThan(BLOOMS.palette.length);
    }
    const regions = new Set(b.all.map((t) => regionAt(t.z, t.x)));
    expect([...regions].sort()).toEqual(["meadow", "paper_downs"]);
    expect(new Set(b.all.map((t) => t.v)).size).toBe(BLOOMS.palette.length);
  });
  it("holds its own caps, and they sit well under the grass caps", () => {
    expect(b.all.length).toBeLessThanOrEqual(BLOOMS.bloomsWorld);
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) expect(bloomsInChunk(a, c, b).length).toBeLessThanOrEqual(BLOOMS.bloomsPerChunk);
    expect(BLOOMS.bloomsPerChunk).toBeLessThanOrEqual(FOLIAGE.grassPerChunk / 4);
    expect(BLOOMS.bloomsWorld).toBeLessThanOrEqual(FOLIAGE.grassWorld / 5);
    const tight = buildBlooms({ ...BLOOMS, bloomsWorld: 30, bloomsPerChunk: 3 });
    expect(tight.all.length).toBeLessThanOrEqual(30);
    for (const l of tight.perChunk.values()) expect(l.length).toBeLessThanOrEqual(3);
  });
  it("keeps off the path, garden, landmarks, hedges and every solid", () => {
    const hp = buildHedges(), sol: { x: number; z: number; r: number }[] = [];
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) sol.push(...chunkCircles(chunkContents(a, c)));
    for (const t of b.all) {
      expect(keepClear(t.x, t.z, 0)).toBe(false); expect(hedgeTouches(t.x, t.z, BLOOM_R, hp, 0)).toBe(false);
      expect(sol.some((c) => Math.abs(c.x - t.x) < 8 && Math.abs(c.z - t.z) < 8 && Math.hypot(c.x - t.x, c.z - t.z) < c.r + BLOOM_R * 0.9)).toBe(false);
    }
  });
  it("lists each bloom under the chunk it is in", () => {
    for (let a = 0; a < CHUNKS; a++) for (let c = 0; c < CHUNKS; c++) for (const t of bloomsInChunk(a, c, b)) { expect(chunkOf(t.x)).toBe(a); expect(chunkOf(t.z)).toBe(c); }
  });
});

describe("the clump shape and the baked mesh", () => {
  const geo = bloomGeo("#d9606b"), p = geo.getAttribute("position");
  it("is cheap, starts on the ground and stays small", () => {
    const tris = p.count / 3; expect(tris).toBeGreaterThanOrEqual(10); expect(tris).toBeLessThanOrEqual(24);
    let miny = 1e9, maxy = -1e9, maxr = 0;
    for (let i = 0; i < p.count; i++) { miny = Math.min(miny, p.getY(i)); maxy = Math.max(maxy, p.getY(i)); maxr = Math.max(maxr, Math.hypot(p.getX(i), p.getZ(i))); expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true); }
    expect(miny).toBe(0); expect(maxy).toBeLessThan(0.8); expect(maxr).toBeLessThanOrEqual(BLOOM_R);
  });
  it("variants differ only in petal colour", () => {
    const g2 = bloomGeo("#9bb8d9"), c1 = geo.getAttribute("color"), c2 = g2.getAttribute("color");
    expect(Array.from(g2.getAttribute("position").array)).toEqual(Array.from(p.array));
    let diff = 0; for (let i = 0; i < c1.count; i++) if (c1.getX(i) !== c2.getX(i)) diff++;
    expect(diff).toBeGreaterThan(0); expect(diff).toBeLessThan(c1.count);
  });
  it("one mesh holds every clump of a chunk, in its own colour, on the ground", () => {
    const vs = BLOOMS.palette.map((c) => bloomGeo(c)), items = [{ x: 3, z: 4, s: 1, r: 0, k: "bloom" as const, v: 0 }, { x: -6, z: 2, s: 1.2, r: 1.1, k: "bloom" as const, v: 2 }];
    const g = bakeBlooms(items, vs, () => 0.5)!, n = vs[0].getAttribute("position").count;
    expect(g.getAttribute("position").count).toBe(n * 2);
    const P = g.getAttribute("position"), C = g.getAttribute("color");
    let miny = 1e9; for (let i = 0; i < P.count; i++) miny = Math.min(miny, P.getY(i));
    expect(miny).toBeCloseTo(0.5, 5);
    expect(C.getX(n * 2 - 1)).toBe(vs[2].getAttribute("color").getX(n - 1));
    expect(bakeBlooms([], vs, () => 0)).toBeNull();
  });
});

describe("in the shell", () => {
  const meshes = (ground: boolean) => {
    const scene = new THREE.Scene(), shell = buildWorldShell(scene, { ground, features: true }); shell.update(-75, 10, true);
    const out: THREE.Mesh[] = []; scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.ownGeo) out.push(o as THREE.Mesh); });
    return { out, shell, scene };
  };
  it("draws at most one non-casting bloom mesh per chunk", () => {
    const { out, shell, scene } = meshes(true);
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) { expect(m.castShadow).toBe(false); expect(m.geometry.getAttribute("color")).toBeDefined(); }
    const parents = new Set(out.map((m) => m.parent)); expect(parents.size).toBe(out.length);
    shell.dispose(); expect(scene).toBeDefined();
  });
  it("is plainly gated by its own flag and takes nothing from the grass switch", () => {
    const src = readFileSync("components/worldShell.ts", "utf8");
    expect(src).toContain('bloomsFlag({ blooms: BLOOMS })');
    expect(src).not.toMatch(/foliageFlag/);
  });
});

describe("no randomness, clock, network or storage in the new code", () => {
  it("lib/foliage.ts", () => {
    const s = readFileSync("lib/foliage.ts", "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(s).not.toMatch(/Math\.random|Date\.now|new Date|fetch\(|localStorage|sessionStorage|XMLHttpRequest|https?:\/\//);
  });
});
