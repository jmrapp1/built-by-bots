// H2: the Home room as three.js objects. Everything is procedural (no assets) and owned here: dispose() frees all of it.
// Rules and sizes live in lib/home.ts and data/home.json.
import * as THREE from "three";
import { HOME_ROOM, doorFrame, doorPosts } from "@/lib/home";
import { addOutline, disposeTree } from "@/lib/outline";
import { makeToonGradient } from "@/lib/inkToon";

export type HomeScene = { group: THREE.Group; dispose(): void };

export function buildHomeScene(): HomeScene {
  const R = HOME_ROOM.room, L = HOME_ROOM.look, group = new THREE.Group();
  group.name = "home-room";
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };
  const gm = keep(makeToonGradient());
  const toon = (c: string, side?: THREE.Side) => keep(new THREE.MeshToonMaterial({ color: c, side, gradientMap: gm }));
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ink = false) => { const m = new THREE.Mesh(keep(geo), mat); m.position.set(x, y, z); if (ink) addOutline(m); group.add(m); return m; };

  // Floor: ruled paper. A tiny data texture (no canvas, no files): one pale row with a faint blue rule.
  const W = 4, H = 32, px = new Uint8Array(W * H * 4), fl = new THREE.Color(L.floor), ru = new THREE.Color(L.rule);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = y === 0 ? ru.clone().lerp(fl, 0.55) : fl, i = (y * W + x) * 4; px[i] = Math.round(c.r * 255); px[i + 1] = Math.round(c.g * 255); px[i + 2] = Math.round(c.b * 255); px[i + 3] = 255; }
  const tex = keep(new THREE.DataTexture(px, W, H, THREE.RGBAFormat)); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, R.depth / 1.1); tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const floor = mesh(new THREE.PlaneGeometry(R.width, R.depth), keep(new THREE.MeshToonMaterial({ map: tex, gradientMap: gm })), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;

  // Walls: paper with an ink baseboard. The south wall has a gap for the door.
  const wall = toon(L.wall), base = toon(L.base), t = R.wallThickness, h = R.wallHeight, gap = HOME_ROOM.door.postOffset;
  const wallBox = (w: number, d: number, x: number, z: number) => {
    mesh(new THREE.BoxGeometry(w, h, d), wall, x, h / 2, z, true);
    mesh(new THREE.BoxGeometry(w + 0.02, 0.28, d + 0.02), base, x, 0.14, z);
  };
  wallBox(R.width + 2 * t, t, 0, -R.depth / 2 - t / 2);
  wallBox(t, R.depth, -R.width / 2 - t / 2, 0);
  wallBox(t, R.depth, R.width / 2 + t / 2, 0);
  const sw = R.width / 2 - gap;
  wallBox(sw, t, -R.width / 2 + sw / 2, R.depth / 2 + t / 2);
  wallBox(sw, t, R.width / 2 - sw / 2, R.depth / 2 + t / 2);
  mesh(new THREE.BoxGeometry(gap * 2, h - 2.4, t), wall, 0, 2.4 + (h - 2.4) / 2, R.depth / 2 + t / 2, true); // the wall above the doorway

  // The door: two frame posts and a lintel, with the way out left open. Same page-edge look as the gate.
  const frame = toon(L.frame), { g, d } = doorFrame("room"), yaw = Math.atan2(d.x, d.z);
  const door = new THREE.Group(); door.position.set(g.x, 0, g.z); door.rotation.y = yaw; group.add(door);
  for (const p of doorPosts("room")) {
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 2.5, 0.3)), frame); post.position.set(p.x - g.x, 1.25, p.z - g.z); post.rotation.y = -yaw; addOutline(post); door.add(post);
  }
  const lintel = new THREE.Mesh(keep(new THREE.BoxGeometry(gap * 2 + 0.3, 0.22, 0.34)), base); lintel.position.set(0, 2.45, 0); addOutline(lintel); door.add(lintel);

  // A window of soft light on the north wall, and a pale glow patch on the floor under it (the "soft light"; the scene light itself is fixed daylight).
  const win = toon(L.window, THREE.DoubleSide); (win as THREE.MeshToonMaterial).emissive = new THREE.Color(L.window); (win as THREE.MeshToonMaterial).emissiveIntensity = 0.55;
  mesh(new THREE.PlaneGeometry(2.2, 1.5), win, 0, 1.9, -R.depth / 2 + 0.02);
  const glow = keep(new THREE.MeshBasicMaterial({ color: L.window, transparent: true, opacity: 0.28, depthWrite: false }));
  const patch = mesh(new THREE.PlaneGeometry(2.4, 1.8), glow, 0, 0.012, -R.depth / 2 + 1.5); patch.rotation.x = -Math.PI / 2;

  return {
    group,
    dispose() { group.removeFromParent(); disposeTree(group); for (const d of own) d.dispose(); own.length = 0; },
  };
}

/** The garden-side door: a frame on the west edge. Built with the garden zone and freed with it. */
export function buildGardenDoor(): HomeScene {
  const group = new THREE.Group(), own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };
  const gm = keep(makeToonGradient());
  const post = keep(new THREE.MeshToonMaterial({ color: HOME_ROOM.look.frame, gradientMap: gm })), ink = keep(new THREE.MeshToonMaterial({ color: HOME_ROOM.look.base, gradientMap: gm })), paper = keep(new THREE.MeshToonMaterial({ color: HOME_ROOM.look.door, side: THREE.DoubleSide, gradientMap: gm }));
  const { g, d } = doorFrame("garden"); group.position.set(g.x, 0, g.z); group.rotation.y = Math.atan2(d.x, d.z);
  const s = HOME_ROOM.door.postOffset;
  for (const k of [-1, 1]) {
    const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 2.5, 0.3)), post); p.position.set(k * s, 1.25, 0); addOutline(p); group.add(p);
    const cap = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 0.12, 0.4)), ink); cap.position.set(k * s, 2.56, 0); addOutline(cap, "#fffaf0"); group.add(cap);
  }
  const lintel = new THREE.Mesh(keep(new THREE.BoxGeometry(s * 2 + 0.3, 0.24, 0.34)), ink); lintel.position.set(0, 2.5, 0); addOutline(lintel, "#fffaf0"); group.add(lintel);
  const sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(s * 2 - 0.3, 2.2)), paper); const a = 1.2; sheet.position.set(-s + Math.cos(a), 1.2, Math.sin(a)); sheet.rotation.y = -a; group.add(sheet); // a paper door, swung open into the room
  return { group, dispose() { group.removeFromParent(); disposeTree(group); for (const o of own) o.dispose(); own.length = 0; } };
}
