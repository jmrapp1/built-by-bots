import * as THREE from "three";
import { PALETTE } from "@/lib/palette";

// S26: a hand-drawn-style ink outline. Only creases sharper than OUTLINE_ANGLE degrees are drawn, so
// flat-sided meshes (boxes, hedges, cone/cylinder caps) get a clean edge while smooth meshes (spheres,
// capsules, the egg) draw nothing across their curved faces. Look only: never raycast, no collision.
export const OUTLINE_ANGLE = 60;

// `angle` is lowered (to about 40) for rounded boxes, whose corners are two ~45 degree steps that the default would skip.
export function addOutline(mesh: THREE.Mesh, color: number | string = PALETTE.ink, angle: number = OUTLINE_ANGLE): void {
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, angle),
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
