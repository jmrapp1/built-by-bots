// H2: props, landmarks, signposts and spots sit on the ground height. No WebGL needed: scene graph only.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldShell } from "@/components/worldShell";
import { buildSpotsScene } from "@/components/spotsScene";
import { groundY } from "@/lib/ground";
import { allSpotsForDay } from "@/lib/worldSpots";

const shellOf = (ground: boolean) => { const scene = new THREE.Scene(); const shell = buildWorldShell(scene, { ground }); shell.update(-75, 10, true); return { scene, shell }; };
const instances = (scene: THREE.Scene) => { const out: { x: number; y: number; z: number; mesh: THREE.InstancedMesh }[] = []; scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) { const im = o as THREE.InstancedMesh, m = new THREE.Matrix4(), v = new THREE.Vector3(); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m); out.push({ x: v.x, y: v.y, z: v.z, mesh: im }); } } }); return out; };

describe("H2 props follow the ground", () => {
  it("with the switch on, every tree, rock and bush sits at groundY (rocks a little sunk), near a rise", () => {
    const { scene } = shellOf(true), all = instances(scene);
    expect(all.length).toBeGreaterThan(50);
    let raised = 0;
    for (const p of all) { const g = groundY(p.x, p.z); expect(p.y).toBeLessThanOrEqual(g + 1e-6); expect(g - p.y).toBeLessThan(0.0801); if (g > 0.05) raised++; }
    expect(raised).toBeGreaterThan(0);
  });
  it("with the switch off, every prop is at y 0 exactly as before", () => {
    for (const p of instances(shellOf(false).scene)) expect(p.y).toBe(0);
  });
  it("building the same area twice gives identical placements (chunk purity)", () => {
    const a = instances(shellOf(true).scene).map((p) => [p.x, p.y, p.z]), b = instances(shellOf(true).scene).map((p) => [p.x, p.y, p.z]);
    expect(b).toEqual(a);
  });
  it("landmarks and signposts sit at groundY of their own x/z (on) and at 0 (off)", () => {
    for (const on of [true, false]) {
      const { scene } = shellOf(on); let n = 0;
      scene.traverse((o) => { if (o.parent && o.parent.name === "world-shell" && (o as THREE.Group).isGroup && o.name !== "world-shell") { n++; expect(o.position.y).toBeCloseTo(on ? groundY(o.position.x, o.position.z) : 0, 6); } });
      expect(n).toBeGreaterThan(0);
    }
  });
});

describe("H2 spots", () => {
  const spots = allSpotsForDay("2026-10-24").slice(0, 40);
  it("rest at groundY of their own x/z, and at 0 by default", () => {
    const on = buildSpotsScene(spots, groundY), off = buildSpotsScene(spots);
    on.update(1, true); off.update(1, true);
    spots.forEach((s, i) => { expect(on.group.children[i].position.y).toBeCloseTo(groundY(s.x, s.z), 6); expect(off.group.children[i].position.y).toBe(0); });
    on.dispose(); off.dispose();
  });
});
