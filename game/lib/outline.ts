import * as THREE from "three";
import { PALETTE } from "@/lib/palette";

// S26: a hand-drawn-style ink outline. Only creases sharper than OUTLINE_ANGLE degrees are drawn, so
// flat-sided meshes (boxes, hedges, cone/cylinder caps) get a clean edge while smooth meshes (spheres,
// capsules, the egg) draw nothing across their curved faces. Look only: never raycast, no collision.
export const OUTLINE_ANGLE = 60;

export function addOutline(mesh: THREE.Mesh, color: number | string = PALETTE.ink): void {
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, OUTLINE_ANGLE),
    new THREE.LineBasicMaterial({ color }),
  );
  edge.raycast = () => {};
  mesh.add(edge);
}

// Frees every geometry and material under `root` (meshes and their outline LineSegments), then empties it.
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh | THREE.LineSegments;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
  root.clear();
}
