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

import { crownGeo, drumGeo, pillarGeo, plateGeo, poleGeo, trunkGeo } from "@/lib/propShapes";
import { leaning, softBox } from "@/lib/shapes";

describe("S29b builders", () => {
  const dims = (g: THREE.BufferGeometry) => { finite(g); return size(g); };
  it("trunks keep the old cylinder size", () => {
    for (const [rt, rb, h] of [[0.35, 0.5, 2.6], [0.18, 0.28, 2.6]] as const) { const s = dims(trunkGeo(rt, rb, h)); near(s.y, h); near(s.x, 2 * rb, 0.1); near(s.z, 2 * rb, 0.1); }
  });
  it("crowns keep the old cone size and are seeded", () => {
    for (const [r, h] of [[1.5, 1.8], [1.1, 1.5], [1.6, 2.6], [1.05, 2.2]] as const) { const s = dims(crownGeo(r, h, "k")); near(s.y, h); near(s.x, 2 * r); near(s.z, 2 * r); }
    same(crownGeo(1.5, 1.8, "a"), crownGeo(1.5, 1.8, "a"));
    expect(Array.from(crownGeo(1.5, 1.8, "a").attributes.position.array)).not.toEqual(Array.from(crownGeo(1.5, 1.8, "b").attributes.position.array));
  });
  it("stone tiers, pillars and poles keep the old size", () => {
    let s = dims(drumGeo(1, 1.06, 0.7)); near(s.y, 0.7); near(s.x, 2.12); 
    s = dims(pillarGeo(0.08, 0.2, 4)); near(s.y, 4); near(s.x, 0.4);
    const old = size(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6)); s = dims(poleGeo(0.07, 0.09, 1.9)); near(s.y, 1.9); near(s.x, old.x); near(s.z, old.z);
  });
  it("plates, pages and the shelf body keep the old box size", () => {
    let s = dims(plateGeo(0.9, 0.7, 0.07, 2)); near(s.x, 0.9); near(s.y, 0.7);
    s = dims(plateGeo(0.26, 0.36, 0.03)); near(s.x, 0.26); near(s.y, 0.36);
    s = dims(leaning(softBox(1, 2.4, 1, 0.05, 1), 1)); near(s.x, 1); near(s.y, 2.4); near(s.z, 1);
  });
  it("pillar faces point outward", () => {
    const g = pillarGeo(0.08, 0.2, 4), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 7) expect(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i)).toBeGreaterThan(0);
  });
});

import { blotGeo, hedgeGeo, inkwellGeo, pageGeo, pillowGeo, plinthGeo, tableGeo } from "@/lib/propShapes";

describe("S29c builders", () => {
  const dims = (g: THREE.BufferGeometry) => { finite(g); return size(g); };
  it("plinth, table and inkwell keep the old cylinder size", () => {
    let s = dims(plinthGeo(0.8, 0.9, 0.5)); near(s.y, 0.5); near(s.x, 1.8);
    s = dims(tableGeo(0.9, 0.7)); near(s.y, 0.7); near(s.x, 1.8);
    s = dims(inkwellGeo(0.3, 0.25, 0.4)); near(s.y, 0.4); near(s.x, 0.6);
    s = dims(inkwellGeo(0.3, 0.25, 0.4, 3)); near(s.y, 0.4, 0.1);
  });
  it("hedges, pages and pillows keep the old box size", () => {
    for (const [w, d] of [[6, 0.8], [0.8, 5], [7, 0.8]] as const) { const s = dims(hedgeGeo(w, 1.1, d, "h")); near(s.x, w); near(s.y, 1.1); near(s.z, d); }
    let s = dims(pageGeo(1.1, 0.04, 0.8)); near(s.x, 1.1); near(s.z, 0.8);
    s = dims(pillowGeo(0.5, 0.18, 0.4)); near(s.x, 0.5); near(s.z, 0.4); near(s.y, 0.18, 0.15);
  });
  it("blot and cushion keep the sphere size and are seeded", () => {
    const s = dims(blotGeo(1.1, 0.2, "a")); near(s.x, 2.2, 0.2); near(s.y, 2.2, 0.2);
    same(blotGeo(1.1, 0.2, "a"), blotGeo(1.1, 0.2, "a"));
    same(hedgeGeo(6, 1.1, 0.8, "x"), hedgeGeo(6, 1.1, 0.8, "x"));
  });
});

import { baseboardGeo, wallGeo } from "@/lib/propShapes";

describe("S30 home walls", () => {
  it("wall slabs keep the old box footprint (10%) and height, and are deterministic", () => {
    for (const [w, d, bow, lean] of [[13, 0.5, -0.03, 0], [0.5, 9, -0.03, -0.5], [0.5, 9, 0.03, 0], [5, 0.5, 0.02, 0]] as const) {
      const g = wallGeo(w, 3.2, d, bow, lean); finite(g); const s = size(g);
      near(s.x, w, 0.1); near(s.z, d, 0.14); near(s.y, 3.2, 0.1);
      same(g, wallGeo(w, 3.2, d, bow, lean));
    }
  });
  it("the bow is zero at both ends so corners still meet, and the sides are not mirror images", () => {
    const g = wallGeo(13, 3.2, 0.5, 0.03), p = g.attributes.position;
    let endMax = 0, mid = 0;
    for (let i = 0; i < p.count; i++) { if (Math.abs(p.getX(i)) > 6.49) endMax = Math.max(endMax, Math.abs(p.getZ(i))); if (Math.abs(p.getX(i)) < 0.2) mid = Math.max(mid, p.getZ(i)); }
    expect(endMax).toBeLessThanOrEqual(0.2501); expect(mid).toBeGreaterThan(0.27);
  });
  it("the baseboard stays within 5% of its box size (the dip adds 0.01)", () => {
    const s = size(baseboardGeo(13.02, 0.28, 0.52)); finite(baseboardGeo(1, 0.28, 0.52)); near(s.x, 13.02); near(s.z, 0.52); near(s.y, 0.28, 0.06);
  });
  it("home walls: the colliders come from lib/home.ts data and homeScene has no raw primitive", () => {
    const src = readFileSync(join(__dirname, "..", "components/homeScene.ts"), "utf8");
    expect(src).not.toMatch(/new THREE\.(Box|Sphere|Cylinder|Cone)Geometry/);
    expect(readFileSync(join(__dirname, "..", "lib/home.ts"), "utf8")).not.toMatch(/from "three"/);
  });
});
