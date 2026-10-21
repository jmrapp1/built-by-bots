// W2: the rendered World round the garden: streamed, instanced chunks, an inked path, tall landmarks and paper-fold horizons.
// A shell is built when the player is in the garden zone and fully disposed when they leave it (same path as every zone).
import * as THREE from "three";
import type { Circle } from "@/lib/world";
import { SIGNPOSTS, type Signpost } from "@/lib/map";
import {
  CHUNKS, HALF, TREE_R, WORLD, chunkBounds, chunkCircles, chunkContents, chunkKey, chunkOf, chunksAround, nearbyCircles, pathPoints,
  type Contents, type RegionId,
} from "@/lib/worldMap";

type Chunk = { g: THREE.Group; ims: THREE.InstancedMesh[]; inst: number; extra: THREE.Object3D[] };
export type ShellStats = { chunks: number; instances: number; builds: number; drops: number };
export type WorldShell = {
  /** Stream chunks round the player. `all` builds everything wanted this call (first call), otherwise at most buildsPerFrame. */
  update(x: number, z: number, all?: boolean): void;
  /** Collision circles close to a point (pure data, so correct even for chunks not drawn yet). */
  circlesNear(x: number, z: number, reach: number): Circle[];
  setSky(c: THREE.ColorRepresentation): void;
  stats(): ShellStats;
  dispose(): void;
};

const mats = (look: { crown: string; trunk: string; rock: string; bush: string }) => ({
  trunk: new THREE.MeshToonMaterial({ color: look.trunk }), crown: new THREE.MeshToonMaterial({ color: look.crown }),
  rock: new THREE.MeshToonMaterial({ color: look.rock }), bush: new THREE.MeshToonMaterial({ color: look.bush }),
});

