import * as THREE from "three";
import { toonGradientData } from "@/lib/palette";

// S26b: the shared 3-band ink toon gradient for scenes outside World.tsx. Each caller owns (and disposes) its own texture.
export function makeToonGradient(): THREE.DataTexture {
  const t = new THREE.DataTexture(toonGradientData(), 3, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
