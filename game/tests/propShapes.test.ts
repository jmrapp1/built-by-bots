import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { capGeo, decorBox, decorCyl, decorSphere, dipEnds, lintelGeo, postGeo, seedOf } from "@/lib/propShapes";
import { addOutline, OUTLINE_ANGLE } from "@/lib/outline";

const size = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!.getSize(new THREE.Vector3()); };
const finite = (g: THREE.BufferGeometry) => { const a = g.attributes.position.array as ArrayLike<number>; expect(a.length).toBeGreaterThan(0); for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true); };
const near = (a: number, b: number, tol = 0.05) => expect(Math.abs(a - b) / b).toBeLessThanOrEqual(tol);
const same = (a: THREE.BufferGeometry, b: THREE.BufferGeometry) => expect(Array.from(a.attributes.position.array)).toEqual(Array.from(b.attributes.position.array));

describe("S29 prop builders", () => {
  it("post keeps the old box size and is finite", () => {
    const g = postGeo(0.3, 2.5, 0.3); finite(g);
    const s = size(g); near(s.x, 0.3); near(s.y, 2.5); near(s.z, 0.3);
  });
  it("leaning post keeps its height, its base stays put, only the top moves", () => {
    const g = postGeo(0.3, 2.5, 0.3, 1.5); finite(g); near(size(g).y, 2.5);
    expect(g.boundingBox!.min.y).toBeCloseTo(-1.25, 1);
    expect(size(g).x).toBeLessThan(0.3 + 2.5 * Math.sin((1.5 * Math.PI) / 180) + 0.01);
  });
  it("lintel and a dipped lintel stay within 5 percent", () => {
    const l = lintelGeo(2.2, 0.24, 0.34); finite(l); const s = size(l); near(s.x, 2.2); near(s.y, 0.24); near(s.z, 0.34);
    const d = dipEnds(lintelGeo(2.2, 0.22, 0.34), 0.01); finite(d); near(size(d).y, 0.22);
  });
  it("cap is a lathed drum with the old footprint", () => {
    const g = capGeo(0.4, 0.12, 0.4); finite(g); const s = size(g); near(s.x, 0.4); near(s.y, 0.12); near(s.z, 0.4);
    const r = capGeo(0.42, 0.12, 0.3); near(size(r).x, 0.42); near(size(r).z, 0.3);
  });
  it("decor box, cylinder and sphere keep the old size", () => {
    const b = decorBox(1.1, 0.08, 0.46); finite(b); near(size(b).x, 1.1); near(size(b).y, 0.08); near(size(b).z, 0.46);
    for (const [rt, rb, h] of [[0.15, 0.18, 0.08], [0.04, 0.05, 1.5], [0.03, 0.24, 0.14]] as const) {
      const c = decorCyl(rt, rb, h); finite(c); const s = size(c);
      near(s.y, h); near(s.x, 2 * Math.max(rt, rb)); near(s.z, 2 * Math.max(rt, rb));
    }
    const sp = decorSphere(0.2, "k"); finite(sp); near(size(sp).x, 0.4); near(size(sp).y, 0.4);
  });
  it("same seed gives the same prop; another seed differs", () => {
    same(decorSphere(0.3, "a:1"), decorSphere(0.3, "a:1"));
    expect(Array.from(decorSphere(0.3, "a:1").attributes.position.array)).not.toEqual(Array.from(decorSphere(0.3, "a:2").attributes.position.array));
    expect(seedOf("x")).toBe(seedOf("x"));
  });
  it("rounded boxes still draw outline lines at the default and the lowered crease angle", () => {
    const count = (angle: number) => { const m = new THREE.Mesh(postGeo(0.3, 2.5, 0.3)); addOutline(m, undefined, angle); return (m.children[0] as THREE.LineSegments).geometry.attributes.position.count; };
    expect(count(40)).toBeGreaterThanOrEqual(count(OUTLINE_ANGLE));
    expect(count(OUTLINE_ANGLE)).toBeGreaterThan(0);
    expect(count(40)).toBeGreaterThan(0);
  });
  it("new code uses no Math.random, fetch or raw primitives", () => {
    const src = readFileSync(join(__dirname, "..", "lib/propShapes.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random|fetch\(|new THREE\.(Box|Sphere|Cylinder|Cone)Geometry/);
  });
});