export function buildWorldShell(scene: THREE.Scene): WorldShell {
  const group = new THREE.Group(); group.name = "world-shell"; scene.add(group);
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };

  // ---- shared geometry (made once, never per chunk) ----
  const G = {
    trunk: keep(new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6).translate(0, 1.3, 0)),
    crownLow: keep(new THREE.ConeGeometry(1.6, 2.6, 7).translate(0, 3.2, 0)),
    crownHigh: keep(new THREE.ConeGeometry(1.05, 2.2, 7).translate(0, 4.6, 0)),
    rock: keep(new THREE.DodecahedronGeometry(0.7, 0).translate(0, 0.3, 0)),
    bush: keep(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.45, 0)),
    box: keep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    cone: keep(new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0)),
    cyl: keep(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)),
    lamp: keep(new THREE.IcosahedronGeometry(1, 1)),
  };
  const M: Record<RegionId, ReturnType<typeof mats>> = { meadow: mats(WORLD.look.meadow), inkwood: mats(WORLD.look.inkwood) };
  for (const r of ["meadow", "inkwood"] as const) Object.values(M[r]).forEach((m) => keep(m));
  const L = {
    paper: keep(new THREE.MeshToonMaterial({ color: "#f1dfae" })), ink: keep(new THREE.MeshToonMaterial({ color: "#2a2438" })),
    red: keep(new THREE.MeshToonMaterial({ color: "#d9606b" })), leaf: keep(new THREE.MeshToonMaterial({ color: WORLD.look.inkwood.crown })),
    glow: keep(new THREE.MeshBasicMaterial({ color: "#ffd98a" })),
  };

  // ---- ground: a soft blend from meadow to inkwood, plus a plain skirt beyond the edge ----
  const SEG = 32;
  const gg = keep(new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG));
  { // vertex colours: meadow in the south, inkwood in the north, blended over a band round the region edge
    const pos = gg.attributes.position, col: number[] = [], a = new THREE.Color(WORLD.look.meadow.ground), b = new THREE.Color(WORLD.look.inkwood.ground), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const wz = -pos.getY(i); c.copy(a).lerp(b, Math.min(1, Math.max(0, (WORLD.inkwoodZ + 14 - wz) / 28))); col.push(c.r, c.g, c.b); }
    gg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  }
  const ground = new THREE.Mesh(gg, keep(new THREE.MeshToonMaterial({ vertexColors: true })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; group.add(ground);
  const skirt = new THREE.Mesh(keep(new THREE.PlaneGeometry(WORLD.size + 900, WORLD.size + 900)), keep(new THREE.MeshToonMaterial({ color: WORLD.look.meadow.ground })));
  skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.06; group.add(skirt);

  // ---- the inked path: a flat ribbon along the same curve the keep-out uses ----
  { const P = pathPoints(), pos: number[] = [], idx: number[] = [], w = WORLD.path.width / 2;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const wob = 0.15 * Math.sin(i * 0.9); // a hand-inked edge
      pos.push(P[i].x - dz * (w + wob), 0.03, P[i].z + dx * (w + wob), P[i].x + dz * (w - wob), 0.03, P[i].z - dx * (w - wob));
      if (i < P.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = keep(new THREE.BufferGeometry()); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ color: WORLD.look.path, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
    m.frustumCulled = false; group.add(m);
  }

  // ---- W4: picture signposts (a leaf, a book, a moon; no words). A few small meshes each, made once with the shell and freed with it. ----
  { const wood = keep(new THREE.MeshToonMaterial({ color: "#6b5a44" })), board = keep(new THREE.MeshToonMaterial({ color: "#f1dfae" }));
    const green = keep(new THREE.MeshToonMaterial({ color: "#5e9c76" })), inkM = L.ink, gold = keep(new THREE.MeshToonMaterial({ color: "#e3b64f" }));
    const pole = keep(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6).translate(0, 0.95, 0)), plate = keep(new THREE.BoxGeometry(0.9, 0.7, 0.07));
    const leaf = keep(new THREE.SphereGeometry(0.26, 8, 6).scale(0.55, 1, 0.25)), page = keep(new THREE.BoxGeometry(0.26, 0.36, 0.03));
    const stem = keep(new THREE.BoxGeometry(0.03, 0.3, 0.02)), moon = keep(new THREE.TorusGeometry(0.22, 0.06, 6, 14, Math.PI * 1.45));
    const sign = (sp: Signpost) => {
      const g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); g.rotation.y = sp.yaw; // the board faces along +z of the group
      g.add(new THREE.Mesh(pole, wood));
      const b = new THREE.Mesh(plate, board); b.position.y = 1.6; g.add(b);
      const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, 1.6 + y, 0.06); o.rotation.z = rz; g.add(o); return o; };
      if (sp.icon === "leaf") { put(leaf, green, 0, 0, 0.5); put(stem, inkM, 0.02, -0.04, 0.5); }
      else if (sp.icon === "book") { put(page, inkM, -0.15, 0, 0.12); put(page, gold, 0.15, 0, -0.12); }
      else put(moon, gold, 0, 0, 2.2);
      group.add(g); return g;
    };
    for (const sp of SIGNPOSTS) sign(sp);
  }

  // ---- paper-fold horizons: three jagged ridge rings that follow the player; fogged, tinted from the sky ----
  const ridges: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const seg = 160, pos: number[] = [], idx: number[] = [], R = WORLD.fog[1] * (0.9 + k * 0.04);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, h = 12 + k * 6 + 8 * Math.abs(Math.sin(a * (3 + k) + k)) + 4 * Math.sin(a * 11 + k * 2); // fold-like peaks
      pos.push(Math.cos(a) * R, -0.5, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
      if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = keep(new THREE.BufferGeometry()); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ color: "#d8d4c4", side: THREE.DoubleSide })));
    m.frustumCulled = false; group.add(m); ridges.push(m);
  }
  const sky = new THREE.Color("#f6f1e4");
  const setSky = (c: THREE.ColorRepresentation) => { sky.set(c); ridges.forEach((m, k) => (m.material as THREE.MeshBasicMaterial).color.copy(sky).multiplyScalar(0.8 + k * 0.06)); };

  // ---- chunks ----
  const chunks = new Map<string, Chunk>();
  const cache = new Map<string, Circle[]>(); // collision circles per chunk (pure data; bounded to the chunks near the player)
  const st: ShellStats = { chunks: 0, instances: 0, builds: 0, drops: 0 };
  const tmp = new THREE.Object3D();
  const circlesOf = (a: number, b: number): Circle[] => { const k = chunkKey(a, b); let v = cache.get(k); if (!v) { v = chunkCircles(chunkContents(a, b)); cache.set(k, v); } return v; };

  const landmark = (l: Contents["landmarks"][number]): THREE.Object3D => {
    const g = new THREE.Group(); g.position.set(l.x, 0, l.z);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, y = 0, rotY = 0) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.y = y; m.rotation.y = rotY; g.add(m); return m; };
    if (l.kind === "tower") { // the Page Tower: a stack of pages with an ink band and a red cap
      add(G.box, L.paper, l.r * 2, l.h * 0.78, l.r * 2); add(G.box, L.ink, l.r * 2.15, 0.9, l.r * 2.15, l.h * 0.5); add(G.box, L.ink, l.r * 2.15, 0.9, l.r * 2.15, l.h * 0.22);
      add(G.cone, L.red, l.r * 3, l.h * 0.26, l.r * 3, l.h * 0.78, Math.PI / 4);
    } else if (l.kind === "spire") { // the Bookmark Spire: a thin ribbon-like spike
      add(G.cone, L.red, l.r * 1.6, l.h, l.r * 0.5); add(G.cone, L.ink, l.r * 0.5, l.h * 0.98, l.r * 1.6);
    } else if (l.kind === "bigtree") { // the Great Ink Tree
      add(G.cyl, L.ink, l.r * 0.7, l.h * 0.4, l.r * 0.7);
      for (const [y, s] of [[0.3, 3.4], [0.5, 2.6], [0.68, 1.8], [0.84, 1]] as const) add(G.cone, L.leaf, l.r * s, l.h * 0.3, l.r * s, l.h * y, 0.3 * s);
    } else { // the Lantern Post: a pole with a warm light that reads through fog
      add(G.cyl, L.ink, l.r * 0.28, l.h * 0.9, l.r * 0.28); const lamp = add(G.lamp, L.glow, l.r * 1.3, l.r * 1.3, l.r * 1.3, l.h * 0.94);
      lamp.castShadow = false;
    }
    return g;
  };

  const build = (ix: number, iz: number) => {
    const c = chunkContents(ix, iz), g = new THREE.Group(), ims: THREE.InstancedMesh[] = [], extra: THREE.Object3D[] = [], m = M[c.region];
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; z: number; s: number; r: number }[], sy = 1) => {
      if (!items.length) return;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => { tmp.position.set(it.x, 0, it.z); tmp.rotation.set(0, it.r, 0); tmp.scale.set(it.s, it.s * sy, it.s); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); // so each chunk is culled on its own
      g.add(im); ims.push(im);
    };
    make(G.trunk, m.trunk, c.trees); make(G.crownLow, m.crown, c.trees); make(G.crownHigh, m.crown, c.trees);
    make(G.rock, m.rock, c.rocks); make(G.bush, m.bush, c.bushes);
    for (const l of c.landmarks) { const o = landmark(l); g.add(o); extra.push(o); }
    group.add(g);
    const inst = c.trees.length * 3 + c.rocks.length + c.bushes.length + c.landmarks.length;
    chunks.set(chunkKey(ix, iz), { g, ims, inst, extra }); st.chunks++; st.instances += inst; st.builds++;
  };
  const drop = (key: string) => {
    const c = chunks.get(key); if (!c) return;
    group.remove(c.g);
    for (const im of c.ims) im.dispose(); // frees the instance buffers; shared geometry and materials stay until the shell goes
    chunks.delete(key); st.chunks--; st.instances -= c.inst; st.drops++;
  };

  const update = (x: number, z: number, all = false) => {
    ridges.forEach((m) => m.position.set(x, 0, z));
    const want = chunksAround(x, z, WORLD.fog[1] + WORLD.chunk * 0.5), keep2 = new Set(want.map(([a, b]) => chunkKey(a, b)));
    let made = 0;
    for (const [a, b] of want) { if (!all && made >= WORLD.buildsPerFrame) break; const k = chunkKey(a, b); if (!chunks.has(k)) { build(a, b); made++; } }
    const far = new Set(chunksAround(x, z, WORLD.fog[1] + WORLD.chunk * 2).map(([a, b]) => chunkKey(a, b)));
    for (const k of [...chunks.keys()]) if (!keep2.has(k) && !far.has(k)) drop(k);
    if (cache.size > 40) for (const k of [...cache.keys()]) if (!far.has(k)) cache.delete(k); // collision data kept only for chunks near the player
  };

  return {
    update,
    circlesNear(x, z, reach) {
      const ix = chunkOf(x), iz = chunkOf(z), out: Circle[] = [];
      for (const c of nearbyCircles(ix, iz, circlesOf)) if (Math.abs(c.x - x) < reach + c.r && Math.abs(c.z - z) < reach + c.r) out.push(c);
      return out;
    },
    setSky,
    stats: () => ({ ...st }),
    dispose() {
      for (const k of [...chunks.keys()]) drop(k);
      scene.remove(group);
      for (const d of own) d.dispose();
      own.length = 0; cache.clear();
    },
  };
}
export const SHELL_CONSTANTS = { TREE_R, HALF, CHUNKS, chunkBounds }; // referenced by tests so the shell and the pure map cannot drift apart
