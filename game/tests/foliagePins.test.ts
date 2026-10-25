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
  it("grass: 1130 bundles, exact list", () => {
    const g = buildGrass(); expect(g.all.length).toBe(1130); expect(sha(g.all)).toBe("bd80e6ba6daaeefbfcdcf1c24e2e9e4781b3880e591cca0dff3a647535269052");
  });
  it("blooms: exact list", () => {
    const b = buildBlooms(); expect(b.all.length).toBeGreaterThan(0); expect(sha(b.all)).toBe("10710a9a118674fbaeb18400292cc0d1f2eed2f26a423d23ad12f7f311e716cc");
  });
});
