// Slice 4 pin: the shell's scene (every mesh kind, counts, foliage vertex data, plain materials) with rustle off is exactly what main drew.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import raw from "@/data/foliage.json";
import * as THREE from "three";
import { buildWorldShell } from "@/components/worldShell";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function describeScene(opts: Parameters<typeof buildWorldShell>[1] = {}) {
  const scene = new THREE.Scene(), shell = buildWorldShell(scene, { ground: true, features: true, ...opts });
  shell.update(-75, 10, true);
  const rows: unknown[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry, p = g.getAttribute("position"), mat = m.material as THREE.Material;
    const foliage = (mat as THREE.MeshToonMaterial).vertexColors === true && mat.side === THREE.DoubleSide;
    rows.push([o.type, (m as THREE.InstancedMesh).count ?? 1, p.count, mat.type, foliage ? sha(Array.from(p.array as Float32Array).map((n) => Math.round(n * 1e4))) : 0, m.castShadow]);
  });
  const out = { rows, hash: sha(rows), meshes: rows.length, shell, scene };
  return out;
}
describe("rustle off: the scene is what main drew", () => {
  it("pinned scene hash", () => {
    const d = describeScene(); expect(d.meshes).toBeGreaterThan(50);
    expect(d.hash).toBe("1ea0c6da55caaacfaa322ea62fbb92a2c58354dfe23792a2c5864bcfda6f3f6d"); // patches on (foliage slice 5 switched on)
    d.shell.dispose();
  });
  it("and the same with rustle on or off: no new mesh, draw or vertex", () => {
    const a = describeScene({ rustleData: { ...raw, rustle: { ...raw.rustle, enabled: false } } }), b = describeScene({ rustleData: raw });
    expect(a.hash).toBe(b.hash); expect(a.hash).toBe("1ea0c6da55caaacfaa322ea62fbb92a2c58354dfe23792a2c5864bcfda6f3f6d");
    a.shell.dispose(); b.shell.dispose();
  });
});
