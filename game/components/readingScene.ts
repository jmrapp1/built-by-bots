// S34: the Reading Room as three.js objects, and the picture door in the Margins. Procedural (no assets, no textures files), shared
// geometry and materials, instanced furniture. dispose() frees all of it. Rules and numbers: lib/reading.ts and data/reading.json.
// Draw calls with everything visible: floor 1, walls 6, shelves 2, desks 2, lamps 2, door 2, pages 2, glints 4, one find 1 = 22.
import * as THREE from "three";
import { READING, READING_SPOTS, doorFrame, doorPosts, signPost, type Look, type ReadingSpot } from "@/lib/reading";
import { MARGINS, unfoldFrame } from "@/lib/margins";
import { makeToonGradient } from "@/lib/inkToon";
import { PALETTE } from "@/lib/palette";
import { addOutline, disposeTree } from "@/lib/outline";
import { lathe, softBox, wobbleSphere } from "@/lib/shapes";
import { PROP_EDGE_ANGLE, lintelGeo, postGeo, unitBoxGeo, wallGeo } from "@/lib/propShapes";
import type { Vec } from "@/lib/world";

export type ReadingScene = {
  group: THREE.Group;
  setOpened(opened: ReadonlySet<number>): void;
  update(a: { t: number; player: Vec; level: number; reduced: boolean; opened: ReadonlySet<number>; active: { id: number; since: number; look: Look } | null; target: Vec }): void;
  dispose(): void;
};

