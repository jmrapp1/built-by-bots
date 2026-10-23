// The Margins as three.js objects (slice 6a). Built once, parked far from the garden (so the garden's own
// scene is untouched), and shown by moving the player and camera there. Everything is procedural: no assets.
// All the rules (layout, pages, trail, timings) live in lib/margins.ts.
import * as THREE from "three";
import { MARGINS, HALF, gateFrame, gatePosts, glintOpacity, heightAt, unfoldFrame, type Find, type Layout, type Spot } from "@/lib/margins";
import { fireflyAt, fireflyLevel } from "@/lib/night";
import type { Vec } from "@/lib/world";
import { PALETTE } from "@/lib/palette";
import { addOutline, disposeTree, OUTLINE_ANGLE } from "@/lib/outline";
import { makeToonGradient } from "@/lib/inkToon";
import { PROP_EDGE_ANGLE, capGeo, postGeo } from "@/lib/propShapes";

export const OFF = 400; // the Margins sit this far along x from the garden; positions inside are local

// S26b: one shared 3-band ink gradient for every toon material here (a 3x1 texture; kept for the page's life).
let gradient: THREE.DataTexture | null = null;
const gm = () => (gradient ??= makeToonGradient());
const mat = (color: number | string) => new THREE.MeshToonMaterial({ color, gradientMap: gm() });
const NO_ROT = new THREE.Quaternion();

