// F1 follow-up: pin the slope sink to the ground switch, and pin the shipped grass caps against the real scatter. Scene graph only, no WebGL.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldShell, grassGeo, tuftGeo } from "@/components/worldShell";
import { FOLIAGE, buildGrass } from "@/lib/foliage";
import { groundY } from "@/lib/ground";
import { CHUNKS } from "@/lib/worldMap";

const SINK = 0.08;
const count = (g: THREE.BufferGeometry) => g.getAttribute("position").count;
const BUSH = count(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.45, 0)); // the bush shape, as built in worldShell
const KINDS: Record<string, number> = { grass: count(grassGeo()), tuft: count(tuftGeo()), bush: BUSH };

/** For each kind, the sink of every instance in the whole World: groundY - y with the ground on, and -y with it off (the ground is flat then, so y 0 means no sink). */
function sinks(ground: boolean): Record<string, number[]> {
  const scene = new THREE.Scene(), shell = buildWorldShell(scene, { ground, features: true }); shell.update(-75, 10, true);
  const out: Record<string, number[]> = { grass: [], tuft: [], bush: [] }, m = new THREE.Matrix4(), p = new THREE.Vector3();
  scene.traverse((o) => {
    const im = o as THREE.InstancedMesh; if (!im.isInstancedMesh) return;
    const n = count(im.geometry), kind = Object.keys(KINDS).find((k) => KINDS[k] === n); if (!kind) return;
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); out[kind].push(Math.round(((ground ? groundY(p.x, p.z) : 0) - p.y) * 1e6) / 1e6); }
  });
  shell.dispose(); return out;
}

describe("the slope sink follows the ground switch", () => {
  it("kinds are told apart by shape", () => { expect(new Set(Object.values(KINDS)).size).toBe(3); });
  it("ground on: grass, tufts and bushes all sit exactly 0.08 below the ground", () => {
    const s = sinks(true);
    for (const k of Object.keys(KINDS)) { expect(s[k].length, k).toBeGreaterThan(0); for (const d of s[k]) expect(d, k).toBeCloseTo(SINK, 5); }
  });
  it("ground off: none of them is sunk, all at y 0", () => {
    const s = sinks(false);
    for (const k of Object.keys(KINDS)) { expect(s[k].length, k).toBeGreaterThan(0); for (const d of s[k]) expect(d, k).toBeCloseTo(0, 5); }
  });
});

describe("the shipped grass caps", () => {
  const lifted = buildGrass({ ...FOLIAGE, grassPerChunk: 1e9, grassWorld: 1e9 }); // the scatter before any cap
  it("are pinned, so raising one fails here and has to be a decision", () => { expect(FOLIAGE.grassPerChunk).toBe(420); expect(FOLIAGE.grassWorld).toBe(5000); });
  it("hold against the real scatter: the most in one chunk and the World total sit within them", () => {
    let most = 0; for (const l of lifted.perChunk.values()) most = Math.max(most, l.length);
    expect(most).toBeGreaterThan(0); expect(most).toBeLessThanOrEqual(FOLIAGE.grassPerChunk);
    expect(lifted.all.length).toBeGreaterThan(0); expect(lifted.all.length).toBeLessThanOrEqual(FOLIAGE.grassWorld);
    expect(CHUNKS).toBeGreaterThan(0);
  });
  it("and the shipped result equals the uncapped one, so the caps are only a ceiling", () => { expect(buildGrass().all.length).toBe(lifted.all.length); });
});
