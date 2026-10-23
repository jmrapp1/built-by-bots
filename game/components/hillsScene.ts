// S31c: layered distant hills. A few opaque, smooth ridge rings that follow the player's x/z. Look only: no collider, no raycast, and plain
// opaque materials (so nothing here can be sorted over the world), depth-written like the old ridges; fog is off because they
// stand beyond the fog's far edge and take their own colour from the hour's sky. Freed whole by dispose().
import * as THREE from "three";
import { HILLS, type Haze, hillColor, hillLayers, hillTop } from "@/lib/sky";

export type Hills = {
  group: THREE.Group;
  /** Follow the player. */
  update(x: number, z: number): void;
  /** Re-tint every layer from the current sky colour. */
  setSky(c: THREE.ColorRepresentation, haze?: Haze | null): void;
  dispose(): void;
};

export function buildHills(parent: THREE.Object3D): Hills {
  const group = new THREE.Group(), owned: { dispose(): void }[] = [], mats: THREE.MeshBasicMaterial[] = [], layers = hillLayers();
  group.name = "hills";
  for (const l of layers) {
    const seg = HILLS.segments, pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, x = Math.cos(a) * l.radius, z = Math.sin(a) * l.radius;
      pos.push(x, HILLS.bottom, z, x, hillTop(l, a), z);
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color: l.tint, side: THREE.DoubleSide, fog: false }); // opaque, depth-tested and depth-written
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false; mesh.raycast = () => {};
    group.add(mesh); owned.push(geo, m); mats.push(m);
  }
  parent.add(group);
  return {
    group,
    update(x, z) { group.position.set(x, 0, z); },
    setSky(c, haze) { const s = "#" + new THREE.Color(c).getHexString(); layers.forEach((l, i) => mats[i].color.set(hillColor(s, l, haze))); },
    dispose() { parent.remove(group); for (const o of owned) o.dispose(); },
  };
}
