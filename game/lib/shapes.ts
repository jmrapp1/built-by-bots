import * as THREE from "three";

/** Shape helpers (see "Shape rule" in README). Pure: geometry only, no material, colour or outline code. */

/** Box with rounded edges. `radius` is clamped so it always fits the box. */
export function softBox(w: number, h: number, d: number, radius: number, segments = 3): THREE.BufferGeometry {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2, d / 2));
  const g = new THREE.BoxGeometry(w, h, d, segments * 2, segments * 2, segments * 2);
  if (r <= 0) return g;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3();
  const core = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    core.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(core);
    if (v.lengthSq() > 0) v.setLength(r);
    pos.setXYZ(i, core.x + v.x, core.y + v.y, core.z + v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Lathe a profile of [radius, height] points around the Y axis. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, segments = 16): THREE.BufferGeometry {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, Math.max(3, Math.floor(segments)));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sphere with each vertex pushed in or out by up to `amount` (fraction of r). Same seed, same shape. */
export function wobbleSphere(r: number, amount: number, seed: number, segments = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, segments, Math.max(2, Math.round(segments * 0.75)));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(seed);
  // Offset by direction, not by vertex index, so the seam (duplicate verts) stays closed.
  const phase = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const k = (Math.sin(n.x * 2.3 + phase[0]) + Math.sin(n.y * 2.7 + phase[1]) + Math.sin(n.z * 2.1 + phase[2])) / 3;
    v.multiplyScalar(1 + amount * k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Tilt a geometry about Z by `degrees` (a leaning prop). Returns the same geometry. */
export function leaning<T extends THREE.BufferGeometry>(geometry: T, degrees: number): T {
  geometry.rotateZ((degrees * Math.PI) / 180);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Smooth a [radius, height] profile with a spline (so a few points read as a curve). Radius never goes below 0. */
export function smoothProfile(profile: ReadonlyArray<readonly [number, number]>, samples = 28): Array<[number, number]> {
  const curve = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(samples).map((p) => [Math.max(0, p.x), p.y] as [number, number]);
}

// Average the normals of vertices that share a position, so a lathe seam or pole shades without a crease.
function weldNormals(g: THREE.BufferGeometry): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const list = groups.get(key);
    if (list) list.push(i); else groups.set(key, [i]);
  }
  const sum = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    sum.set(0, 0, 0);
    for (const i of list) sum.add(new THREE.Vector3().fromBufferAttribute(nor, i));
    sum.normalize();
    for (const i of list) nor.setXYZ(i, sum.x, sum.y, sum.z);
  }
}

/** Push each vertex in or out from the origin by up to `amount` (fraction), by direction, so seams stay closed. Same seed, same shape. */
export function wobble<T extends THREE.BufferGeometry>(g: T, amount: number, seed: number): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(seed);
  const phase = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const k = (Math.sin(n.x * 2.3 + phase[0]) + Math.sin(n.y * 2.7 + phase[1]) + Math.sin(n.z * 2.1 + phase[2])) / 3;
    v.multiplyScalar(1 + amount * k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  weldNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Bend along +X: the higher a vertex, the further it moves (quadratic), by `amount` x the geometry's height. */
export function curl<T extends THREE.BufferGeometry>(g: T, amount: number): T {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const h = Math.max(1e-6, max.y - min.y);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / h;
    pos.setX(i, pos.getX(i) + amount * h * t * t);
  }
  g.computeVertexNormals();
  weldNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