function paperTexture(repeatX: number, repeatZ: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4ecd6";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(120,140,170,0.30)";
  g.lineWidth = 2;
  for (let y = 16; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatZ);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The gate: two page-edge posts and a torn-paper arch. `d` is the way you walk through it.
export function buildGate(d: Vec): THREE.Group {
  const g = new THREE.Group();
  const s = MARGINS.gate.postOffset;
  const post = mat("#d8cba8"), edge = mat(PALETTE.ink), paper = new THREE.MeshToonMaterial({ color: PALETTE.paper, side: THREE.DoubleSide, gradientMap: gm() });
  for (const k of [-1, 1]) {
    const p = new THREE.Mesh(postGeo(0.34, k === -1 ? 2.44 : 2.5, 0.22, 0, 0.05), post);
    p.position.set(k * s, k === -1 ? 1.22 : 1.25, 0);
    const cap = new THREE.Mesh(capGeo(0.42, 0.12, 0.3), edge);
    cap.position.set(k * s, 2.54, 0);
    addOutline(p, undefined, PROP_EDGE_ANGLE); addOutline(cap, PALETTE.paper, PROP_EDGE_ANGLE);
    g.add(p, cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(s, 0.09, 6, 20, Math.PI), edge);
  arch.position.set(0, 2.5, 0);
  const sheet = new THREE.Mesh(new THREE.CircleGeometry(s * 0.98, 20, 0, Math.PI), paper); // the torn paper filling the top of the arch
  sheet.position.set(0, 2.5, -0.02);
  sheet.scale.set(1, 0.55, 1);
  g.add(arch, sheet);
  g.rotation.y = Math.atan2(d.x, d.z);
  return g;
}

type SpotVis = { g: THREE.Group; flap: THREE.Group; glint: THREE.Mesh; glow: THREE.Mesh; find: Record<Find, THREE.Mesh> };
export type MarginsScene = {
  group: THREE.Group;
  setSky(color: string): void;
  setSpots(spots: Spot[], opened: Set<number>): void;
  update(a: {
    t: number; dt: number; player: Vec; hour: number; reduced: boolean; all: boolean; opened: Set<number>;
    active: { id: number; since: number } | null; target: Vec; trail: { p: Vec; heading: number; u: number }[];
  }): void;
  spotWorld(id: number): THREE.Vector3 | null;
  dispose(): void;
};

export function buildMarginsScene(layout: Layout): MarginsScene {
  const group = new THREE.Group();
  group.position.set(OFF, 0, 0);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  // Ground: one plane per zone, tinted. A big ring in the sky colour hides the edge of the page.
  for (const z of MARGINS.zones) {
    const w = z.x1 - z.x0, d = z.z1 - z.z0;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), keep(new THREE.MeshStandardMaterial({ map: keep(paperTexture(w / 8, d / 8)), color: z.tint, roughness: 1 })));
    m.rotation.x = -Math.PI / 2;
    m.position.set((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2);
    group.add(m);
  }
  const edge = new THREE.Mesh(keep(new THREE.RingGeometry(HALF, HALF * 4, 4, 1, Math.PI / 4, Math.PI * 2)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = -0.05;
  group.add(edge);

  // Paper hills: smooth rises (a cosine profile, the same one the player walks on).
  const hillMat = keep(mat("#ecd9b4") /* lathe: smooth, deliberately no outline */);
  for (const h of layout.hills) {
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k <= 14; k++) { const d = (k / 14) * h.r; pts.push(new THREE.Vector2(d, h.h * (0.5 + 0.5 * Math.cos((d / h.r) * Math.PI)) + 0.01)); }
    pts.reverse();
    const m = new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 28)), hillMat);
    m.position.set(h.x, 0, h.z);
    group.add(m);
    // a fold line across each rise, like a crease
    const crease = new THREE.Mesh(keep(new THREE.BoxGeometry(h.r * 1.4, 0.03, 0.05)), keep(mat("#cdb88e")));
    crease.position.set(h.x, h.h * 0.55, h.z);
    crease.rotation.z = 0.06;
    group.add(crease);
  }

  // Instanced scenery.
  const dummy = new THREE.Object3D();
  // Sharp creases only (60 degrees), merged over every instance into one LineSegments: one draw call, no lines on curved faces.
  const instanceOutline = (geo: THREE.BufferGeometry, items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rz?: number }[], color: number | string = PALETTE.ink) => {
    const edges = new THREE.EdgesGeometry(geo, OUTLINE_ANGLE), src = edges.getAttribute("position"), v = new THREE.Vector3(), out: number[] = [];
    for (const it of items) {
      dummy.position.set(it.x, it.y, it.z); dummy.scale.set(it.sx, it.sy, it.sz); dummy.rotation.set(0, it.ry ?? 0, it.rz ?? 0); dummy.updateMatrix();
      for (let i = 0; i < src.count; i++) { v.fromBufferAttribute(src, i).applyMatrix4(dummy.matrix); out.push(v.x, v.y, v.z); }
    }
    edges.dispose();
    if (!out.length) return;
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    const lines = new THREE.LineSegments(g, keep(new THREE.LineBasicMaterial({ color })));
    lines.raycast = () => {}; lines.frustumCulled = false;
    group.add(lines);
  };
  const instanced = (geo: THREE.BufferGeometry, material: THREE.Material, items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; rz?: number }[], ink = true) => {
    const im = new THREE.InstancedMesh(keep(geo), material, Math.max(1, items.length));
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.rotation.set(0, it.ry ?? 0, it.rz ?? 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.count = items.length;
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    group.add(im);
    if (ink) instanceOutline(geo, items);
    return im;
  };
  const gy = (x: number, z: number) => heightAt(x, z, layout.hills);
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 7), keep(mat(PALETTE.ink)), layout.trees.map((t) => ({ x: t.x, y: gy(t.x, t.z) + 1.3, z: t.z, sx: t.r, sy: 1, sz: t.r })));
  const leaf = keep(mat(PALETTE.moss)), leaf2 = keep(mat(PALETTE.moss));
  instanced(new THREE.ConeGeometry(1.5, 1.8, 7), leaf, layout.trees.map((t) => ({ x: t.x, y: gy(t.x, t.z) + 3.0, z: t.z, sx: t.r, sy: 1, sz: t.r })));
  instanced(new THREE.ConeGeometry(1.1, 1.5, 7), leaf2, layout.trees.map((t) => ({ x: t.x, y: gy(t.x, t.z) + 4.0, z: t.z, sx: t.r, sy: 1, sz: t.r })));
  instanced(new THREE.SphereGeometry(1, 10, 8), keep(mat(PALETTE.moss)), layout.bushes.map((b) => ({ x: b.x, y: gy(b.x, b.z) + b.r * 0.55, z: b.z, sx: b.r * 1.15, sy: b.r * 0.8, sz: b.r * 1.15 })), false); // sphere: no outline
  // Stone-like page stacks (three layers each) and leaning shelves.
  const stone = keep(mat("#9aa6b8")), stone2 = keep(mat("#b4becd")), carve = keep(mat(PALETTE.inkSoft));
  instanced(new THREE.CylinderGeometry(1, 1.06, 0.7, 10), stone, layout.stacks.map((s) => ({ x: s.x, y: 0.35, z: s.z, sx: s.r, sy: 1, sz: s.r, ry: s.x })));
  instanced(new THREE.CylinderGeometry(1, 1.04, 0.7, 10), stone2, layout.stacks.map((s) => ({ x: s.x, y: 1.05, z: s.z, sx: s.r * 0.82, sy: 1, sz: s.r * 0.82, ry: s.z })));
  instanced(new THREE.CylinderGeometry(1, 1.04, 0.7, 10), stone, layout.stacks.map((s) => ({ x: s.x, y: 1.75, z: s.z, sx: s.r * 0.6, sy: 1, sz: s.r * 0.6, ry: s.x + s.z })));
  instanced(new THREE.BoxGeometry(0.25, 0.7, 0.05), carve, layout.stacks.map((s) => ({ x: s.x + s.r * 0.97, y: 0.45, z: s.z, sx: 1, sy: 1, sz: 1, ry: Math.PI / 2 })));
  instanced(new THREE.BoxGeometry(1, 2.4, 1), stone2, layout.shelves.map((b) => ({ x: b.x, y: 1.2, z: b.z, sx: b.w, sy: 1, sz: b.d, rz: 0.05 })));
  instanced(new THREE.BoxGeometry(1, 0.1, 1), carve, layout.shelves.flatMap((b) => [0.7, 1.4, 2.0].map((y) => ({ x: b.x, y, z: b.z, sx: b.w * 1.03, sy: 1, sz: b.d * 1.2 }))));

  // The way back: a gate with the arch, so it can be seen from afar.
  const home = buildGate({ x: -gateFrame("home").d.x, z: -gateFrame("home").d.z });
  home.position.set(gateFrame("home").g.x, 0, gateFrame("home").g.z);
  group.add(home);
  void gatePosts;

  // Folded pages (twelve at most) with their glints and the finds that rise out of them.
  const pageMat = keep(new THREE.MeshToonMaterial({ color: "#fffaf0" })), pageBack = keep(mat("#e6d8b4"));
  const glintMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, depthWrite: false, opacity: 0.35 });
  keep(glintMat); keep(glowMat);
  const findGeo: Record<Find, THREE.BufferGeometry> = { egg: keep(new THREE.SphereGeometry(0.2, 14, 12)), ink: keep(new THREE.SphereGeometry(0.22, 12, 10)), glyph: keep(new THREE.BoxGeometry(0.3, 0.3, 0.3)), scrap: keep(new THREE.BoxGeometry(0.4, 0.04, 0.3)) };
  const findMat: Record<Find, THREE.Material> = { egg: keep(mat("#fffaf0")), ink: keep(mat(PALETTE.ink)), glyph: keep(mat(PALETTE.watercolorBlue)), scrap: keep(mat(PALETTE.gold)) };
  const pageEdge = keep(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.035, 0.4), OUTLINE_ANGLE)), pageLine = keep(new THREE.LineBasicMaterial({ color: PALETTE.ink }));
  const pageGeo = keep(new THREE.BoxGeometry(0.8, 0.035, 0.4)), glintGeo = keep(new THREE.OctahedronGeometry(0.14)), glowGeo = keep(new THREE.CircleGeometry(0.7, 18));
  const vis: SpotVis[] = Array.from({ length: MARGINS.spots.count }, () => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(pageGeo, pageBack);
    base.position.set(0, 0.02, -0.2);
    for (const m of [base]) { const e = new THREE.LineSegments(pageEdge, pageLine); e.raycast = () => {}; m.add(e); }
    const flap = new THREE.Group(); // hinged at the middle; closed it lies folded over the base
    const sheet = new THREE.Mesh(pageGeo, pageMat);
    sheet.position.set(0, 0, 0.2);
    { const e = new THREE.LineSegments(pageEdge, pageLine); e.raycast = () => {}; sheet.add(e); }
    flap.add(sheet);
    flap.position.set(0, 0.04, 0);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.025;
    const glint = new THREE.Mesh(glintGeo, glintMat);
    const find = { egg: new THREE.Mesh(findGeo.egg, findMat.egg), ink: new THREE.Mesh(findGeo.ink, findMat.ink), glyph: new THREE.Mesh(findGeo.glyph, findMat.glyph), scrap: new THREE.Mesh(findGeo.scrap, findMat.scrap) };
    for (const m of Object.values(find)) { m.visible = false; g.add(m); }
    g.add(base, flap, glow, glint);
    g.visible = false;
    group.add(g);
    return { g, flap, glint, glow, find };
  });

  // The paper-arrow trail that always points home: a few flat arrows on the ground.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.55); arrowShape.lineTo(0.38, -0.05); arrowShape.lineTo(0.14, -0.05); arrowShape.lineTo(0.14, -0.5);
  arrowShape.lineTo(-0.14, -0.5); arrowShape.lineTo(-0.14, -0.05); arrowShape.lineTo(-0.38, -0.05); arrowShape.closePath();
  const arrowGeo = keep(new THREE.ShapeGeometry(arrowShape));
  const arrows = Array.from({ length: MARGINS.arrows.count }, () => {
    const holder = new THREE.Group();
    const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: PALETTE.paper, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    keep(m.material as THREE.Material);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    holder.add(m);
    holder.visible = false;
    group.add(holder);
    return { holder, m };
  });

  // Fireflies: brighter than in the garden. They gather round the trees.
  const anchors = layout.trees.length ? layout.trees.map((t) => ({ x: t.x, z: t.z })) : [{ x: 0, z: 0 }];
  const flies = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 8, 6)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), MARGINS.fireflies.count);
  flies.frustumCulled = false;
  flies.visible = false;
  group.add(flies);
  const flyObj = new THREE.Object3D(), flyCol = new THREE.Color();

  let current: Spot[] = [];
  const tmp = new THREE.Vector3();
  const api: MarginsScene = {
    group,
    setSky(color) { (edge.material as THREE.MeshBasicMaterial).color.set(color); },
    setSpots(spots, opened) {
      current = spots;
      vis.forEach((v, i) => {
        const s = spots[i];
        v.g.visible = !!s;
        if (!s) return;
        v.g.position.set(s.x, gy(s.x, s.z), s.z);
        v.g.rotation.y = (s.x * 7.3 + s.z * 3.1) % (Math.PI * 2);
        v.flap.rotation.x = opened.has(s.id) ? 0 : -Math.PI + 0.04;
      });
    },
    update({ t, dt, player, hour, reduced, all, opened, active, target, trail }) {
      void dt;
      current.forEach((s, i) => {
        const v = vis[i];
        const isOpen = opened.has(s.id), isActive = active?.id === s.id;
        const dist = Math.hypot(player.x - s.x, player.z - s.z);
        // folded or flat
        if (isActive) v.flap.rotation.x = -Math.PI * (1 - unfoldFrame(active!.since, reduced).fold) + 0.04 * (1 - unfoldFrame(active!.since, reduced).fold);
        else v.flap.rotation.x = isOpen ? 0 : -Math.PI + 0.04;
        // glint: a slow pulse and a small turning paper corner; fixed when motion is reduced
        const show = !isOpen && !isActive;
        const op = show ? glintOpacity(dist, all) : 0;
        v.glint.visible = op > 0.01;
        v.glow.visible = op > 0.01;
        if (v.glint.visible) {
          const pulse = reduced ? 1 : 1 + MARGINS.glint.pulse * Math.sin((t / MARGINS.glint.pulseSeconds) * Math.PI * 2 + i);
          v.glint.scale.setScalar(pulse * (all ? 1.6 : 1 + Math.min(1.2, dist / 25))); // far glints stay readable
          v.glint.position.y = 0.9 + (reduced ? 0 : Math.sin(t * 1.3 + i) * 0.06);
          v.glint.rotation.y = reduced ? 0.6 : t * 0.9 + i;
          v.glow.scale.setScalar(pulse * (1 + Math.min(1, dist / 40)));
          glintMat.opacity = 0.9; glowMat.opacity = 0.35; // shared, the per-spot fade is done with scale below
          if (op < 1) { v.glint.scale.multiplyScalar(op); v.glow.scale.multiplyScalar(op); }
        }
        // the find rising out of an opened page, spinning once, then arcing to the player
        for (const k of ["ink", "glyph", "scrap", "egg"] as Find[]) v.find[k].visible = false;
        if (isActive) {
          const f = unfoldFrame(active!.since, reduced), m = v.find[s.kind];
          if (f.rise > 0 && !f.done) {
            m.visible = true;
            const rise = f.rise * MARGINS.unfold.riseHeight + 0.12;
            const to = tmp.set(target.x - s.x, 1.1 - gy(s.x, s.z) - rise, target.z - s.z); // where it ends up, relative to the page
            m.position.set(to.x * f.arc, rise + to.y * f.arc + Math.sin(Math.PI * f.arc) * MARGINS.unfold.arcHeight, to.z * f.arc);
            m.rotation.y = f.spin;
            m.scale.setScalar(Math.max(0.05, 1 - 0.6 * f.arc));
          }
        }
      });
      // arrows
      arrows.forEach((a, i) => {
        const p = trail[i];
        a.holder.visible = !!p;
        if (!p) return;
        a.holder.position.set(p.p.x, gy(p.p.x, p.p.z), p.p.z);
        a.holder.rotation.y = p.heading + Math.PI;
        (a.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - p.u * 0.55);
        const pulse = reduced ? 1 : 1 + 0.06 * Math.sin(t * 2 - i * 0.8);
        a.holder.scale.setScalar(pulse);
      });
      // fireflies
      const fl = fireflyLevel(hour);
      flies.visible = fl > 0;
      if (fl > 0) {
        (flies.material as THREE.MeshBasicMaterial).opacity = Math.min(1, fl * 1.0);
        for (let i = 0; i < MARGINS.fireflies.count; i++) {
          const f = fireflyAt(i, t, anchors, reduced);
          flyObj.position.set(f.x, f.y + gy(f.x, f.z), f.z);
          flyObj.scale.setScalar(0.1 * MARGINS.fireflies.boost * (0.8 + 0.4 * f.glow));
          flyObj.updateMatrix();
          flies.setMatrixAt(i, flyObj.matrix);
          flyCol.setRGB(0.95 * f.glow, 0.62 * f.glow, 0.12 * f.glow);
          flies.setColorAt(i, flyCol);
        }
        flies.instanceMatrix.needsUpdate = true;
        if (flies.instanceColor) flies.instanceColor.needsUpdate = true;
      }
    },
    spotWorld(id) {
      const s = current.find((q) => q.id === id);
      return s ? new THREE.Vector3(s.x + OFF, gy(s.x, s.z), s.z) : null;
    },
    dispose() {
      group.removeFromParent();
      disposeTree(group);
      for (const d of disposables) d.dispose();
      for (const a of arrows) (a.m.material as THREE.Material).dispose();
      flies.dispose();
      void NO_ROT;
    },
  };
  return api;
}
