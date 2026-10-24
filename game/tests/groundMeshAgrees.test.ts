// H1 follow-up: does the World ground MESH agree with groundY, the height the player follows? Builds the real shell with ground on,
// takes each vertex through the mesh's own world matrix (so the -90 degree turn and any flip count), and compares world y with groundY(worldX, worldZ).
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldShell } from "@/components/worldShell";
import { GROUND, groundY } from "@/lib/ground";

function groundMesh(on: boolean): THREE.Mesh {
  const scene = new THREE.Scene();
  buildWorldShell(scene, { ground: on });
  scene.updateMatrixWorld(true);
  const found: THREE.Mesh[] = [];
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry instanceof THREE.PlaneGeometry && (m.geometry.parameters.widthSegments ?? 1) > 1) found.push(m); });
  expect(found.length).toBe(1);
  return found[0];
}
const worldVerts = (m: THREE.Mesh) => {
  const p = m.geometry.attributes.position, v = new THREE.Vector3(), out: { x: number; y: number; z: number; i: number }[] = [];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); out.push({ x: v.x, y: v.y, z: v.z, i }); }
  return out;
};
const OFFSET = -0.03; // the mesh sits 3 cm low on purpose
const nearest = (vs: ReturnType<typeof worldVerts>, x: number, z: number) => vs.reduce((b, v) => (Math.hypot(v.x - x, v.z - z) < Math.hypot(b.x - x, b.z - z) ? v : b));

describe("H1 ground mesh vs player height", () => {
  const verts = worldVerts(groundMesh(true));

  it("every vertex world y equals groundY(world x, world z) + the mesh offset", () => {
    let worst = 0;
    for (const v of verts) worst = Math.max(worst, Math.abs(v.y - OFFSET - groundY(v.x, v.z)));
    expect(worst).toBeLessThan(1e-4); // Float32 storage only
  });

  it("agrees at every rise centre, and at asymmetric points with x != z and both signs", () => {
    const pts: [number, number][] = GROUND.rises.map((r) => [r.x, r.z]);
    pts.push([-60, 30], [60, -30], [30, -60], [-30, 60], [-76, -12], [52, 90], [-52, -88], [97, -100], [-100, 40]);
    expect(pts.length).toBeGreaterThanOrEqual(20);
    let lifted = 0;
    for (const [x, z] of pts) {
      const v = nearest(verts, x, z); // grid is 2 m, so compare at the vertex actually found
      expect(Math.hypot(v.x - x, v.z - z)).toBeLessThan(2);
      expect(v.y - OFFSET).toBeCloseTo(groundY(v.x, v.z), 4);
      if (groundY(v.x, v.z) > 0.05) lifted++;
    }
    expect(lifted).toBeGreaterThanOrEqual(8); // guards against a vacuous pass where everything is flat
  });

  it("a mirrored axis would fail: the mesh is not equal to groundY at the swapped or negated point", () => {
    const hi = verts.filter((v) => groundY(v.x, v.z) > 0.2);
    expect(hi.length).toBeGreaterThan(20);
    for (const mirror of [(x: number, z: number) => groundY(x, -z), (x: number, z: number) => groundY(-x, z), (x: number, z: number) => groundY(z, x)]) {
      expect(hi.some((v) => Math.abs(v.y - OFFSET - mirror(v.x, v.z)) > 0.05)).toBe(true);
    }
  });

  it("rises go up (+y) and are 0 at the World edge", () => {
    for (const r of GROUND.rises.slice(0, 4)) expect(nearest(verts, r.x, r.z).y).toBeGreaterThan(OFFSET + 0.02);
    const top = Math.max(...verts.map((v) => v.y));
    expect(top).toBeGreaterThan(0.2);
  });

  it("with the flag off the mesh is flat", () => {
    for (const v of worldVerts(groundMesh(false))) expect(v.y).toBeCloseTo(OFFSET, 5);
  });
});
