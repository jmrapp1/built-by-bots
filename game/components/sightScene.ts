// Night sights as three.js objects (slice T1): moth-pages, lantern ink and night glints. Simple shapes,
// no assets, no prizes. Rules, hours and captions live in lib/sights.ts and data/sights.json.
import * as THREE from "three";
import { SIGHTS, type SightData, type SightKind, type SightPoint } from "@/lib/sights";

const ease = (n: number) => { const t = Math.min(1, Math.max(0, n)); return t * t * (3 - 2 * t); };

type One = {
  kind: SightKind; x: number; z: number; g: THREE.Group; mats: { m: THREE.Material & { opacity: number }; base: number }[];
  wake: number; // 0..1: how awake it is (the player is near)
  moth?: THREE.Group; motes?: THREE.Mesh[]; glow?: THREE.Mesh; ring?: THREE.Mesh; told: boolean; circle: number;
};
export type SightScene = {
  group: THREE.Group;
  /** Update each frame. `level` 0..1 is the fade with the hour. Returns a caption the first time the player comes near one. */
  update(a: { t: number; dt: number; player: { x: number; z: number }; level: number; reduced: boolean }): string | null;
  count: number;
  dispose(): void;
};

// `data` is the set whose notice distances and captions apply (the Margins by default; the shore passes its own).
export function buildSights(points: SightPoint[], groundAt: (x: number, z: number) => number, data: SightData | null = SIGHTS): SightScene {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => (disposables.push(d), d);
  const list: One[] = [];
  const near = data?.notice.near ?? 3, far = data?.notice.far ?? 4.5;
  for (const p of points) {
    try {
      const g = new THREE.Group();
      g.position.set(p.x, groundAt(p.x, p.z), p.z);
      const o: One = { kind: p.kind, x: p.x, z: p.z, g, mats: [], wake: 0, told: false, circle: 0 };
      const mat = (color: number | string, base = 1, side: THREE.Side = THREE.FrontSide) => {
        const m = keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side }));
        o.mats.push({ m, base }); return m;
      };
      const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
        const mesh = new THREE.Mesh(keep(geo), m); mesh.position.set(x, y, z); g.add(mesh); return mesh;
      };
      g.rotation.y = (p.x * 7.3 + p.z * 3.1) % (Math.PI * 2);
      if (p.kind === "moth") {
        add(new THREE.BoxGeometry(0.7, 0.03, 0.9), mat("#fffaf0"), 0, 0.03, 0);            // the folded page
        add(new THREE.BoxGeometry(0.7, 0.012, 0.012), mat("#2b2a33", 0.7), 0, 0.05, 0);     // its fold
        const moth = new THREE.Group(); moth.position.set(0, 0.12, 0); g.add(moth);
        const wm = mat("#e6e8f4", 1, THREE.DoubleSide), bm = mat("#4a4a66");
        for (const k of [-1, 1]) { const w = new THREE.Mesh(keep(new THREE.CircleGeometry(0.13, 10)), wm); w.position.set(k * 0.1, 0, 0); w.rotation.x = -Math.PI / 2; w.scale.set(1, 1.3, 1); moth.add(w); }
        const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 8, 6)), bm); body.scale.set(1, 1, 2.4); moth.add(body);
        o.moth = moth;
      } else if (p.kind === "ink") {
        const puddle = add(new THREE.CircleGeometry(0.5, 20), mat("#2c3470"), 0, 0.02, 0); puddle.rotation.x = -Math.PI / 2;
        const glow = add(new THREE.CircleGeometry(0.34, 20), mat("#9fb4ff", 0.55), 0, 0.03, 0); glow.rotation.x = -Math.PI / 2; o.glow = glow;
        o.motes = [];
        for (let i = 0; i < 4; i++) { const m = add(new THREE.SphereGeometry(0.035, 6, 6), mat("#cdd8ff", 0.9), 0, 0.2, 0); m.visible = false; o.motes.push(m); }
      } else {
        const ring = add(new THREE.RingGeometry(0.34, 0.46, 28), mat("#fff0b8", 0.55), 0, 0.03, 0); ring.rotation.x = -Math.PI / 2; o.ring = ring;
      }
      g.visible = false;
      group.add(g); list.push(o);
    } catch { /* skip only this sight */ }
  }

  return {
    group,
    count: list.length,
    update({ t, dt, player, level, reduced }) {
      let caption: string | null = null;
      for (const o of list) {
        o.g.visible = level > 0.01;
        if (!o.g.visible) continue;
        const dist = Math.hypot(player.x - o.x, player.z - o.z);
        const target = dist <= near ? 1 : dist >= far ? 0 : 1 - (dist - near) / (far - near);
        const rate = dt / (reduced ? 0.15 : 0.8);
        o.wake = o.wake < target ? Math.min(target, o.wake + rate) : Math.max(target, o.wake - rate);
        const w = ease(o.wake);
        for (const { m, base } of o.mats) m.opacity = level * base;
        if (o.moth) { // lifts and circles once or twice, settles again; stays put with reduced motion
          if (reduced) o.moth.position.set(0, 0.12, 0);
          else {
            o.circle += dt * w * 2.2;
            const a = o.circle, r = 0.55 * w;
            o.moth.position.set(Math.cos(a) * r, 0.12 + 0.55 * w + Math.sin(t * 9) * 0.02 * w, Math.sin(a) * r);
            o.moth.rotation.y = -a;
            o.moth.scale.y = 1 + Math.sin(t * 24) * 0.12 * w;
          }
        }
        if (o.glow) { const m = o.mats.find((q) => q.m === (o.glow!.material as THREE.Material)); if (m) m.base = 0.4 + 0.5 * w; o.glow.scale.setScalar(1 + 0.25 * w + (reduced ? 0 : Math.sin(t * 1.5) * 0.04)); }
        if (o.motes) o.motes.forEach((mote, i) => {
          const on = !reduced && w > 0.05;
          mote.visible = on;
          if (on) { const u = (t * 0.35 + i / 4) % 1; mote.position.set(Math.sin(i * 2.4 + t) * 0.18, 0.1 + u * 0.9, Math.cos(i * 2.4 + t) * 0.18); mote.scale.setScalar(1 - u * 0.6); }
        });
        if (o.ring) { // blooms and fades when walked over
          const over = dist < 1.1 ? 1 - dist / 1.1 : 0;
          const m = o.mats.find((q) => q.m === (o.ring!.material as THREE.Material));
          if (m) m.base = 0.45 * (1 - over * 0.8);
          o.ring.scale.setScalar(reduced ? 1 : 1 + over * 0.9);
        }
        if (!o.told && level > 0.6 && dist <= near && data) { o.told = true; caption = data.captions[o.kind]; }
      }
      return caption;
    },
    dispose() { group.removeFromParent(); for (const d of disposables) d.dispose(); },
  };
}
