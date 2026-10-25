// W2: the rendered World round the garden: streamed, instanced chunks, an inked path, tall landmarks and paper-fold horizons.
// A shell is built when the player is in the garden zone and fully disposed when they leave it (same path as every zone).
import { crownGeo, moundGeo, plateGeo, poleGeo, seedOf, tailGeo, trunkGeo, unitBoxGeo, unitConeGeo, unitCrownGeo, unitCylGeo, unitTrunkGeo } from "@/lib/propShapes";
import { lathe, wobbleSphere } from "@/lib/shapes";
import * as THREE from "three";
import type { Haze } from "@/lib/sky";
import { buildHills } from "@/components/hillsScene";
import type { Box, Circle } from "@/lib/world";
import { SIGNPOSTS, type Signpost } from "@/lib/map";
import { groundY } from "@/lib/ground";
import { INK, homeEase, regionInk } from "@/lib/groundInk";
import { applyInk } from "@/components/groundInkShader";
import { FEATURES, HEDGES, buildHedges, featureCircles, featureInstanceCount, featureItemsInChunk, hedgeBoxes, hedgePiecesInChunk, hedgeTouches, propCircles, propItemsInChunk } from "@/lib/features";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BUSH_R, CHUNKS, HALF, ROCK_R, TREE_R, WORLD, chunkBounds, chunkCircles, chunkContents, chunkKey, chunkOf, chunksAround, nearbyCircles, pathPoints,
  type Contents, type RegionId,
} from "@/lib/worldMap";

type Chunk = { g: THREE.Group; ims: THREE.InstancedMesh[]; inst: number; extra: THREE.Object3D[] };
export type ShellStats = { chunks: number; instances: number; builds: number; drops: number };
export type WorldShell = {
  /** Stream chunks round the player. `all` builds everything wanted this call (first call), otherwise at most buildsPerFrame. */
  update(x: number, z: number, all?: boolean): void;
  /** Collision circles close to a point (pure data, so correct even for chunks not drawn yet). */
  circlesNear(x: number, z: number, reach: number): Circle[];
  /** E4: hedgerow boxes close to a point (empty with the features off). */
  boxesNear(x: number, z: number, reach: number): Box[];
  setSky(c: THREE.ColorRepresentation, haze?: Haze | null): void;
  stats(): ShellStats;
  dispose(): void;
};

const HEDGE_REGION = new Map<string, RegionId>(HEDGES.map((h) => [h.id, h.region]));
const FEATURE_REGION = new Map<string, RegionId>((FEATURES.list as { id: string; region: RegionId }[]).map((f) => [f.id, f.region]));
/** E5: shared helper: strip a shape to position and normal, non-indexed, so shapes of different kinds merge into one. */
const plain = (g: THREE.BufferGeometry): THREE.BufferGeometry => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute("uv"); return n; };
/** E5: a tuft of tiny flowers: three thin leaves and three small ink-coloured blooms, one colour per vertex so one instanced draw gives four colours. */
function tuftGeo(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: string) => { const c = new THREE.Color(hex), n = g.getAttribute("position").count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
  const parts: THREE.BufferGeometry[] = [], bloom = ["#d9606b", "#e8b84a", "#8b6fa8"];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4, ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
    parts.push(paint(plain(lathe([[0, 0], [0.05, 0], [0.025, 0.25], [0, 0.42]], 4).translate(ox, 0, oz)), "#6f9a5a"));
    parts.push(paint(plain(wobbleSphere(0.075, 0.1, 7 + k, 6).translate(ox * 1.4, 0.46, oz * 1.4)), bloom[k]));
  }
  return mergeGeometries(parts)!;
}
/** E5: an ink drip hung in the air: a thin thread that swells into a teardrop (walk-through, drawn at head height and above). */
const dripGeo = (): THREE.BufferGeometry => mergeGeometries([plain(lathe([[0, 3.9], [0.02, 3.9], [0.02, 3.1], [0.13, 2.95], [0.11, 2.55], [0.05, 2.3], [0, 2.15]], 6))])!;
/** E5: a fern fan: seven thin blades leaning out from one root, longer at the back. */
function fernGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, len = 0.8 + 0.25 * Math.sin(k * 2.1);
    parts.push(plain(lathe([[0, 0], [0.07, 0], [0.05, 0.45 * len], [0, 0.95 * len]], 3).rotateZ(-0.75).rotateY(a)));
  }
  return mergeGeometries(parts)!;
}
/** E5: a rolled-paper haystack: a round roll that rounds off into a soft cap. */
const haystackGeo = (): THREE.BufferGeometry => mergeGeometries([plain(lathe([[0, 0], [0.9, 0], [0.97, 0.06], [0.88, 0.95], [0.6, 1.2], [0.25, 1.6], [0, 1.78]], 10))])!;
const mats = (look: { crown: string; trunk: string; rock: string; bush: string }) => ({
  trunk: new THREE.MeshToonMaterial({ color: look.trunk }), crown: new THREE.MeshToonMaterial({ color: look.crown }),
  rock: new THREE.MeshToonMaterial({ color: look.rock }), bush: new THREE.MeshToonMaterial({ color: look.bush }),
});

