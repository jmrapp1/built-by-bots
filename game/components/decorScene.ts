// Slice 2 (client only): the test decorations and plot markers in the Home room, as three.js objects.
// Everything is procedural and owned here: dispose() frees all of it. Rules and motion live in lib/decor.ts, numbers in data/decor.json.
import * as THREE from "three";
import { HOME_ROOM } from "@/lib/home";
import { DECOR, M, PLOT_POSES, advanceSlot, decorationOf, inkDrops, markerPose, newSlot, setSlot, slotPose, type Decoration, type Placed, type Slot } from "@/lib/decor";

export type DecorScene = {
  group: THREE.Group;
  /** Show these placements (plot id -> decoration id). Changes play their motion from `now` (seconds). */
  show(placed: Placed, now: number): void;
  /** Show these placements at once, with no motion (entering the room). */
  snap(placed: Placed): void;
  /** Advance every plot to `now` (seconds). `near` is the plot in reach, if any. */
  update(now: number, reduced: boolean, near: string | null): void;
  dispose(): void;
};

const colour = (c: string): string => (DECOR.palette as Record<string, string>)[c] ?? (HOME_ROOM.look as Record<string, string>)[c] ?? c;

export function buildDecorScene(): DecorScene {
  const group = new THREE.Group(); group.name = "decor";
  const own: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { own.push(x); return x; };

  const dropMat = keep(new THREE.MeshBasicMaterial({ color: HOME_ROOM.look.base, transparent: true, opacity: 0, depthWrite: false }));
  const dropGeo = keep(new THREE.SphereGeometry(1, 10, 8));
  // A page corner: two thin strips meeting at a right angle, lying on the floor (or standing on the wall), local +z is into the room.
  const bar = keep(new THREE.PlaneGeometry(0.34, 0.05)), L = 0.17;
  type Cell = { slot: Slot; holder: THREE.Group; marker: THREE.Group; mm: THREE.MeshBasicMaterial; built: string | null; obj: THREE.Group | null; mats: THREE.Material[]; drops: THREE.Mesh[]; wall: boolean };
  const cells = new Map<string, Cell>();
  for (const p of PLOT_POSES) {
    const holder = new THREE.Group(); holder.position.set(p.x, 0, p.z); holder.rotation.y = p.yaw; group.add(holder);
    const marker = new THREE.Group(); holder.add(marker);
    const mm = keep(new THREE.MeshBasicMaterial({ color: HOME_ROOM.look.base, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const a = new THREE.Mesh(bar, mm), b = new THREE.Mesh(bar, mm);
    b.rotation.z = Math.PI / 2; b.position.set(-L + 0.025, L - 0.025, 0);
    const corner = new THREE.Group(); corner.add(a, b);
    if (p.kind === "floor") { corner.rotation.x = -Math.PI / 2; corner.position.set(-0.17, 0.016, 0.17); }
    else { corner.position.set(-0.17, 1.1, 0.012); }
    marker.add(corner);
    const drops = [0, 1].map(() => { const m = new THREE.Mesh(dropGeo, dropMat.clone()); m.visible = false; holder.add(m); own.push(m.material as THREE.Material); return m; });
    cells.set(p.id, { slot: newSlot(), holder, marker, mm, built: null, obj: null, mats: [], drops, wall: p.kind === "wall" });
  }

  const freeObj = (c: Cell) => {
    if (c.obj) { c.holder.remove(c.obj); c.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    for (const m of c.mats) m.dispose();
    c.obj = null; c.mats = []; c.built = null;
  };
  const buildObj = (d: Decoration): { obj: THREE.Group; mats: THREE.Material[] } => {
    const obj = new THREE.Group(), mats: THREE.Material[] = [];
    for (const q of d.parts) {
      const mat = new THREE.MeshToonMaterial({ color: colour(q.c), transparent: true });
      if (q.glow) { mat.emissive = new THREE.Color(colour(q.c)); mat.emissiveIntensity = q.glow; }
      mats.push(mat);
      const geo = q.t === "box" ? new THREE.BoxGeometry(q.s[0], q.s[1], q.s[2])
        : q.t === "cyl" ? new THREE.CylinderGeometry(q.s[0], q.s[1], q.s[2], 14)
        : q.t === "sphere" ? new THREE.SphereGeometry(q.s[0], 14, 10)
        : new THREE.CylinderGeometry(q.s[0], q.s[0], 0.004, 28);
      const m = new THREE.Mesh(geo, mat); m.position.set(q.p[0], q.p[1], q.p[2]); if (q.ry) m.rotation.y = q.ry;
      obj.add(m);
    }
    return { obj, mats };
  };
  const setOpacity = (c: Cell, o: number) => { for (const m of c.mats) m.opacity = o; };

  return {
    group,
    show(placed, now) { for (const [id, c] of cells) c.slot = setSlot(c.slot, placed[id] ?? null, now); },
    snap(placed) { for (const [id, c] of cells) c.slot = newSlot(placed[id] ?? null); },
    update(now, reduced, near) {
      for (const [id, c] of cells) {
        c.slot = advanceSlot(c.slot, now, reduced);
        if (c.slot.id !== c.built) {
          freeObj(c);
          const d = c.slot.id ? decorationOf(c.slot.id) : undefined;
          if (d) { const b = buildObj(d); c.obj = b.obj; c.mats = b.mats; c.built = d.id; c.holder.add(b.obj); }
        }
        const pose = slotPose(c.slot, now, reduced);
        if (c.obj) {
          c.obj.visible = pose.visible;
          c.obj.position.set(0, pose.y, 0); c.obj.position.x = c.wall ? 0 : pose.x; // a wall piece lifts but does not drift off the wall
          c.obj.scale.set(pose.sx, pose.sy, pose.sz);
          setOpacity(c, pose.opacity);
        }
        const mk = markerPose(c.slot, now, reduced, near === id);
        c.marker.visible = mk.opacity > 0.001;
        c.marker.scale.setScalar(mk.scale);
        c.mm.opacity = mk.opacity;
        const dr = c.slot.phase === "placing" ? inkDrops(now - c.slot.since - M.fall, reduced) : [];
        c.drops.forEach((m, i) => {
          const q = dr[i]; m.visible = !!q;
          if (q) { m.position.set(q.x, q.y, 0.05); m.scale.setScalar(q.scale); (m.material as THREE.MeshBasicMaterial).opacity = q.opacity; }
        });
      }
    },
    dispose() {
      group.removeFromParent();
      for (const c of cells.values()) freeObj(c);
      for (const d of own) d.dispose();
      own.length = 0; cells.clear();
    },
  };
}
