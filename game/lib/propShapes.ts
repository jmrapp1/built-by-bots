import * as THREE from "three";
import { curl, lathe, leaning, softBox, wobble, wobbleSphere } from "@/lib/shapes";

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

/** Linear mix. */
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Tree trunk, centred on the origin like CylinderGeometry(rt, rb, h): a flared root that tapers to the top. Widest at the base (rb). */
export function trunkGeo(rt: number, rb: number, h: number, segments = 7): THREE.BufferGeometry {
  const y = h / 2, at = (t: number, k: number) => [mix(rb, rt, k), -y + t * h] as [number, number];
  return lathe([[0, -y], [rb, -y], at(0.14, 0.2), at(0.55, 0.55), [rt, y], [0, y]], segments);
}

/** Tree crown, centred like ConeGeometry(r, h): a concave-sided cone with a seeded wobble (4 percent) and a curled tip (3 percent of h). Base stays flat-ish at -h/2. */
export function crownGeo(r: number, h: number, key: string, segments = 7): THREE.BufferGeometry {
  const y = h / 2;
  const g = lathe([[0, -y], [r, -y], [r * 0.76, -y + 0.3 * h], [r * 0.4, -y + 0.66 * h], [0, y]], segments);
  wobble(g, 0.04, seedOf(key));
  return curl(g, 0.03);
}

/** One stone tier, centred like CylinderGeometry(rt, rb, h): rounded rims and a slight waist. */
export function drumGeo(rt: number, rb: number, h: number, segments = 10): THREE.BufferGeometry {
  const y = h / 2, e = Math.min(0.08, h * 0.12);
  return lathe([[0, -y], [rb * 0.94, -y], [rb, -y + e], [mix(rb, rt, 0.5) * 0.94, 0], [rt, y - e], [rt * 0.94, y], [0, y]], segments);
}

/** An open glow pillar, centred like an open CylinderGeometry(rt, rb, h): a flared foot. Faces outward. */
export function pillarGeo(rt: number, rb: number, h: number, segments = 8): THREE.BufferGeometry {
  const y = h / 2;
  return lathe([[rb, -y], [mix(rb, rt, 0.4), -y + 0.1 * h], [mix(rb, rt, 0.75), 0], [rt, y]], segments);
}

/** Signpost pole, centred like CylinderGeometry(rt, rb, h): a slow taper with a small knob on top (never wider than the foot). */
export function poleGeo(rt: number, rb: number, h: number, segments = 6): THREE.BufferGeometry {
  const y = h / 2;
  return lathe([[0, -y], [rb, -y], [rt, y - 0.12 * h], [rb, y - 0.06 * h], [rt * 0.7, y], [0, y]], segments);
}

/** A thin rounded plate or board, leaning a few degrees about its centre. */
export function plateGeo(w: number, h: number, d: number, lean = 0): THREE.BufferGeometry {
  return leaning(softBox(w, h, d, Math.min(0.06, d / 2, h * 0.15), 1), lean);
}

/** S29c garden props. */

/** Stepped plinth, centred like CylinderGeometry(rt, rb, h): a wide foot, a narrow waist step and a rounded top. */
export function plinthGeo(rt: number, rb: number, h: number, segments = 20): THREE.BufferGeometry {
  const y = h / 2, e = h * 0.12;
  return lathe([[0, -y], [rb * 0.96, -y], [rb, -y + e], [rb, -y + 0.28 * h], [mix(rb, rt, 0.5) * 0.9, -y + 0.34 * h], [rt * 0.94, y - 0.3 * h], [rt, y - e], [rt * 0.96, y], [0, y]], segments);
}

/** Round table, centred like CylinderGeometry(r, r, h): a thick rounded top edge on a slightly narrower pedestal. */
export function tableGeo(r: number, h: number, segments = 20): THREE.BufferGeometry {
  const y = h / 2, e = h * 0.12;
  return lathe([[0, -y], [r * 0.8, -y], [r * 0.9, -y + e], [r * 0.72, -y + 0.3 * h], [r * 0.72, y - 0.3 * h], [r, y - 0.28 * h], [r, y - e], [r * 0.94, y], [0, y]], segments);
}

/** An ink pot, centred like CylinderGeometry(rt, rb, h): round belly, short neck, lipped rim, tipped `lean` degrees about its base. */
export function inkwellGeo(rt: number, rb: number, h: number, lean = 0, segments = 14): THREE.BufferGeometry {
  const y = h / 2, w = Math.max(rt, rb);
  const g = lathe([[0, -y], [rb * 0.8, -y], [w, -y + 0.2 * h], [w * 0.92, -y + 0.55 * h], [rt * 0.7, -y + 0.78 * h], [rt, y - 0.08 * h], [rt, y], [rt * 0.6, y], [0, y - 0.1 * h]], segments);
  return leanFromBase(g, lean);
}

/** Garden hedge: a soft, slightly wobbled block (4 percent, seeded from `key`) of the old box size. */
export function hedgeGeo(w: number, h: number, d: number, key: string): THREE.BufferGeometry {
  return wobble(softBox(w, h, d, Math.min(0.2, w * 0.4, d * 0.4), 3), 0.04, seedOf(key));
}

/** A small cushion with a dent in the top middle (pushed down by `dent`). */
export function pillowGeo(w: number, h: number, d: number, dent = 0.025): THREE.BufferGeometry {
  const g = softBox(w, h, d, 0.07, 2), p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < h * 0.4) continue;
    const k = Math.max(0, 1 - Math.hypot(p.getX(i) / (w * 0.35), p.getZ(i) / (d * 0.35)));
    p.setY(i, p.getY(i) - dent * k);
  }
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** A page lying flat with its far edge curled up (0.1 of its thickness scale, see curl). */
export function pageGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return curl(softBox(w, h, d, Math.min(0.015, h * 0.4), 1), 0.1);
}

