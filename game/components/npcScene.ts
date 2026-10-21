// The neighbours as three.js objects (slices N1, N2): each look is built from simple shapes, plus a picture
// bubble. No assets. All rules and timings live in lib/npcs.ts.
import * as THREE from "three";
import { ICON_PATHS, bubbleLook, lerpAngle, ease, sway, type IconName, type Npc } from "@/lib/npcs";

const mat = (color: number | string, side: THREE.Side = THREE.FrontSide) => new THREE.MeshToonMaterial({ color, side });

// A paper bubble with icons drawn from the shared icon paths.
function drawBubble(canvas: HTMLCanvasElement, icons: IconName[]): void {
  const g = canvas.getContext("2d");
  if (!g) return;
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#fffaf0"; g.strokeStyle = "#2b2a33"; g.lineWidth = 5; g.lineJoin = "round";
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 30, 22);
  g.moveTo(w / 2 - 10, h - 24); g.lineTo(w / 2, h - 6); g.lineTo(w / 2 + 10, h - 24);
  g.fill(); g.stroke();
  const size = 52, gap = 12, total = icons.length * size + (icons.length - 1) * gap;
  icons.forEach((name, i) => {
    g.save();
    g.translate((w - total) / 2 + i * (size + gap), 12 + ((h - 30) - 12 - size) / 2 + 3);
    g.scale(size / 24, size / 24);
    g.strokeStyle = name === "question" ? "#3b4a8c" : "#2b2a33"; g.lineWidth = 2; g.lineCap = "round"; g.lineJoin = "round";
    g.stroke(new Path2D(ICON_PATHS[name]));
    g.restore();
  });
}

export type NpcScene = {
  group: THREE.Group;
  /** Update each frame. `turn` 0..1 toward the player, `bubble` 0..1, `facePlayer` is the yaw to face. */
  update(a: { t: number; turn: number; bubble: number; faceYaw: number; restYaw: number; reduced: boolean; icons: IconName[] }): void;
  /** The mesh group, for tapping. */
  hit: THREE.Object3D;
  dispose(): void;
};

