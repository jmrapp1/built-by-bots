// Test-only pins for the foliage layers: the baked bloom geometry is freed when its chunk is dropped, and the grass and bloom lists are hash-pinned.
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { buildBlooms, buildGrass } from "@/lib/foliage";
import { buildWorldShell } from "@/components/worldShell";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

describe("baked bloom geometry is freed with its chunk", () => {
  it("every chunk's bloom geometry is disposed once the player has moved away and the chunk is dropped", () => {
    const scene = new THREE.Scene(), shell = buildWorldShell(scene, { ground: true, features: true });
    shell.update(-75, 10, true);
    const baked: THREE.Mesh[] = []; scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.ownGeo) baked.push(o as THREE.Mesh); });
    expect(baked.length).toBeGreaterThan(0);
    const spies = baked.map((m) => vi.spyOn(m.geometry, "dispose"));
    const dropsBefore = shell.stats().drops;
    shell.update(900, 900, true); // far away: the old chunks fall out of range
    expect(shell.stats().drops).toBeGreaterThan(dropsBefore);
    const root = (o: THREE.Object3D): THREE.Object3D => (o.parent ? root(o.parent) : o);
    for (const m of baked) expect(root(m), "dropped chunk is out of the scene").not.toBe(scene);
    spies.forEach((s, i) => expect(s, `bloom mesh ${i}`).toHaveBeenCalledTimes(1));
    shell.dispose();
  });
});

describe("the scatters are hash-pinned", () => {
  // A changed seed, density, cap, gap, scale or placement rule changes these. Update them only as a decision, with a look on screen.
  it("grass: 152 bundles, exact list", () => {
    const g = buildGrass(); expect(g.all.length).toBe(152); expect(sha(g.all)).toBe("810cc692f161e3a2e684d507720648cde438a431c3a54c9453eb785032738da8");
  });
  it("blooms: exact list", () => {
    const b = buildBlooms(); expect(b.all.length).toBeGreaterThan(0); expect(sha(b.all)).toBe("b48ee6ef660c1dbdb938bd684b0da16c897a039cbd89d426b43be85ce934fa74");
  });
});