export function buildReadingScene(): ReadingScene {
  const R = READING.room, L = READING.look, group = new THREE.Group();
  group.name = "reading-room";
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };
  const gm = keep(makeToonGradient());
  const toon = (c: string, side?: THREE.Side) => keep(new THREE.MeshToonMaterial({ color: c, side, gradientMap: gm }));
  const basic = (c: string, opacity = 1) => keep(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false }));
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(keep(geo), mat); m.position.set(x, y, z); group.add(m); return m; };
  const dummy = new THREE.Object3D();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number }[]) => {
    const im = new THREE.InstancedMesh(keep(geo), mat, Math.max(1, items.length));
    items.forEach((it, i) => { dummy.position.set(it.x, it.y, it.z); dummy.scale.set(it.sx, it.sy, it.sz); dummy.rotation.set(0, it.ry ?? 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.count = items.length; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; group.add(im);
    return im;
  };

  // Floor: ruled paper, one tiny data texture like the Home room.
  const W = 4, H = 32, px = new Uint8Array(W * H * 4), fl = new THREE.Color(L.floor), ru = new THREE.Color(L.rule);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = y === 0 ? ru.clone().lerp(fl, 0.55) : fl, i = (y * W + x) * 4; px[i] = Math.round(c.r * 255); px[i + 1] = Math.round(c.g * 255); px[i + 2] = Math.round(c.b * 255); px[i + 3] = 255; }
  const tex = keep(new THREE.DataTexture(px, W, H, THREE.RGBAFormat)); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, R.depth / 1.1); tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const floor = mesh(new THREE.PlaneGeometry(R.width, R.depth), keep(new THREE.MeshToonMaterial({ map: tex, gradientMap: gm })), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;

  // Walls: paper slabs (the south wall has a gap for the door).
  const wall = toon(L.wall), t = R.wallThickness, h = R.wallHeight, gap = READING.door.postOffset;
  mesh(wallGeo(R.width + 2 * t, h, t, -0.03), wall, 0, h / 2, -R.depth / 2 - t / 2);
  mesh(wallGeo(t, h, R.depth, -0.03), wall, -R.width / 2 - t / 2, h / 2, 0);
  mesh(wallGeo(t, h, R.depth, 0.03), wall, R.width / 2 + t / 2, h / 2, 0);
  const sw = R.width / 2 - gap;
  mesh(wallGeo(sw, h, t, 0.02), wall, -R.width / 2 + sw / 2, h / 2, R.depth / 2 + t / 2);
  mesh(wallGeo(sw, h, t, 0.02), wall, R.width / 2 - sw / 2, h / 2, R.depth / 2 + t / 2);
  mesh(wallGeo(gap * 2, h - 2.4, t, 0), wall, 0, 2.4 + (h - 2.4) / 2, R.depth / 2 + t / 2);

  // Leaning shelves (one instanced mesh for the cases, one for their boards) and desks with lamps.
  const F = READING.furniture, unit = unitBoxGeo();
  instanced(unit, toon(L.shelf), F.shelves.map((s) => ({ x: s.x, y: 0, z: s.z, sx: s.w, sy: 2.6, sz: s.d })));
  instanced(unitBoxGeo(), toon(L.shelfBoard), F.shelves.flatMap((s) => [0.7, 1.4, 2.0].map((y) => ({ x: s.x, y, z: s.z, sx: s.w * 1.04, sy: 0.08, sz: s.d * 1.25 }))));
  const desk = toon(L.desk);
  instanced(unitBoxGeo(), desk, F.desks.map((d) => ({ x: d.x, y: 0.72, z: d.z, sx: d.w, sy: 0.08, sz: d.d })));
  instanced(unitBoxGeo(), desk, F.desks.flatMap((d) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ x: d.x + a * (d.w / 2 - 0.1), y: 0, z: d.z + b * (d.d / 2 - 0.1), sx: 0.1, sy: 0.72, sz: 0.1 }))));
  const lampShade = keep(lathe([[0, 0], [0.16, 0], [0.1, 0.22], [0, 0.22]], 8));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: L.lamp }));
  instanced(lampShade, lampMat, F.desks.map((d) => ({ x: d.x - d.w * 0.3, y: 0.8, z: d.z - d.d * 0.2, sx: 1, sy: 1, sz: 1 })));
  const lampGlow = basic(L.lamp, 0.28);
  instanced(new THREE.CircleGeometry(0.8, 14).rotateX(-Math.PI / 2), lampGlow, F.desks.map((d) => ({ x: d.x - d.w * 0.3, y: 0.012, z: d.z - d.d * 0.2, sx: 1, sy: 1, sz: 1 })));

  // The door: two posts and a lintel, with the way out left open (the same page-edge look as the Home door).
  const frame = toon(L.frame), base = toon(L.base), { g, d } = doorFrame("room"), yaw = Math.atan2(d.x, d.z);
  const door = new THREE.Group(); door.position.set(g.x, 0, g.z); door.rotation.y = yaw; group.add(door);
  const postG = keep(postGeo(0.3, 2.5, 0.3));
  const posts = new THREE.InstancedMesh(postG, frame, 2);
  doorPosts("room").forEach((p, i) => { dummy.position.set(p.x - g.x, 1.25, p.z - g.z); dummy.rotation.set(0, -yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); });
  posts.frustumCulled = false; door.add(posts);
  const lintel = new THREE.Mesh(keep(lintelGeo(gap * 2 + 0.3, 0.22, 0.34)), base); lintel.position.set(0, 2.45, 0); door.add(lintel);

  // Spots. Day pages are a folded page with a gold glint; dusk spots are only a violet glint that cross-fades with the dusk level.
  const day = READING_SPOTS.filter((s) => !s.dusk), dusk = READING_SPOTS.filter((s) => s.dusk);
  const pageGeo = keep(softBox(0.8, 0.035, 0.4, 0.012, 1));
  const pageMat = keep(new THREE.MeshToonMaterial({ color: PALETTE.paper, gradientMap: gm })), pageBack = toon("#e6d8b4");
  const bases = new THREE.InstancedMesh(pageGeo, pageBack, day.length), flaps = new THREE.InstancedMesh(pageGeo, pageMat, day.length);
  for (const im of [bases, flaps]) { im.frustumCulled = false; group.add(im); }
  const glintGeo = keep(new THREE.OctahedronGeometry(0.14)), glowGeo = keep(new THREE.CircleGeometry(0.7, 18).rotateX(-Math.PI / 2));
  const dayGlint = keep(new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const dayGlow = basic(PALETTE.gold, 0.35), duskGlint = keep(new THREE.MeshBasicMaterial({ color: L.dusk, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })), duskGlow = basic(L.dusk, 0);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.count = n; im.frustumCulled = false; group.add(im); return im; };
  const dg = mk(glintGeo, dayGlint, day.length), dw = mk(glowGeo, dayGlow, day.length), ug = mk(glintGeo, duskGlint, dusk.length), uw = mk(glowGeo, duskGlow, dusk.length);

  // The finds: one shared mesh per look, only the active one is shown. The moth-page and the lantern ink are the dusk looks.
  const mothGeo = keep(((): THREE.BufferGeometry => { // two wings in a shallow V, a paper moth
    const gp = new THREE.BufferGeometry(), v = [0, 0, 0, 0.28, 0.1, 0.18, 0.28, 0.1, -0.18, 0, 0, 0, -0.28, 0.1, -0.18, -0.28, 0.1, 0.18];
    gp.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); gp.computeVertexNormals(); return gp;
  })());
  const lanternGeo = keep(lathe([[0, 0], [0.1, 0], [0.13, 0.05], [0.13, 0.2], [0.06, 0.28], [0.06, 0.34], [0, 0.34]], 10));
  const finds: Record<Look, THREE.Mesh> = {
    ink: new THREE.Mesh(keep(wobbleSphere(0.22, 0.02, 11, 10)), toon(PALETTE.ink)),
    glyph: new THREE.Mesh(keep(softBox(0.3, 0.3, 0.3, 0.03, 1)), toon(PALETTE.watercolorBlue)),
    scrap: new THREE.Mesh(keep(softBox(0.4, 0.04, 0.3, 0.012, 1)), toon(PALETTE.gold)),
    egg: new THREE.Mesh(keep(wobbleSphere(0.2, 0.02, 12, 12)), toon(PALETTE.paper)),
    plain: new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.16)), toon(PALETTE.gold)),
    moth: new THREE.Mesh(mothGeo, keep(new THREE.MeshToonMaterial({ color: PALETTE.paper, side: THREE.DoubleSide, gradientMap: gm }))),
    lantern: new THREE.Mesh(lanternGeo, keep(new THREE.MeshBasicMaterial({ color: L.lamp }))),
  };
  for (const m of Object.values(finds)) { m.visible = false; m.frustumCulled = false; group.add(m); }

  const place = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number, ry = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.instanceMatrix.needsUpdate = true; };
  const flapAt = (i: number, s: ReadingSpot, open: number) => { // hinged at the middle; closed it lies folded over the base
    const a0 = (s.x * 7.3 + s.z * 3.1) % (Math.PI * 2);
    place(bases, i, s.x - Math.sin(a0) * 0.2, 0.02, s.z - Math.cos(a0) * 0.2, 1, a0);
    const ang = (s.x * 7.3 + s.z * 3.1) % (Math.PI * 2), rx = -Math.PI * (1 - open) + 0.04 * (1 - open);
    dummy.position.set(s.x, 0.04, s.z); dummy.rotation.set(0, ang, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    const hinge = dummy.matrix.clone(), rot = new THREE.Matrix4().makeRotationX(rx), off = new THREE.Matrix4().makeTranslation(0, 0, 0.2);
    flaps.setMatrixAt(i, hinge.multiply(rot).multiply(off)); flaps.instanceMatrix.needsUpdate = true;
  };
  day.forEach((s, i) => flapAt(i, s, 0));

  return {
    group,
    setOpened(opened) { day.forEach((s, i) => flapAt(i, s, opened.has(s.id) ? 1 : 0)); },
    update({ t, level, reduced, opened, active, target }) {
      day.forEach((s, i) => {
        const isOpen = opened.has(s.id), isActive = active?.id === s.id;
        flapAt(i, s, isActive ? unfoldFrame(active!.since, reduced).fold : isOpen ? 1 : 0);
        const show = !isOpen && !isActive, bob = reduced ? 0 : Math.sin(t * 1.3 + i) * 0.06, sc = show ? (reduced ? 1 : 1 + MARGINS.glint.pulse * Math.sin((t / MARGINS.glint.pulseSeconds) * Math.PI * 2 + i)) : 0.0001;
        place(dg, i, s.x, 0.9 + bob, s.z, sc, reduced ? 0.6 : t * 0.9 + i); place(dw, i, s.x, 0.025, s.z, sc);
      });
      duskGlint.opacity = level; duskGlow.opacity = level * 0.35; // a plain cross-fade; the glint only turns when motion is allowed
      dusk.forEach((s, i) => {
        const isOpen = opened.has(s.id), isActive = active?.id === s.id, show = !isOpen && !isActive && level > 0.01;
        const bob = reduced ? 0 : Math.sin(t * 1.1 + i) * 0.05, sc = show ? 1 : 0.0001;
        place(ug, i, s.x, 0.9 + bob, s.z, sc, reduced ? 0.6 : t * 0.7 + i); place(uw, i, s.x, 0.025, s.z, sc);
      });
      dayGlint.opacity = 0.9;
      for (const m of Object.values(finds)) m.visible = false;
      if (active) {
        const s = READING_SPOTS[active.id], f = unfoldFrame(active.since, reduced), m = finds[active.look] ?? finds.plain;
        if (f.rise > 0 && !f.done) {
          m.visible = true;
          const rise = f.rise * MARGINS.unfold.riseHeight + 0.12, tx = target.x - s.x, ty = 1.1 - rise, tz = target.z - s.z;
          m.position.set(s.x + tx * f.arc, rise + ty * f.arc + Math.sin(Math.PI * f.arc) * MARGINS.unfold.arcHeight + (s.dusk ? 0.6 : 0), s.z + tz * f.arc);
          m.rotation.set(0, f.spin, 0); m.scale.setScalar(Math.max(0.05, 1 - 0.6 * f.arc));
          if (active.look === "moth") m.scale.x *= reduced ? 0.85 : 0.6 + 0.4 * Math.abs(Math.sin(t * 9)); // wings static and slightly open when motion is reduced
        }
      }
    },
    dispose() { group.removeFromParent(); disposeTree(group); for (const o of own) o.dispose(); own.length = 0; bases.dispose(); flaps.dispose(); dg.dispose(); dw.dispose(); ug.dispose(); uw.dispose(); },
  };
}

