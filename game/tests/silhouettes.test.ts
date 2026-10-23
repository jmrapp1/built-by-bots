import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import SIL from "@/data/silhouettes.json";
import { buildCreature, SCALE, type Genes } from "@/lib/creature";
import { buildCreatureOld } from "@/lib/creatureOld";
import { placementFor } from "@/lib/cosmetics";
import { curl, smoothProfile } from "@/lib/shapes";

const SHAPES: Genes["shape"][] = ["round", "tall", "wide"];
const genes = (shape: Genes["shape"], hue = 120): Genes => ({ hue, shape, parts: ["ears", "tail", "fins"] });
const bodyBox = (grp: THREE.Group) => { const m = grp.children[0] as THREE.Mesh; m.updateMatrix(); return new THREE.Box3().setFromObject(grp.children[0]); };
const positions = (grp: THREE.Group) => { const out: number[] = []; grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) out.push(...Array.from(m.geometry.attributes.position.array as ArrayLike<number>)); }); return out; };

describe("S28 silhouettes", () => {
  it("each new body stays within tolerance of the old envelope", () => {
    for (const s of SHAPES) {
      const n = bodyBox(buildCreature(genes(s), { partsShown: 0, mark: null }));
      const o = bodyBox(buildCreatureOld(genes(s), { partsShown: 0, mark: null }));
      const ns = n.getSize(new THREE.Vector3()), os = o.getSize(new THREE.Vector3());
      for (const k of ["x", "y", "z"] as const) expect(Math.abs(ns[k] - os[k]) / os[k], `${s} ${k}`).toBeLessThan(SIL.tolerance + 0.05);
      expect(Math.abs(n.min.y - o.min.y)).toBeLessThan(0.08); // still sits on the ground
      expect(Math.abs(n.max.y - o.max.y) / o.max.y).toBeLessThan(SIL.tolerance);
    }
  });
  it("the body is not a sphere: its profile differs between shapes and from a sphere", () => {
    const sphereR = (y: number) => Math.sqrt(Math.max(0, 0.36 - (y - 0.6) ** 2));
    for (const s of SHAPES) {
      const pts = smoothProfile(SIL.body[s] as [number, number][], 30);
      const dev = Math.max(...pts.map(([r, y]) => Math.abs(r - sphereR(y))));
      expect(dev, s).toBeGreaterThan(0.03);
    }
    expect(JSON.stringify(SIL.body.round)).not.toBe(JSON.stringify(SIL.body.tall));
  });
  it("creature.ts and cosmetics.ts read one envelope", () => {
    expect(SCALE).toEqual(SIL.envelope);
    for (const s of SHAPES) {
      const p = placementFor("flower", "blotling", s)!, q = placementFor("flower", "blotling", "round")!;
      if (p && q) expect(p.pos[1] / q.pos[1]).toBeCloseTo(SIL.envelope[s][1] / SIL.envelope.round[1] * (p.pos[1] === 0 ? 1 : 1), 5);
    }
    expect(readFileSync("lib/cosmetics.ts", "utf8")).toContain("data/silhouettes.json");
    expect(readFileSync("lib/cosmetics.ts", "utf8")).not.toMatch(/tall: \[0\.85/);
  });
  it("same genes give the same Print; different genes differ", () => {
    for (const sp of ["blotling", "leaflet"]) {
      const a = positions(buildCreature(genes("round"), { partsShown: 99, mark: "leaf" }, sp));
      const b = positions(buildCreature(genes("round"), { partsShown: 99, mark: "leaf" }, sp));
      expect(a).toEqual(b);
    }
    const c = positions(buildCreature(genes("round", 200), { partsShown: 0, mark: null }));
    expect(c).not.toEqual(positions(buildCreature(genes("round", 120), { partsShown: 0, mark: null })));
  });
  it("no Math.random in the new code", () => {
    for (const f of ["lib/creature.ts", "lib/shapes.ts"]) expect(readFileSync(f, "utf8")).not.toContain("Math.random");
  });
  it("eyes are still found by userData.eye (blink), two per Print", () => {
    for (const sp of ["blotling", "leaflet"]) { let n = 0; buildCreature(genes("tall"), undefined, sp).traverse((o) => { if (o.userData.eye) n++; }); expect(n).toBe(2); }
  });
  it("every vertex is finite and parts (ears, tail, fins, leaf, tabs, fold, spine) build", () => {
    const g: Genes = { hue: 40, shape: "wide", parts: ["ears", "tail", "fins", "tabs", "fold", "spine"] };
    for (const sp of ["blotling", "leaflet"]) for (const mark of [null, "leaf", "halo"]) {
      const grp = buildCreature(g, { partsShown: 99, mark }, sp);
      for (const v of positions(grp)) expect(Number.isFinite(v)).toBe(true);
      expect(grp.children.length).toBeGreaterThan(3);
    }
  });
  it("vertex count is the same order as before", () => {
    const count = (grp: THREE.Group) => positions(grp).length / 3;
    for (const s of SHAPES) {
      const n = count(buildCreature(genes(s), { partsShown: 99, mark: "leaf" })), o = count(buildCreatureOld(genes(s), { partsShown: 99, mark: "leaf" }));
      expect(n / o, s).toBeLessThan(2);
      expect(n / o, s).toBeGreaterThan(0.3);
    }
  });
  it("curved parts draw no wireframe (outline only at sharp creases)", () => {
    const grp = buildCreature(genes("round"), { partsShown: 99, mark: "leaf" });
    let lines = 0; grp.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) lines += (o as THREE.LineSegments).geometry.getAttribute("position").count / 2; });
    expect(lines).toBeLessThan(120);
  });
  it("curl moves the tip, not the base", () => {
    const g = new THREE.BoxGeometry(0.1, 1, 0.1, 1, 4, 1); curl(g, 0.2);
    g.computeBoundingBox(); expect(g.boundingBox!.max.x).toBeGreaterThan(0.2);
    const base = Array.from({ length: g.attributes.position.count }, (_, i) => g.attributes.position.getY(i) < -0.49 ? Math.abs(g.attributes.position.getX(i)) : 0);
    expect(Math.max(...base)).toBeLessThan(0.06);
  });
  it("old Print is dev-only: override ignored in production", async () => {
    const { shapesOverride } = await import("@/lib/creatureOld");
    expect(shapesOverride("?shapes=old", true)).toBeNull();
    expect(shapesOverride("?shapes=old", false)).toBe("old");
  });
});
