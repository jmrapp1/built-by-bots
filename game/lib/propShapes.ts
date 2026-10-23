import * as THREE from "three";
import { lathe, softBox, wobbleSphere } from "@/lib/shapes";

/** S29 prop builders on top of lib/shapes.ts. Pure geometry, deterministic (seeds come from ids, no random source). Each keeps the bounding size of the primitive it replaces. */

/** Outline crease angle for rounded boxes: their corners are two ~45 degree steps the default 60 would skip. */
export const PROP_EDGE_ANGLE = 40;

/** FNV-1a: a small stable seed from a string. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Tilt about Z around the base centre (the base stays put, the top moves). */
function leanFromBase(g: THREE.BufferGeometry, degrees: number): THREE.BufferGeometry {
  if (!degrees) return g;
  g.computeBoundingBox();
  const base = g.boundingBox!.min.y;
  g.translate(0, -base, 0); g.rotateZ((-degrees * Math.PI) / 180); g.translate(0, base, 0);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** A door or gate post: rounded box, optionally leaning (degrees, from its base). Height stays `h`. */
export function postGeo(w: number, h: number, d: number, lean = 0, radius = 0.04): THREE.BufferGeometry {
  return leanFromBase(softBox(w, h, d, radius, 2), lean);
}

/** A lintel: a rounded box. */
export function lintelGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return softBox(w, h, d, Math.min(0.05, h * 0.25), 1);
}

/** Lower the right end of a lintel by `amount` (a hand-set beam that sags a little). Size grows by `amount` at most. */
export function dipEnds(g: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, (pos.getX(i) - min.x) / Math.max(1e-6, max.x - min.x) - 0.5) * 2;
    pos.setY(i, pos.getY(i) - amount * t);
  }
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** A post cap: a lathed drum with a small lip, w x h x d like the box it replaces. */
export function capGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const y = h / 2, e = h * 0.3;
  const g = lathe([[0, -y], [0.85, -y], [1, -y + e], [1, y - e * 1.4], [0.8, y], [0, y]], 16);
  g.scale(w / 2, 1, d / 2);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** Decor box: rounded, radius a quarter of the smallest side. */
export function decorBox(w: number, h: number, d: number): THREE.BufferGeometry {
  return softBox(w, h, d, Math.min(w, h, d) * 0.25, 2);
}

/** Decor cylinder (radius top, radius bottom, height): rounded rims. */
export function decorCyl(rt: number, rb: number, h: number): THREE.BufferGeometry {
  const y = h / 2, e = Math.min(0.02, h * 0.15, Math.max(rt, rb) * 0.4);
  const pts: Array<[number, number]> = [[0, -y]];
  if (rb > e) pts.push([rb - e, -y]);
  pts.push([rb, -y + e], [rt, y - e]);
  if (rt > e) pts.push([rt - e, y]);
  pts.push([0, y]);
  return lathe(pts, 16);
}

/** Decor sphere: a very light wobble (4 percent), seeded from `key`. */
export function decorSphere(r: number, key: string): THREE.BufferGeometry {
  return wobbleSphere(r, 0.04, seedOf(key), 14);
}