/** The door in the Margins: two posts, a lintel and a picture signpost (a pole with a small board and an open book, no words). */
export function buildReadingDoor(): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group(), own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };
  const gm = keep(makeToonGradient());
  const post = keep(new THREE.MeshToonMaterial({ color: READING.look.frame, gradientMap: gm })), ink = keep(new THREE.MeshToonMaterial({ color: READING.look.base, gradientMap: gm })), paper = keep(new THREE.MeshToonMaterial({ color: PALETTE.paper, side: THREE.DoubleSide, gradientMap: gm }));
  const { g, d } = doorFrame("margins"); group.position.set(g.x, 0, g.z); group.rotation.y = Math.atan2(d.x, d.z);
  const s = READING.door.postOffset;
  for (const k of [-1, 1]) {
    const p = new THREE.Mesh(keep(postGeo(0.3, 2.5, 0.3, k === 1 ? 1.5 : 0)), post); p.position.set(k * s, 1.25, 0); addOutline(p, undefined, PROP_EDGE_ANGLE); group.add(p);
  }
  const lintel = new THREE.Mesh(keep(lintelGeo(s * 2 + 0.3, 0.24, 0.34)), ink); lintel.position.set(0, 2.5, 0); addOutline(lintel, "#fffaf0", PROP_EDGE_ANGLE); group.add(lintel);
  // The picture signpost beside the door: world position from signPost(), turned to face the way you come from.
  const sp = signPost(), pole = new THREE.Mesh(keep(postGeo(0.1, 1.5, 0.1)), post);
  const local = new THREE.Vector3(sp.x - g.x, 0, sp.z - g.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.rotation.y);
  pole.position.set(local.x, 0.75, local.z); group.add(pole);
  const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, 0.46)), paper); board.position.set(local.x, 1.5, local.z + 0.07); group.add(board);
  const pageL = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.22, 0.28)), ink), pageR = new THREE.Mesh(pageL.geometry, ink);
  pageL.position.set(local.x - 0.12, 1.5, local.z + 0.075); pageL.rotation.z = 0.12; pageR.position.set(local.x + 0.12, 1.5, local.z + 0.075); pageR.rotation.z = -0.12; // an open book, as two dark pages
  group.add(pageL, pageR);
  return { group, dispose() { group.removeFromParent(); disposeTree(group); for (const o of own) o.dispose(); own.length = 0; } };
}
