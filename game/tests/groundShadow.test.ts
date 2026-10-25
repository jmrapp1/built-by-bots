// Shadows on the World ground: the hill mesh must receive them, and the sun's shadow box must travel with the player.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildWorldShell } from "@/components/worldShell";
import { sunFollow } from "@/lib/sunFollow";
import { SUN_SHADOW, shadowMapSize } from "@/lib/sunShadow";
import { shadowLift } from "@/lib/groundCamera";

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
  it("with features on, every instanced prop casts, tufts, drips and ferns included", () => {
    const ims = meshes(true); expect(ims.length).toBeGreaterThan(0);
    expect(ims.every((m) => m.castShadow)).toBe(true);
  });
  it("hedge boxes and shell objects cast", () => {
    const w = readFileSync(new URL("../components/worldShell.ts", import.meta.url), "utf8");
    expect(w).toContain("o.castShadow = true; o.scale"); expect(w).toContain("m.castShadow = true; m.scale.set(sx, sy, sz)");
  });
});

describe("shadow reach", () => {
  const w = readFileSync(new URL("../components/World.tsx", import.meta.url), "utf8");
  it("the box is about 4x the old 18 m and World reads it from SUN_SHADOW", () => {
    expect(SUN_SHADOW.half).toBeGreaterThanOrEqual(64); expect(SUN_SHADOW.half).toBeLessThanOrEqual(80);
    expect(w).toContain("-SUN_SHADOW.half"); expect(w).toContain("SUN_SHADOW.bias"); expect(w).toContain("SUN_SHADOW.dist");
  });
  it("the depth range holds the ground at the box edge, the 3.4 m hills and 6 m props", () => {
    const o = [8, 14, 6], len = Math.hypot(...o), cosEl = Math.hypot(o[0], o[2]) / len;
    const nearest = SUN_SHADOW.dist - SUN_SHADOW.half * cosEl - 3.4 - 6, farthest = SUN_SHADOW.dist + SUN_SHADOW.half * cosEl + 3.4;
    expect(nearest).toBeGreaterThan(SUN_SHADOW.near); expect(farthest).toBeLessThan(SUN_SHADOW.far);
  });
  it("sunFollow keeps the sun's direction at the set distance and still snaps to whole metres", () => {
    const r = sunFollow([8, 14, 6], 40.4, -90.6, true, SUN_SHADOW.dist);
    expect(r.target).toEqual([40, 0, -91]);
    expect(Math.hypot(r.pos[0] - 40, r.pos[1], r.pos[2] + 91)).toBeCloseTo(SUN_SHADOW.dist, 6);
  });
  it("desktop gets the bigger map, a phone keeps its own", () => {
    expect(shadowMapSize(false, 1024)).toBe(SUN_SHADOW.mapDesktop); expect(shadowMapSize(true, 1024)).toBe(1024);
  });
  it("the normal-bias lift is capped at the new, larger value", () => {
    expect(shadowLift((x: number) => x * 5, 0, 0)).toBe(SUN_SHADOW.liftCap); expect(shadowLift(() => 0, 0, 0)).toBe(0);
  });
});
