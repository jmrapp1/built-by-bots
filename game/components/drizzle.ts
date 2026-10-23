// S25: the ink drizzle as one LineSegments object. Look only: never raycast, no collision, nothing saved or sent.
// Hidden (and not updated) when it is dry. Drops live in a box around the player and wrap, so they never pop in or out.
import * as THREE from "three";
import { WEATHER, dropBase, dropY, type DropBase, type Weather } from "@/lib/weather";

export type Drizzle = {
  object: THREE.LineSegments;
  /** w: today's weather. at: the player. print: the Print (drops stay clear of it). Hides itself when there is nothing to show. */
  update(w: Weather, t: number, reduced: boolean, at: { x: number; z: number }, print: { x: number; z: number }): void;
  dispose(): void;
};

export function buildDrizzle(scene: THREE.Scene): Drizzle {
  const D = WEATHER.drops, n = D.count, W = D.halfWidth * 2, clear2 = D.clearAroundPrint * D.clearAroundPrint;
  const bases: DropBase[] = Array.from({ length: n }, (_, i) => dropBase(i));
  const arr = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ color: WEATHER.ink, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const object = new THREE.LineSegments(geo, mat);
  object.visible = false;
  object.frustumCulled = false;
  object.raycast = () => {}; // never a target for a click
  scene.add(object);
  const wrap = (v: number, c: number) => { const r = (v - c + D.halfWidth) % W; return c - D.halfWidth + (r < 0 ? r + W : r); };
  return {
    object,
    update(w, t, reduced, at, print) {
      if (w.opacity <= 0.001 || w.density <= 0) { object.visible = false; return; }
      const shown = Math.max(1, Math.round(n * w.density));
      for (let i = 0; i < shown; i++) {
        const b = bases[i], x = wrap(at.x - D.halfWidth + b.x * W, at.x), z = wrap(at.z - D.halfWidth + b.z * W, at.z);
        const y = dropY(b, t, w.speed, reduced), dx = x - print.x, dz = z - print.z;
        const hide = dx * dx + dz * dz < clear2 && y < D.clearHeight; // clear of the Print's face: the drop collapses to a point
        const len = hide ? 0 : D.streak * (reduced ? D.reducedStreak : 1);
        arr.set([x, y, z, x, y + len, z], i * 6);
      }
      geo.setDrawRange(0, shown * 2);
      geo.attributes.position.needsUpdate = true;
      mat.opacity = w.opacity;
      object.visible = true;
    },
    dispose() { scene.remove(object); geo.dispose(); mat.dispose(); },
  };
}