/** Garden bench lump: a wobbly sphere of radius r (seeded from `key`), scaled by the caller. */
export function blotGeo(r: number, amount: number, key: string): THREE.BufferGeometry {
  return wobbleSphere(r, amount, seedOf(key), 18);
}

/** S30 room wall slab, centred like BoxGeometry(w, h, d): rounded edges (r 0.03) and a slight bow in the thin direction along its long side (zero at both ends, so corners still meet). `bow` is the peak push (positive = +thin axis); `lean` tilts the top (degrees, about its base). */
export function wallGeo(w: number, h: number, d: number, bow = 0.03, lean = 0): THREE.BufferGeometry {
  const g = softBox(w, h, d, 0.03, 3), p = g.attributes.position as THREE.BufferAttribute;
  const alongX = w >= d, len = alongX ? w : d;
  if (bow) {
    for (let i = 0; i < p.count; i++) {
      const u = ((alongX ? p.getX(i) : p.getZ(i)) + len / 2) / len, k = bow * Math.sin(Math.PI * u);
      if (alongX) p.setZ(i, p.getZ(i) + k); else p.setX(i, p.getX(i) + k);
    }
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  }
  return leanFromBase(g, lean);
}

/** S30 baseboard strip: a thin rounded slab whose right end dips into the floor by 0.01 (a hand-laid strip). */
export function baseboardGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return dipEnds(softBox(w, h, d, 0.02, 2), 0.01);
}

/** S30b shell landmark shapes. Unit shapes sit on y=0 and rise to y=1; the landmark scales them per instance. */

/** Unit box (1x1x1, base on y=0) with tiny rounded edges. */
export function unitBoxGeo(): THREE.BufferGeometry { return softBox(1, 1, 1, 0.03, 1).translate(0, 0.5, 0); }

/** Unit 4-sided cone (radius 1, height 1, base on y=0) with concave sides; the tip bends by `bend` (fraction of height). */
export function unitConeGeo(bend = 0): THREE.BufferGeometry {
  const g = lathe([[0, 0], [1, 0], [0.55, 0.4], [0.22, 0.75], [0, 1]], 4);
  return bend ? curl(g, bend) : g;
}

/** Unit 8-sided cylinder (radius 1, height 1, base on y=0) with rounded rims. */
export function unitCylGeo(): THREE.BufferGeometry { return lathe([[0, 0], [0.9, 0], [1, 0.03], [1, 0.97], [0.9, 1], [0, 1]], 8); }

/** Unit tree trunk (radius 1 at the foot, height 1, base on y=0): flared root, taper to 0.5 at the top. */
export function unitTrunkGeo(): THREE.BufferGeometry { return trunkGeo(0.5, 1, 1, 8).translate(0, 0.5, 0); }

/** Unit tree crown (radius 1, height 1, base on y=0), seeded by `key` so no two alike. */
export function unitCrownGeo(key: string): THREE.BufferGeometry { return crownGeo(1, 1, key, 7).translate(0, 0.5, 0); }

/** Unit hill mound (radius 1, height 1, base on y=0): a smooth bump with a seeded wobble. */
export function moundGeo(key: string): THREE.BufferGeometry {
  const g = lathe([[0, 1], [0.18, 0.97], [0.45, 0.8], [0.72, 0.45], [0.92, 0.15], [1, 0]], 10);
  return wobble(g, 0.05, seedOf(key));
}

/** Unit hanging tail (0.08 wide, 1 long, hangs from y=0 down to y=-1): a thin strip whose end curls. */
export function tailGeo(): THREE.BufferGeometry { return curl(softBox(0.08, 1, 0.03, 0.01, 1).translate(0, -0.5, 0), 0.12); }

/** The Margins arch: a half-ring tube swept along a half circle of radius `s` with a width that varies, the left foot a touch lower. Not a torus. Spans x in [-s, s], y in [0, s] (feet at y=0, the left foot reaching 0.06 lower). */
export function archGeo(s: number, tube = 0.09): THREE.BufferGeometry {
  const N = 28, M = 6, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI, w = tube * (0.88 + 0.24 * Math.sin(th * 3 + 1)), drop = 0.06 * Math.pow(Math.max(0, (th - 2.4) / (Math.PI - 2.4)), 2);
    const cx = Math.cos(th), cy = Math.sin(th);
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2, rr = Math.cos(a) * w, zz = Math.sin(a) * w * 1.1;
      pos.push((s + rr) * cx, (s + rr) * cy - drop, zz);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** The torn paper under the arch: a half-disc fan of radius `s` (xy plane, flat side on y=0) with a ragged rim and one notch. Seeded by `key`. Double-sided material expected. */
export function tornSheetGeo(s: number, key: string): THREE.BufferGeometry {
  const N = 20, seed = seedOf(key), notch = 6 + (seed % 7), pos: number[] = [0, 0, 0], idx: number[] = [];
  const rnd = (i: number) => { const v = Math.sin((i + (seed % 1000)) * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI;
    let r = s * (0.94 + 0.06 * rnd(i));
    if (Math.abs(i - notch) <= 1) r *= i === notch ? 0.86 : 0.93;
    pos.push(r * Math.cos(th), r * Math.sin(th), 0);
  }
  for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