export function buildNpc(npc: Npc): NpcScene {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => (disposables.push(d), d);
  const cream = keep(mat("#e8dcc0")), dark = keep(mat("#2b2a33")), wing = keep(mat("#cdb892", THREE.DoubleSide)), apron = keep(mat("#6f8fa8")), fur = keep(mat("#f4ecd6"));
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
    const o = new THREE.Mesh(keep(geo), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); body.add(o); return o;
  };
  if (npc.look === "owl") { // the Proof-reader: a round nearsighted owl with big spectacles and a quill
    const brown = keep(mat("#a58a64")), belly = keep(mat("#eadfc4")), gold = keep(mat("#e3a83b")), ink = keep(mat("#3b4a8c"));
    add(new THREE.SphereGeometry(0.52, 20, 14), brown, 0, 0.62, 0, 1, 1.15, 0.95);              // body
    add(new THREE.SphereGeometry(0.38, 18, 14), belly, 0, 0.55, 0.22, 0.9, 1.05, 0.7);          // belly
    add(new THREE.SphereGeometry(0.42, 20, 14), brown, 0, 1.4, 0.02, 1.1, 0.95, 1);             // head
    for (const k of [-1, 1]) {
      const lens = add(new THREE.TorusGeometry(0.15, 0.025, 8, 20), dark, k * 0.17, 1.44, 0.4);  // spectacles
      lens.rotation.y = 0;
      add(new THREE.SphereGeometry(0.06, 8, 8), dark, k * 0.17, 1.44, 0.4);                      // eyes
      const ear = add(new THREE.ConeGeometry(0.1, 0.26, 6), brown, k * 0.28, 1.84, 0); ear.rotation.z = -k * 0.3; // ear tufts
      const wg = add(new THREE.CircleGeometry(0.42, 16), brown, k * 0.5, 0.62, -0.05, 0.7, 1.25, 1); wg.rotation.y = k * 1.2; // wings
    }
    add(new THREE.ConeGeometry(0.07, 0.14, 6), gold, 0, 1.33, 0.46).rotation.x = Math.PI / 2;     // beak
    add(new THREE.BoxGeometry(0.1, 0.02, 0.1), dark, 0, 1.43, 0.42);                              // bridge
    const q = add(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 5), belly, 0.5, 1.0, 0.25); q.rotation.z = -0.5; // the quill
    add(new THREE.SphereGeometry(0.03, 6, 6), ink, 0.72, 1.36, 0.25);
  } else if (npc.look === "traveller") { // the Wanderer: a small hooded ink traveller with a pack and a staff
    const cloak = keep(mat("#3f5a58")), hood = keep(mat("#2f4745")), face = keep(mat("#1d1c24")), strap = keep(mat("#8a6a45")), roll = keep(mat("#e8dcc0")), tip = keep(mat("#e3a83b"));
    add(new THREE.ConeGeometry(0.55, 1.4, 18), cloak, 0, 0.7, 0);                                   // cloak
    add(new THREE.SphereGeometry(0.34, 18, 14), hood, 0, 1.5, 0, 1, 1.05, 1.05);                      // hood
    add(new THREE.ConeGeometry(0.2, 0.32, 12), hood, 0, 1.9, -0.1).rotation.x = -0.5;                 // hood tip
    add(new THREE.SphereGeometry(0.24, 14, 12), face, 0, 1.47, 0.14, 1, 1, 0.8);                      // shadowed face
    for (const k of [-1, 1]) add(new THREE.SphereGeometry(0.045, 8, 8), keep(mat("#fffaf0")), k * 0.09, 1.5, 0.3); // eyes
    add(new THREE.BoxGeometry(0.46, 0.55, 0.28), strap, 0, 0.95, -0.42);                              // pack
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), roll, 0, 1.3, -0.42).rotation.z = Math.PI / 2; // bedroll
    for (const k of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.6, 0.03), strap, k * 0.16, 0.95, 0.2);  // straps
    const st = add(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 6), strap, 0.5, 0.85, 0.2);            // staff
    st.rotation.z = -0.08;
    add(new THREE.SphereGeometry(0.06, 8, 8), tip, 0.52, 1.72, 0.2);
  } else {
    add(new THREE.SphereGeometry(0.5, 20, 14), cream, 0, 0.72, 0, 1, 1.35, 0.95);           // body
    add(new THREE.SphereGeometry(0.46, 20, 14), apron, 0, 0.55, 0.12, 0.95, 0.9, 0.9);      // apron
    add(new THREE.SphereGeometry(0.34, 18, 14), fur, 0, 1.52, 0.04);                        // head
    for (const k of [-1, 1]) {
      add(new THREE.SphereGeometry(0.05, 8, 8), dark, k * 0.13, 1.56, 0.34);                // eyes
      const a = add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), dark, k * 0.14, 1.9, 0.02); // antennae
      a.rotation.z = -k * 0.35;
      const w = add(new THREE.CircleGeometry(0.62, 18), wing, k * 0.34, 0.95, -0.42, 1, 1.25, 1); // folded wings
      w.rotation.y = -k * 0.45;
      w.rotation.z = k * 0.12;
    }
    add(new THREE.BoxGeometry(0.34, 0.26, 0.1), dark, 0.38, 0.8, 0.36).rotation.z = -0.3;  // the book she holds
    add(new THREE.BoxGeometry(0.3, 0.22, 0.04), keep(mat("#fffaf0")), 0.38, 0.8, 0.42).rotation.z = -0.3;

  }

  // The bubble: a sprite, redrawn only when its icons change.
  const canvas = document.createElement("canvas");
  canvas.width = 192; canvas.height = 112;
  const tex = keep(new THREE.CanvasTexture(canvas));
  tex.colorSpace = THREE.SRGBColorSpace;
  const sm = keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  const bubble = new THREE.Sprite(sm);
  bubble.position.set(0, 2.55, 0);
  bubble.scale.set(0.01, 0.01, 1);
  group.add(bubble);
  let iconKey = "";

  return {
    group,
    hit: body,
    update({ t, turn, bubble: b, faceYaw, restYaw, reduced, icons }) {
      group.rotation.y = lerpAngle(restYaw, faceYaw, reduced ? turn : ease(turn));
      body.rotation.z = sway(t, reduced);
      body.position.y = reduced ? 0 : Math.sin(t * 1.6 + 1) * 0.012;
      const key = icons.join(",");
      if (key !== iconKey) { iconKey = key; drawBubble(canvas, icons); tex.needsUpdate = true; }
      const look = bubbleLook(b, reduced);
      sm.opacity = look.opacity;
      bubble.visible = look.opacity > 0.01;
      bubble.scale.set(1.5 * look.scale, 0.875 * look.scale, 1);
    },
    dispose() { group.removeFromParent(); for (const d of disposables) d.dispose(); void npc; },
  };
}
