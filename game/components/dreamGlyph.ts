// S24: the dream glyph as one small plane with a shared ink atlas (the S23 marks, pale ink, clear ground).
// Look only: never raycast, no collision, nothing saved. Hidden (not updated) unless there is something to show.
import * as THREE from "three";
import { atlas } from "@/components/glyphScraps";
import { GLYPH_IDS } from "@/lib/scraps";
import { DREAM, type Dream } from "@/lib/dream";

export type DreamGlyph = {
  mesh: THREE.Mesh;
  /** at: where the Print sleeps. level: 0..1 fade on waking. Hides the plane when nothing shows. */
  update(d: Dream, level: number, at: { x: number; y: number; z: number }, camera: THREE.Camera): void;
  dispose(): void;
};

export function buildDreamGlyph(scene: THREE.Scene): DreamGlyph {
  const n = GLYPH_IDS.length;
  const tex = atlas(false, DREAM.ink);
  tex.repeat.set(1 / n, 1);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(DREAM.size);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.raycast = () => {}; // never a target for a click
  scene.add(mesh);
  return {
    mesh,
    update(d, level, at, camera) {
      const o = d.opacity * level;
      if (o <= 0.001) { mesh.visible = false; return; }
      tex.offset.x = d.glyph / n;
      mat.opacity = o;
      mesh.position.set(at.x + d.x, at.y + d.y, at.z);
      mesh.quaternion.copy(camera.quaternion); // faces the camera
      mesh.visible = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
