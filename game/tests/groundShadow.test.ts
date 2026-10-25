// Shadows on the World ground: the hill mesh must receive them, and the sun's shadow box must travel with the player.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildWorldShell } from "@/components/worldShell";
import { sunFollow } from "@/lib/sunFollow";

const groundMesh = (scene: THREE.Scene) => { let m: THREE.Mesh | null = null; scene.traverse((o) => { const x = o as THREE.Mesh; if (!m && x.isMesh && x.geometry.attributes.color && x.geometry.attributes.position.count > 10000) m = x; }); return m as unknown as THREE.Mesh; };

describe("ground shadows", () => {
  for (const ink of [false, true]) for (const hills of [false, true]) it(`the ground mesh receives shadows (ink ${ink}, ground ${hills})`, () => {
    const scene = new THREE.Scene(); buildWorldShell(scene, { ground: hills, groundInk: ink });
    expect(groundMesh(scene).receiveShadow).toBe(true);
  });
  it("the ink patch keeps the toon material's shadow lighting", () => {
    const scene = new THREE.Scene(); buildWorldShell(scene, { ground: true, groundInk: true });
    expect((groundMesh(scene).material as THREE.Material).type).toBe("MeshToonMaterial");
  });
  it("the sun and its target follow the player in whole metres, and rest at the origin elsewhere", () => {
    const o = [8, 14, 6] as const;
    expect(sunFollow(o, 40.4, -90.6, true)).toEqual({ pos: [48, 14, -85], target: [40, 0, -91] });
    expect(sunFollow(o, 40.4, -90.6, false)).toEqual({ pos: [8, 14, 6], target: [0, 0, 0] });
  });
});

describe("props cast shadows", () => {
  const meshes = (features: boolean) => { const scene = new THREE.Scene(); const sh = buildWorldShell(scene, { ground: true, features }); sh.update(0, 0, true); const out: THREE.Object3D[] = []; scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) out.push(o); }); return out; };
  it("the scattered trees, rocks and bushes (instanced) cast shadows", () => {
    const ims = meshes(false); expect(ims.length).toBeGreaterThan(0);
    expect(ims.every((m) => m.castShadow)).toBe(true);
  });
  it("with features on, only the small tufts, drips and ferns stay out of the shadow pass", () => {
    const ims = meshes(true), off = ims.filter((m) => !m.castShadow);
    expect(ims.length - off.length).toBeGreaterThan(0);
    expect(off.length).toBeGreaterThan(0);
  });
  it("hedge boxes and shell objects cast", () => {
    const w = readFileSync(new URL("../components/worldShell.ts", import.meta.url), "utf8");
    expect(w).toContain("o.castShadow = true; o.scale"); expect(w).toContain("m.castShadow = true; m.scale.set(sx, sy, sz)");
  });
});
