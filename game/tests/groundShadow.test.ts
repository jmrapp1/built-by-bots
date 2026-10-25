// Shadows on the World ground: the hill mesh must receive them, and the sun's shadow box must travel with the player.
import { describe, expect, it } from "vitest";
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