export function buildWorldShell(scene: THREE.Scene, opts: { hills?: boolean; ground?: boolean; features?: boolean; groundInk?: boolean } = {}): WorldShell {
  const group = new THREE.Group(); group.name = "world-shell"; scene.add(group);
  const gy = (x: number, z: number): number => (opts.ground ? groundY(x, z) : 0); // H2: props sit on the ground height; with the switch off this is 0, exactly as before
  const SINK = 0.08; // rocks sit a little sunk so no gap shows on a slope
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };

  // ---- shared geometry (made once, never per chunk) ----
  const G = {
    trunk: keep(trunkGeo(0.18, 0.28, 2.6, 6).translate(0, 1.3, 0)),
    crownLow: keep(crownGeo(1.6, 2.6, "shell:crownLow").translate(0, 3.2, 0)),
    crownHigh: keep(crownGeo(1.05, 2.2, "shell:crownHigh").translate(0, 4.6, 0)),
    rock: keep(new THREE.DodecahedronGeometry(0.7, 0).translate(0, 0.3, 0)),
    bush: keep(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.45, 0)),
    box: keep(unitBoxGeo()),
    cone: keep(unitConeGeo()),
    spike: keep(unitConeGeo(0.06)),
    trunkU: keep(unitTrunkGeo()),
    crowns: ["a", "b", "c", "d"].map((k) => keep(unitCrownGeo(`bigtree:${k}`))),
    mounds: [keep(moundGeo("hill:a")), keep(moundGeo("hill:b"))],
    tail: keep(tailGeo()),
    pole: keep(poleGeo(0.8, 1, 1, 8).translate(0, 0.5, 0)),
    cyl: keep(unitCylGeo()),
    lamp: keep(new THREE.IcosahedronGeometry(1, 1)),
    tuft: keep(tuftGeo()), haystack: keep(haystackGeo()), drip: keep(dripGeo()), fern: keep(fernGeo()), // E5: Meadow prop shapes (made once; only used with the features on)
  };
  const M: Record<RegionId, ReturnType<typeof mats>> = { meadow: mats(WORLD.look.meadow), inkwood: mats(WORLD.look.inkwood), paper_downs: mats(WORLD.look.paper_downs), glyph_quarter: mats(WORLD.look.glyph_quarter), pressmark_shore: mats(WORLD.look.pressmark_shore) };
  for (const r of ["meadow", "inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"] as const) Object.values(M[r]).forEach((m) => keep(m));
  const L = {
    paper: keep(new THREE.MeshToonMaterial({ color: "#f1dfae" })), ink: keep(new THREE.MeshToonMaterial({ color: "#2a2438" })),
    red: keep(new THREE.MeshToonMaterial({ color: "#d9606b" })), leaf: keep(new THREE.MeshToonMaterial({ color: WORLD.look.inkwood.crown })),
    glow: keep(new THREE.MeshBasicMaterial({ color: "#ffd98a" })),
    tuft: keep(new THREE.MeshToonMaterial({ vertexColors: true })), hay: keep(new THREE.MeshToonMaterial({ color: "#e6cf8f" })), drip: keep(new THREE.MeshToonMaterial({ color: "#2a2438" })), fern: keep(new THREE.MeshToonMaterial({ color: "#4f7a5e", side: THREE.DoubleSide })),
    hill: keep(new THREE.MeshToonMaterial({ color: "#e9e2c6" })), kite: keep(new THREE.MeshToonMaterial({ color: "#d9606b", side: THREE.DoubleSide })),
    shelf: keep(new THREE.MeshToonMaterial({ color: "#8a7a62" })), book: keep(new THREE.MeshToonMaterial({ color: "#7d8aa0" })),
    water: keep(new THREE.MeshToonMaterial({ color: "#4d6a78" })), deck: keep(new THREE.MeshToonMaterial({ color: "#a89476" })),
    shelfDark: keep(new THREE.MeshToonMaterial({ color: "#5e4f3e" })), ledge: keep(new THREE.MeshToonMaterial({ color: "#a89476" })),
    spines: ["#c8605f", "#d9a15a", "#6f8fb0", "#6f9a6a", "#8b6fa8", "#e3d3a4", "#3f5f78", "#b5726b"].map((c) => keep(new THREE.MeshToonMaterial({ color: c }))),
  };

  // ---- ground: a soft blend from meadow to inkwood, plus a plain skirt beyond the edge ----
  const SEG = 128; // 2 m cells, so the blend below is smooth rather than stepped
  const soft = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); }; // smoothstep: no visible start or end line
  const BLEND = 16; // metres either side of a region edge
  const gg = keep(new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG));
  { // vertex colours: meadow in the south, inkwood in the north, blended over a band round the region edge
    const pos = gg.attributes.position, col: number[] = [], a = new THREE.Color(WORLD.look.meadow.ground), b = new THREE.Color(WORLD.look.inkwood.ground), d = new THREE.Color(WORLD.look.paper_downs.ground), q = new THREE.Color(WORLD.look.glyph_quarter.ground), sh = new THREE.Color(WORLD.look.pressmark_shore.ground), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), wz = -pos.getY(i), north = Math.min(1, Math.max(0, (WORLD.inkwoodZ + 14 - wz) / 28)), east = Math.min(1, Math.max(0, (wx - WORLD.paperDownsX + 14) / 28)), south = soft((wz - WORLD.glyphZ + BLEND) / (BLEND * 2));
      const shore = soft((wx - WORLD.shoreX + BLEND) / (BLEND * 2)) * (1 - north) * (1 - south);
      c.copy(a).lerp(b, north).lerp(d, north * east).lerp(q, south).lerp(sh, shore); col.push(c.r, c.g, c.b);
    }
    gg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  }
  if (opts.ground) { // H1: lift the ground mesh by groundY (local z becomes height after the -90 degree turn); only with the switch on
    const pos = gg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, groundY(pos.getX(i), -pos.getY(i)));
    pos.needsUpdate = true; gg.computeVertexNormals();
  }
  const groundMat = keep(new THREE.MeshToonMaterial({ vertexColors: true }));
  if (opts.groundInk) { // ink on the land: two per-vertex floats and a shader patch on this material only; off = the plain material, untouched
    const pos = gg.attributes.position, reg: number[] = [], home: number[] = [];
    for (let i = 0; i < pos.count; i++) { const wx = pos.getX(i), wz = -pos.getY(i); reg.push(regionInk(wx, wz)); home.push(homeEase(wx, wz)); }
    gg.setAttribute("inkRegion", new THREE.Float32BufferAttribute(reg, 1)); gg.setAttribute("inkHome", new THREE.Float32BufferAttribute(home, 1));
    applyInk(groundMat, INK);
  }
  const ground = new THREE.Mesh(gg, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; group.add(ground);
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
    const pole = keep(poleGeo(0.07, 0.09, 1.9).translate(0, 0.95, 0)), plate = keep(plateGeo(0.9, 0.7, 0.07, 2));
    const leaf = keep(wobbleSphere(0.26, 0.04, seedOf("shell:leaf"), 8).scale(0.55, 1, 0.25)), page = keep(plateGeo(0.26, 0.36, 0.03));
    const stem = keep(plateGeo(0.03, 0.3, 0.02)), kiteG = keep(plateGeo(0.3, 0.3, 0.03)), kiteTail = keep(plateGeo(0.07, 0.05, 0.03)), moon = keep(new THREE.TorusGeometry(0.22, 0.06, 6, 14, Math.PI * 1.45));
    const sign = (sp: Signpost) => {
      const g = new THREE.Group(); g.position.set(sp.x, gy(sp.x, sp.z), sp.z); g.rotation.y = sp.yaw; // the board faces along +z of the group
      g.add(new THREE.Mesh(pole, wood));
      const b = new THREE.Mesh(plate, board); b.position.y = 1.6; g.add(b);
      const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, 1.6 + y, 0.06); o.rotation.z = rz; g.add(o); return o; };
      if (sp.icon === "leaf") { put(leaf, green, 0, 0, 0.5); put(stem, inkM, 0.02, -0.04, 0.5); }
      else if (sp.icon === "book") { put(page, inkM, -0.15, 0, 0.12); put(page, gold, 0.15, 0, -0.12); }
      else if (sp.icon === "kite") { put(kiteG, L.kite, 0, 0.05, Math.PI / 4); put(stem, inkM, 0, -0.27, 0); put(kiteTail, L.kite, 0.06, -0.24, 0.5); put(kiteTail, L.kite, -0.05, -0.32, -0.5); for (const o of g.children.slice(-4)) { const back = o.clone(); back.position.set(-o.position.x, o.position.y, -o.position.z); back.rotation.set(0, Math.PI, o.rotation.z); g.add(back); } } // P2: the kite also shows on the back of the board, tail and all
      else put(moon, gold, 0, 0, 2.2);
      group.add(g); return g;
    };
    for (const sp of SIGNPOSTS) sign(sp);
  }

  // ---- paper-fold horizons: three jagged ridge rings that follow the player; fogged, tinted from the sky ----
  // S31c: with the layered hills on, the old ridges are not built (they stay here as the fallback: layers 0 or ?hills=off).
  const hills = opts.hills ? buildHills(group) : null;
  const ridges: THREE.Mesh[] = [];
  for (let k = 0; k < (hills ? 0 : 3); k++) {
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
  const setSky = (c: THREE.ColorRepresentation, haze?: Haze | null) => { sky.set(c); hills?.setSky(c, haze); ridges.forEach((m, k) => (m.material as THREE.MeshBasicMaterial).color.copy(sky).multiplyScalar(0.8 + k * 0.06)); };

  // ---- chunks ----
  const chunks = new Map<string, Chunk>();
  const cache = new Map<string, Circle[]>(); // collision circles per chunk (pure data; bounded to the chunks near the player)
  const st: ShellStats = { chunks: 0, instances: 0, builds: 0, drops: 0 };
  const tmp = new THREE.Object3D();
  // E4: with the features on, the scatter is cleared from under the hedgerows (same filter for drawing and for collision); off, contents are untouched
  const scatterOf = (a: number, b: number): Contents => {
    const c = chunkContents(a, b); if (!opts.features || !HEDGES.length) return c;
    const hp = buildHedges(), keepIt = (r: number) => (i: { x: number; z: number; s: number }) => !hedgeTouches(i.x, i.z, r * i.s, hp);
    return { ...c, trees: c.trees.filter(keepIt(TREE_R)), rocks: c.rocks.filter(keepIt(ROCK_R)), bushes: c.bushes.filter(keepIt(BUSH_R)) };
  };
  const circlesOf = (a: number, b: number): Circle[] => { const k = chunkKey(a, b); let v = cache.get(k); if (!v) { v = chunkCircles(scatterOf(a, b)); if (opts.features) v = [...v, ...featureCircles(featureItemsInChunk(a, b)), ...propCircles(propItemsInChunk(a, b))]; cache.set(k, v); } return v; };

  const landmark = (l: Contents["landmarks"][number]): THREE.Object3D => {
    const g = new THREE.Group(); g.position.set(l.x, gy(l.x, l.z), l.z);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, y = 0, rotY = 0) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.scale.set(sx, sy, sz); m.position.y = y; m.rotation.y = rotY; g.add(m); return m; };
    if (l.kind === "tower") { // the Page Tower: a stack of pages with an ink band and a red cap
      add(G.box, L.paper, l.r * 2, l.h * 0.3, l.r * 2); add(G.box, L.paper, l.r * 1.94, l.h * 0.26, l.r * 2.04, l.h * 0.3, 0.05); add(G.box, L.paper, l.r * 2.03, l.h * 0.22, l.r * 1.96, l.h * 0.56, -0.04); add(G.box, L.ink, l.r * 2.15, 0.9, l.r * 2.15, l.h * 0.5); add(G.box, L.ink, l.r * 2.15, 0.9, l.r * 2.15, l.h * 0.22);
      add(G.spike, L.red, l.r * 3, l.h * 0.26, l.r * 3, l.h * 0.78, Math.PI / 4); // the cap's tip bends (the spec's curled top page is not done)
    } else if (l.kind === "spire") { // the Bookmark Spire: a thin ribbon-like spike
      add(G.spike, L.red, l.r * 1.6, l.h, l.r * 0.5); add(G.cone, L.ink, l.r * 0.5, l.h * 0.98, l.r * 1.6);
    } else if (l.kind === "bigtree") { // the Great Ink Tree
      add(G.trunkU, L.ink, l.r * 0.7, l.h * 0.4, l.r * 0.7);
      ([[0.3, 3.4], [0.5, 2.6], [0.68, 1.8], [0.84, 1]] as const).forEach(([y, s], i) => { const c = add(G.crowns[i], L.leaf, l.r * s * (i === 1 ? 1.12 : 1), l.h * 0.3, l.r * s * (i === 1 ? 0.88 : 1), l.h * y, 0.3 * s); if (i === 1) c.position.x = l.r * 0.5; }); // the second tier is lopsided
    } else if (l.kind === "shelves") { // the Bookshelf Wall: a long wall of shelves, rows of book spines of varied colour and height, ledges, both faces
      const W = l.r * 4, D = l.r * 0.5, rows = 6, rowH = (l.h * 0.88) / rows, rnd = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
      add(G.box, L.shelfDark, W, l.h * 0.9, D * 0.8, 0, 0); // dark back panel, slightly set in, so the spines read against it
      add(G.box, L.shelf, 0.5, l.h * 0.92, D * 1.15, 0).position.x = -W / 2; add(G.box, L.shelf, 0.5, l.h * 0.92, D * 1.15, 0).position.x = W / 2; // side posts
      for (let r = 0; r <= rows; r++) { const y = r * rowH; add(G.box, L.ledge, W + 0.6, 0.35, D * 1.5, y - 0.1).position.z = 0; } // a ledge under every row, standing out of both faces
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH + 0.25; let x = -W / 2 + 0.6;
        while (x < W / 2 - 0.9) {
          const w = 0.45 + rnd(n + 1) * 0.5, h = rowH * (0.6 + rnd(n + 2) * 0.36), mat = L.spines[Math.floor(rnd(n + 3) * L.spines.length)], gap = rnd(n + 4) < 0.12 ? 0.9 : 0.06; // the odd gap
          for (const side of [1, -1]) { const b = add(G.box, mat, w, h, D * 0.5, y0, 0); b.position.x = x + w / 2; b.position.z = side * (D * 0.5 + rnd(n + 5 + side) * 0.18); } // each spine sits a little proud, by its own amount
          x += w + gap; n += 6;
        }
        const lean = add(G.box, L.paper, 0.45, rowH * 0.8, D * 0.5, y0, 0); lean.position.set(-W / 2 + 2 + rnd(r + 90) * (W - 4), y0, D * 0.5 + 0.2); lean.rotation.z = 0.28 * (r % 2 ? 1 : -1); // one leaning book per row
      }
    } else if (l.kind === "bridge") { // the Lantern Bridge: an arched deck over a pool of ink water, a lantern at each end, readable through fog
      const wat = add(G.box, L.water, 22, 0.05, 40, 0.02); wat.castShadow = false;
      for (let i = 0; i < 9; i++) { const t = i / 8 - 0.5, y = 3.2 * (1 - 4 * t * t) + 0.6; add(G.box, L.deck, 4, 0.5, 3.6, y, 0).position.z = t * 28; }
      for (const s of [-1, 1]) { add(G.cyl, L.ink, 0.25, l.h * 0.5, 0.25, 0).position.z = s * 15; const lamp = add(G.lamp, L.glow, 1.4, 1.4, 1.4, l.h * 0.52); lamp.position.z = s * 15; lamp.castShadow = false; }
    } else if (l.kind === "hill") { // the Paper-Kite Hill: a broad folded hill with a red paper kite flying above it
      add(G.mounds[0], L.hill, l.r * 2.2, l.h * 0.8, l.r * 2.2, 0, Math.PI / 4); add(G.mounds[1], L.hill, l.r * 1.3, l.h * 0.95, l.r * 1.3, 0, 0.3);
      const kite = add(G.box, L.kite, 2.6, 2.6, 0.12, l.h * 1.0, 0); kite.rotation.z = Math.PI / 4; const tail = add(G.tail, L.kite, 1, 2.4, 1, l.h * 1.0 - 0.92); tail.position.x = -0.92; // the tail hangs from the kite's lowest corner and curls add(G.cyl, L.ink, 0.06, l.h * 0.12, 0.06, l.h * 0.86);
    } else { // the Lantern Post: a pole with a warm light that reads through fog
      const pole = add(G.pole, L.ink, l.r * 0.28, l.h * 0.9, l.r * 0.28); pole.rotation.z = 0.03; const lamp = add(G.lamp, L.glow, l.r * 1.3, l.r * 1.3, l.r * 1.3, l.h * 0.94); lamp.position.x = -Math.sin(0.03) * l.h * 0.9; // the pole leans a little
      lamp.castShadow = false;
    }
    return g;
  };

  const build = (ix: number, iz: number) => {
    const c = scatterOf(ix, iz), g = new THREE.Group(), ims: THREE.InstancedMesh[] = [], extra: THREE.Object3D[] = [], m = M[c.region];
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; z: number; s: number; r: number }[], sy = 1, sink = 0, cast = true) => {
      if (!items.length) return;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      im.castShadow = cast; // instanced meshes do not cast unless told to
      items.forEach((it, i) => { tmp.position.set(it.x, gy(it.x, it.z) - sink, it.z); tmp.rotation.set(0, it.r, 0); tmp.scale.set(it.s, it.s * sy, it.s); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); // so each chunk is culled on its own
      g.add(im); ims.push(im);
    };
    make(G.trunk, m.trunk, c.trees); make(G.crownLow, m.crown, c.trees); make(G.crownHigh, m.crown, c.trees);
    make(G.rock, m.rock, c.rocks, 1, opts.ground ? SINK : 0); make(G.bush, m.bush, c.bushes);
    for (const l of c.landmarks) { const o = landmark(l); g.add(o); extra.push(o); }
    let fInst = 0;
    if (opts.features) { // E3: the authored groves, belts, rings and rows, drawn with their own region's look and the same shapes as the scatter
      const fs = featureItemsInChunk(ix, iz);
      for (const reg of Object.keys(M) as RegionId[]) {
        const mine = fs.filter((i) => FEATURE_REGION.get(i.f) === reg), fm = M[reg];
        const trees = mine.filter((i) => i.k === "tree");
        make(G.trunk, fm.trunk, trees); make(G.crownLow, fm.crown, trees); make(G.crownHigh, fm.crown, trees);
        make(G.rock, fm.rock, mine.filter((i) => i.k === "rock"), 1, opts.ground ? SINK : 0); make(G.bush, fm.bush, mine.filter((i) => i.k === "bush"));
      }
      fInst = featureInstanceCount(fs);
      const ps = propItemsInChunk(ix, iz); // E5: Meadow tufts and haystacks, Inkwood drips and ferns, one instanced draw per shape
      make(G.tuft, L.tuft, ps.filter((i) => i.k === "tuft")); make(G.haystack, L.hay, ps.filter((i) => i.k === "haystack"), 1, opts.ground ? SINK : 0); make(G.drip, L.drip, ps.filter((i) => i.k === "drip")); make(G.fern, L.fern, ps.filter((i) => i.k === "fern")); fInst += ps.length;
      for (const p of hedgePiecesInChunk(ix, iz)) { // E4: a hedgerow piece is one soft box in its region's leaf colour, sunk a little so a slope shows no gap
        const o = new THREE.Mesh(G.box, M[HEDGE_REGION.get(p.f) ?? c.region].crown); o.castShadow = true; o.scale.set(p.w, p.h, p.d); o.position.set(p.x, gy(p.x, p.z) - (opts.ground ? 0.5 : 0), p.z); g.add(o); extra.push(o); fInst++;
      }
    }
    group.add(g);
    const inst = c.trees.length * 3 + c.rocks.length + c.bushes.length + c.landmarks.length + fInst;
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
    hills?.update(x, z);
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
    boxesNear(x, z, reach) {
      if (!opts.features) return [];
      const out: Box[] = [], ix = chunkOf(x), iz = chunkOf(z);
      for (let a = ix - 1; a <= ix + 1; a++) for (let b = iz - 1; b <= iz + 1; b++) for (const q of hedgeBoxes(hedgePiecesInChunk(a, b))) if (Math.abs(q.x - x) < reach + q.w / 2 && Math.abs(q.z - z) < reach + q.d / 2) out.push(q);
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
