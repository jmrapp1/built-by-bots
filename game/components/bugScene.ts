// S32: the paper insects. Look only: nothing here collides, is clickable, is saved or is sent. One shared body and wing shape per kind,
// drawn as instances: three draw calls per kind (ink body, ink wing outline, paper wing), at most nine in all. The wing "line" is a
// slightly larger ink wing behind the paper one, so no LineSegments (they cannot be instanced). No transparency: dusk shrinks them away.
import * as THREE from "three";
import { wobbleSphere } from "@/lib/shapes";
import { applyAway, insectPose, newPose, type BugCfg, type BugKind, type BugSim } from "@/lib/bugs";

export type BugScene = {
  group: THREE.Group;
  /** Place every active insect for this frame. Allocation-free: reuses one pose and one Object3D. */
  update(sim: BugSim, t: number, reduced: boolean, player: { x: number; z: number }, groundAt: (x: number, z: number) => number): void;
  dispose(): void;
};

const KINDS: BugKind[] = ["flutterer", "beetle", "dragonfly"];
// Body shape per kind: [length, width, height] in units of `size`.
const BODY: Record<BugKind, [number, number, number]> = { flutterer: [0.9, 0.35, 0.3], beetle: [1.3, 0.9, 0.55], dragonfly: [3.2, 0.22, 0.22] };
// Wing shape per kind: [span, chord, sweep] (a flat kite from the body outward).
const WING: Record<BugKind, [number, number, number]> = { flutterer: [1.4, 1.1, 0.3], beetle: [0.7, 1.0, 0], dragonfly: [1.9, 0.5, -0.2] };

function wingGeo(span: number, chord: number, sweep: number, grow = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), c = chord / 2, e = grow;
  const v = [0, 0, -c * 0.25, span + e, 0, sweep - c * 0.5 - e, span * 0.8 + e, 0, sweep + c * 0.5 + e, 0, 0, c * 0.75 + e];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function buildBugScene(cfg: BugCfg): BugScene {
  const group = new THREE.Group();
  group.visible = false;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };
  type Set = { kind: BugKind; body: THREE.InstancedMesh; ink: THREE.InstancedMesh; paper: THREE.InstancedMesh };
  const sets: Set[] = [];
  for (const kind of KINDS) {
    const k = cfg.kinds[kind];
    let n = 0;
    for (const s of cfg.spots) if (s.kind === kind) n += Math.min(s.count, cfg.maxPerSpot);
    if (n === 0) continue;
    const [bl, bw, bh] = BODY[kind], [sp, ch, sw] = WING[kind];
    const bodyGeo = own(wobbleSphere(0.5, 0.06, 3, 6)); bodyGeo.scale(bw, bh, bl);
    const mk = (geo: THREE.BufferGeometry, color: string, count: number) => {
      const m = new THREE.InstancedMesh(geo, own(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })), count);
      m.frustumCulled = false; m.count = 0; m.raycast = () => {}; group.add(m); return m;
    };
    const paperW = own(wingGeo(sp, ch, sw)), inkW = own(wingGeo(sp, ch, sw, 0.07));
    inkW.translate(0, -0.004, 0);
    sets.push({ kind, body: mk(bodyGeo, k.ink, n), ink: mk(inkW, k.ink, n * 2), paper: mk(paperW, k.paper, n * 2) });
    // The paper wing is lifted a hair above its ink outline so the outline shows round the edge.
    paperW.translate(0, 0.004, 0);
  }
  const o = new THREE.Object3D(), pose = newPose();
  o.rotation.order = "YXZ";
  return {
    group,
    update(sim, t, reduced, player, groundAt) {
      const lvl = sim.level;
      group.visible = lvl > 0.001 && sim.active.length > 0;
      for (const s of sets) { s.body.count = 0; s.ink.count = 0; s.paper.count = 0; }
      if (!group.visible) return;
      for (const a of sim.active) {
        const sp = sim.cfg.spots[a.idx], kind = sp.kind as BugKind, set = sets.find((q) => q.kind === kind);
        if (!set) continue;
        const k = sim.cfg.kinds[kind], st = sim.spots[a.idx], sz = k.size * lvl;
        for (let i = 0; i < a.count; i++) {
          insectPose(pose, kind, sp, a.idx, i, t, st.watch, reduced, sim.cfg);
          applyAway(pose, player, st.away);
          const y = groundAt(pose.x, pose.z) + pose.y;
          o.position.set(pose.x, y, pose.z);
          o.rotation.set(0, pose.heading, 0);
          o.scale.setScalar(sz);
          o.updateMatrix();
          set.body.setMatrixAt(set.body.count++, o.matrix);
          const roll = pose.open * 1.15;
          for (const side of [1, -1]) {
            o.rotation.set(0, pose.heading, side * roll);
            o.scale.set(sz * side, sz, sz);
            o.updateMatrix();
            set.ink.setMatrixAt(set.ink.count++, o.matrix);
            set.paper.setMatrixAt(set.paper.count++, o.matrix);
          }
        }
      }
      for (const s of sets) {
        s.body.instanceMatrix.needsUpdate = true; s.ink.instanceMatrix.needsUpdate = true; s.paper.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const x of owned) x.dispose(); for (const s of sets) { s.body.dispose(); s.ink.dispose(); s.paper.dispose(); } group.clear(); },
  };
}
