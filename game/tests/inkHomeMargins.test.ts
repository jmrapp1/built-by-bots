// S26b: Home and Margins carry the S26 look. Source checks plus real geometry checks on the outline rule.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { OUTLINE_ANGLE, addOutline, disposeTree } from "@/lib/outline";
import { makeToonGradient } from "@/lib/inkToon";

const src = (f: string) => readFileSync(f, "utf8");
const edgeCount = (g: THREE.BufferGeometry) => new THREE.EdgesGeometry(g, OUTLINE_ANGLE).getAttribute("position").count;

describe("S26b home and margins", () => {
  it("both scenes use the palette helpers and the shared toon gradient", () => {
    for (const f of ["components/homeScene.ts", "components/marginsScene.ts"]) {
      const s = src(f);
      expect(s).toContain("@/lib/outline"); expect(s).toContain("makeToonGradient"); expect(s).toContain("disposeTree(group)");
    }
    expect(src("components/marginsScene.ts")).toContain("@/lib/palette");
  });
  it("old flat primaries are gone from marginsScene", () => {
    const s = src("components/marginsScene.ts");
    for (const hex of ["0xf2b632", "#3b4a8c", "#f2b632", "#2a2438", "#2b2a33"]) expect(s).not.toContain(hex);
  });
  it("curved meshes get no outline: lathe hills, bush spheres, and glints are not outlined", () => {
    const s = src("components/marginsScene.ts");
    expect(s).toMatch(/SphereGeometry\(1, 10, 8\)[^\n]*, false\)/);
    expect(s).not.toMatch(/addOutline\((m|hill)/);
  });
  it("the 60 degree rule: boxes keep 12 edges, smooth shapes draw no interior lines", () => {
    expect(edgeCount(new THREE.BoxGeometry(1, 1, 1))).toBe(24);
    const sphere = edgeCount(new THREE.SphereGeometry(1, 10, 8)), lathe = edgeCount(new THREE.LatheGeometry([new THREE.Vector2(3, 0), new THREE.Vector2(2, 0.5), new THREE.Vector2(0, 1)], 28));
    expect(sphere).toBe(0);
    expect(lathe).toBeLessThan(200); // only the open rim at most, not a wireframe
    const tree = edgeCount(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 7)); // 7 sides: ~51 degrees between faces, so just the caps
    expect(tree).toBe(7 * 2 * 2);
  });
  it("outlines never raycast and disposeTree frees them", () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); addOutline(m);
    const line = m.children[0] as THREE.LineSegments; expect(line.raycast).not.toBe(THREE.LineSegments.prototype.raycast);
    let n = 0; line.geometry.addEventListener("dispose", () => n++); (line.material as THREE.Material).addEventListener("dispose", () => n++);
    const root = new THREE.Group(); root.add(m); disposeTree(root);
    expect(n).toBe(2); expect(root.children).toHaveLength(0);
  });
  it("the toon gradient is three nearest-filtered bands", () => {
    const t = makeToonGradient(); expect(t.image.width).toBe(3); expect(t.magFilter).toBe(THREE.NearestFilter);
  });
  it("client-only, no new deps, no shadows added (kept cheap)", () => {
    expect(Object.keys(JSON.parse(src("package.json")).dependencies).sort()).toEqual(["@supabase/supabase-js", "next", "react", "react-dom", "three"]);
    for (const f of ["components/homeScene.ts", "components/marginsScene.ts"]) expect(src(f)).not.toMatch(/castShadow|fetch\(|supabase/);
  });
});
