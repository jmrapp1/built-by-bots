// The six keepsakes as three.js shapes (slice 6d-1). Procedural only: no assets, no text. Each is built around its
// own origin (the anchor point) with fixed colours, so it reads on every Print. Materials are made fresh for each
// keepsake so one can fade without touching another.
import * as THREE from "three";
import { placementFor } from "@/lib/cosmetics";

const toon = (color: number | string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, ...extra });
const INK = 0x1b1b2a;

function leafSprig(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.22, 6), toon(0x4f7a5a));
  stem.position.y = 0.11; stem.rotation.z = -0.15;
  g.add(stem);
  for (const [side, tilt] of [[-1, 0.7], [1, -0.7]] as const) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), toon(side < 0 ? 0x6faa7f : 0x5e9c76));
    leaf.scale.set(0.11, 0.028, 0.06);
    leaf.position.set(side * 0.085, 0.2, 0);
    leaf.rotation.z = tilt;
    g.add(leaf);
  }
  return g;
}

function ribbon(spread: number): THREE.Group {
  const g = new THREE.Group();
  const red = toon(0xd9606b), dark = toon(0xb94755);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark);
  g.add(knot);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 14), red);
    loop.scale.set(1, 0.8, 0.6);
    loop.position.set(side * 0.095 * spread, 0, 0);
    g.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.02), red);
    tail.position.set(side * 0.04, -0.1, 0);
    tail.rotation.z = side * 0.3;
    g.add(tail);
  }
  return g;
}

function inkCheeks(spread: number): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0x2f3a78, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), m);
    dot.position.set(side * 0.34 * spread, 0, 0);
    dot.rotation.y = side * 0.62 * Math.min(1, spread); // follows the curve of the face
    dot.scale.set(1, 0.8, 1);
    g.add(dot);
  }
  return g;
}

function paperCrown(): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.1, 14, 1, true), toon(0xf1dfae, { side: THREE.DoubleSide }));
  g.add(band);
  const pt = toon(0xfffaf0, { side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 3), pt);
    tip.position.set(Math.cos(a) * 0.29, 0.13, Math.sin(a) * 0.29);
    tip.rotation.y = -a;
    g.add(tip);
  }
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 24), toon(0xd9c28a));
  edge.rotation.x = Math.PI / 2; edge.position.y = -0.05;
  g.add(edge);
  return g;
}

function scarf(): THREE.Group {
  const g = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.075, 8, 28), toon(0xe0764f));
  wrap.rotation.x = Math.PI / 2;
  g.add(wrap);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.05), toon(0xcf6540));
  tail.position.set(0.22, -0.17, 0.52);
  tail.rotation.z = 0.15;
  g.add(tail);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.04, 0.055), toon(0xfffaf0));
  stripe.position.set(0.225, -0.2, 0.525);
  stripe.rotation.z = 0.15;
  g.add(stripe);
  return g;
}

function lantern(): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), toon(INK));
  cord.position.y = -0.1;
  g.add(cord);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.13, 10), toon(0xf4c15a, { emissive: 0x7a4a10, emissiveIntensity: 0.25 }));
  body.position.y = -0.27;
  const cap = toon(INK);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.03, 10), cap), bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.03, 10), cap);
  top.position.y = -0.195; bottom.position.y = -0.345;
  g.add(body, top, bottom);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = -0.27;
  glow.name = "glow";
  g.add(glow);
  return g;
}

// A keepsake already placed on the body of this species and shape, or null for an unknown id.
export function buildCosmetic(id: string | null | undefined, species: string, shape: string): THREE.Group | null {
  const p = placementFor(id, species, shape);
  if (!p) return null;
  let inner: THREE.Group;
  switch (id) {
    case "leaf_sprig": inner = leafSprig(); break;
    case "ribbon": inner = ribbon(p.spread); break;
    case "ink_cheeks": inner = inkCheeks(p.spread); break;
    case "paper_crown": inner = paperCrown(); break;
    case "scarf": inner = scarf(); break;
    case "lantern": inner = lantern(); break;
    default: return null;
  }
  const holder = new THREE.Group();
  holder.add(inner);
  inner.scale.set(p.scale, p.scale, p.scale * p.flat);
  holder.position.set(...p.pos);
  holder.rotation.y = p.rotY;
  holder.userData.cosmetic = id;
  holder.userData.inner = inner;
  return holder;
}

// Show a keepsake at a scale and opacity. Used by the put-on motion.
export function poseCosmetic(h: THREE.Group, scale: number, opacity: number, glow: number): void {
  const inner = h.userData.inner as THREE.Group;
  inner.visible = scale > 0.002 && opacity > 0.002;
  const s = Math.max(0.0001, scale);
  const base = h.userData.baseScale ?? (h.userData.baseScale = inner.scale.clone());
  inner.scale.set(base.x * s, base.y * s, base.z * s);
  h.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || o.name === "glow") return;
    m.transparent = true; m.opacity = opacity;
  });
  const gl = h.getObjectByName("glow") as THREE.Mesh | undefined;
  if (gl) (gl.material as THREE.MeshBasicMaterial).opacity = glow * opacity * 0.5;
}

export function disposeCosmetic(h: THREE.Group): void {
  h.removeFromParent();
  h.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose();
  });
}
