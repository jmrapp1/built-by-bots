import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { addOutline, disposeTree } from "@/lib/outline";
import { buildCreature, buildEgg } from "@/lib/creature";

const edgeCount = (m: THREE.Mesh) => {
  let n = 0; m.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) n += (o as THREE.LineSegments).geometry.getAttribute("position").count / 2; });
  return n;
};
const mk = (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); addOutline(m); return m; };

describe("S26 outline (no wireframe on curved meshes)", () => {
  it("curved geometry draws no edges across its faces", () => {
    expect(edgeCount(mk(new THREE.SphereGeometry(0.2, 16, 12)))).toBe(0);
    expect(edgeCount(mk(new THREE.SphereGeometry(1.1, 20, 12)))).toBe(0);
    expect(edgeCount(mk(new THREE.CapsuleGeometry(0.22, 0.4, 6, 12)))).toBe(0);
  });
  it("flat-sided geometry keeps its 12 box edges", () => {
    expect(edgeCount(mk(new THREE.BoxGeometry(1, 1, 1)))).toBe(12);
  });
  it("the egg draws no wireframe", () => { expect(edgeCount(buildEgg())).toBe(0); });
  it("outline lines never raycast", () => {
    const m = mk(new THREE.BoxGeometry(1, 1, 1));
    const line = m.children[0] as THREE.LineSegments;
    const hits: THREE.Intersection[] = [];
    line.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);
  });
  it("disposeTree frees the outline geometry and material too", () => {
    const m = mk(new THREE.BoxGeometry(1, 1, 1));
    const line = m.children[0] as THREE.LineSegments;
    const g = vi.spyOn(line.geometry, "dispose"); const mt = vi.spyOn(line.material as THREE.Material, "dispose");
    const root = new THREE.Group(); root.add(m);
    disposeTree(root);
    expect(g).toHaveBeenCalled(); expect(mt).toHaveBeenCalled(); expect(root.children).toHaveLength(0);
  });
  it("a built creature has no dense wireframe", () => {
    const c = buildCreature({ hue: 0.5, shape: "round", parts: ["ears"], eyes: 1 } as never, { partsShown: 2, mark: null }, "leaflet");
    let lines = 0; c.traverse((o) => { if ((o as THREE.LineSegments).isLineSegments) lines += (o as THREE.LineSegments).geometry.getAttribute("position").count / 2; });
    expect(lines).toBeLessThan(200);
  });
});
