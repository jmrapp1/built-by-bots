// W5: the folded pages lying in the World today. Built on entering the garden zone, freed on leaving. Shapes only, no text.
// A page is a small folded paper on the ground with a thin glow that can be seen from a distance; an opened one is gone.
import * as THREE from "three";
import { pillarGeo } from "@/lib/propShapes";
import { SPOTS, spotKey, type WorldSpot } from "@/lib/worldSpots";

export type SpotsScene = {
  group: THREE.Group;
  setOpened: (opened: ReadonlySet<string>) => void;
  pop: (key: string, now: number) => void; // the page lifts and fades away (seconds clock)
  update: (now: number, reduced: boolean) => void;
  dispose: () => void;
};

export function buildSpotsScene(spots: WorldSpot[]): SpotsScene {
  const M = SPOTS.mark;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const own = <T extends THREE.BufferGeometry | THREE.Material>(o: T): T => { (o instanceof THREE.BufferGeometry ? geos : mats).push(o as never); return o; };
  const paper = own(new THREE.MeshToonMaterial({ color: M.paper, side: THREE.DoubleSide, transparent: true }));
  const ink = own(new THREE.MeshToonMaterial({ color: M.ink, transparent: true }));
  const glow = own(new THREE.MeshBasicMaterial({ color: M.glow, transparent: true, opacity: 0.28, depthWrite: false }));
  const sheet = own(new THREE.PlaneGeometry(0.9, 0.7));
  const fold = own(new THREE.PlaneGeometry(0.9, 0.35));
  const pillar = own(pillarGeo(0.08, 0.2, M.pillarHeight));
  const rows = new Map<string, { g: THREE.Group; spot: WorldSpot; since: number; phase: number }>();
  for (const s of spots) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(sheet, paper); a.rotation.x = -Math.PI / 2 + 0.12; a.position.y = 0.06; g.add(a);
    const b = new THREE.Mesh(fold, paper); b.rotation.x = -Math.PI / 2 - 0.5; b.position.set(0, 0.12, -0.2); g.add(b);
    const m = new THREE.Mesh(sheet, ink); m.scale.set(0.35, 0.06, 1); m.rotation.x = -Math.PI / 2 + 0.12; m.position.set(0, 0.075, 0.1); g.add(m); // a stroke of ink, not a letter
    const p = new THREE.Mesh(pillar, glow); p.position.y = M.pillarHeight / 2; g.add(p);
    g.position.set(s.x, 0, s.z); g.rotation.y = (s.id * 1.7 + s.x) % (Math.PI * 2);
    group.add(g);
    rows.set(spotKey(s.region, s.id), { g, spot: s, since: -1, phase: (s.x * 0.37 + s.z * 0.11) % 6.28 });
  }
  return {
    group,
    setOpened(opened) { for (const [k, r] of rows) { r.g.visible = !opened.has(k); r.since = -1; r.g.position.y = 0; paper.opacity = 1; } },
    pop(key, now) { const r = rows.get(key); if (r) r.since = now; },
    update(now, reduced) {
      for (const r of rows.values()) {
        if (!r.g.visible) continue;
        if (r.since >= 0) {
          const f = Math.min(1, (now - r.since) / (reduced ? 0.2 : M.popSeconds));
          r.g.position.y = reduced ? 0 : f * 1.2; r.g.scale.setScalar(1 - f * 0.6);
          if (f >= 1) { r.g.visible = false; r.g.scale.setScalar(1); r.g.position.y = 0; }
        } else r.g.position.y = reduced ? 0 : Math.sin(now * 1.4 + r.phase) * 0.04;
      }
      glow.opacity = reduced ? 0.28 : 0.24 + 0.08 * Math.sin(now * 1.1);
    },
    dispose() { group.removeFromParent(); geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); rows.clear(); },
  };
}
