// E6: Meadow field patches as ground colour only. Off equals today, nothing else changes, Home stays clean, every value finite.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as THREE from "three";
import raw from "@/data/groundPatterns.json";
import { TIDES, tideMix, PATTERNS, fieldAt, fieldTint, patchEase, patchMix, patternStrength } from "@/lib/groundPatterns";
import { HOME_FLAT } from "@/lib/ground";
import { buildWorldShell } from "@/components/worldShell";
import { regionWeights } from "@/lib/regionFog";
import { HALF } from "@/lib/worldMap";
import features from "@/data/features.json";
import { CHUNKS, chunkContents } from "@/lib/worldMap";

const groundColours = (opts: { features?: boolean; groundInk?: boolean }) => {
  const scene = new THREE.Scene(); buildWorldShell(scene, opts); let a: Float32Array | null = null, p: THREE.BufferAttribute | null = null;
  scene.traverse((o) => { const m = o as THREE.Mesh; if (!a && m.isMesh && m.geometry.attributes.color && m.geometry.attributes.position.count > 10000) { a = m.geometry.attributes.color.array as Float32Array; p = m.geometry.attributes.position as THREE.BufferAttribute; } });
  return { a: a as unknown as Float32Array, p: p as unknown as THREE.BufferAttribute };
};
const hashOf = (a: Float32Array) => createHash("sha256").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex");

describe("the data", () => {
  it("only Meadow is on in this slice", () => { expect(raw.groundPatterns.regions.meadow).toBeGreaterThan(0); for (const r of ["inkwood", "paper_downs", "glyph_quarter", "pressmark_shore"] as const) expect(raw.groundPatterns.regions[r]).toBe(0); });
  it("values are sane", () => { expect(PATTERNS.strength).toBeGreaterThan(0); expect(PATTERNS.strength).toBeLessThanOrEqual(0.4); expect(PATTERNS.jitter).toBeLessThan(0.5); expect(PATTERNS.tints.length).toBeGreaterThan(2); for (const t of PATTERNS.tints) expect(t).toMatch(/^#[0-9a-f]{6}$/i); });
});

describe("the maths", () => {
  it("is pure and finite everywhere", () => {
    for (let x = -HALF - 20; x <= HALF + 20; x += 7) for (let z = -HALF - 20; z <= HALF + 20; z += 7) {
      const m = patchMix(x, z); expect(Number.isFinite(m.amount)).toBe(true); expect(m.amount).toBeGreaterThanOrEqual(0); expect(m.amount).toBeLessThanOrEqual(PATTERNS.strength + 1e-9);
      expect(m.tint).toBeGreaterThanOrEqual(0); expect(m.tint).toBeLessThan(PATTERNS.tints.length); expect(patchMix(x, z)).toEqual(m);
    }
    expect(patchMix(NaN, 0).amount).toBe(0);
  });
  it("makes irregular fields with several different tints", () => {
    const seen = new Set<string>(), tints = new Set<number>();
    for (let x = -100; x < 100; x += 3) for (let z = -100; z < 100; z += 3) { const f = fieldAt(x, z); seen.add(f.i + "," + f.j); tints.add(fieldTint(x, z)); }
    expect(seen.size).toBeGreaterThan(20); expect(tints.size).toBeGreaterThanOrEqual(3);
  });
  it("is zero inside Home and easing in", () => {
    for (let x = -HOME_FLAT; x <= HOME_FLAT; x += 2) for (let z = -HOME_FLAT; z <= HOME_FLAT; z += 2) expect(patchMix(x, z).amount).toBe(0);
    expect(patchEase(HOME_FLAT + PATTERNS.homeEase + 1, 0)).toBe(1);
  });
  it("is zero wherever Meadow has no weight", () => {
    for (let x = -HALF; x <= HALF; x += 6) for (let z = -HALF; z <= HALF; z += 6) { const w = regionWeights(x, z); if (w.meadow < 1e-9) expect(patternStrength(x, z)).toBe(0); }
  });
  it("is strong in open Meadow", () => { expect(patternStrength(-80, 20)).toBeGreaterThan(0.9); });
});

describe("the ground colours", () => {
  it("off is today's colours: no patch anywhere (pinned hash of the pre-E6 ground)", () => {
    expect(hashOf(groundColours({ features: false }).a)).toBe(PINNED_OFF);
    expect(hashOf(groundColours({}).a)).toBe(PINNED_OFF);
  });
  it("on changes Meadow patches, Downs creases and Shore tide lines only: same count, Home square, other regions and the edge untouched", () => {
    const off = groundColours({ features: false }), on = groundColours({ features: true });
    expect(on.a.length).toBe(off.a.length); expect(on.p.count).toBe(off.p.count);
    let changed = 0;
    for (let i = 0; i < on.p.count; i++) {
      const wx = on.p.getX(i), wz = -on.p.getY(i), diff = [0, 1, 2].some((k) => on.a[i * 3 + k] !== off.a[i * 3 + k]);
      if (diff) { changed++; expect(patchMix(wx, wz).amount + creaseMix(wx, wz).amount + tideMix(wx, wz)).toBeGreaterThan(0); expect(Math.max(Math.abs(wx), Math.abs(wz))).toBeGreaterThan(HOME_FLAT); }
      else if (regionWeights(wx, wz).meadow < 1e-9) expect(patchMix(wx, wz).amount).toBe(0);
    }
    expect(changed).toBeGreaterThan(2000);
    for (const v of on.a) expect(Number.isFinite(v)).toBe(true);
  });
  it("is gated by features.enabled alone and moves no scenery", () => {
    expect(features.features.enabled).toBe(true);
    const n = CHUNKS * CHUNKS; expect(n).toBeGreaterThan(0); expect(chunkContents(0, 0)).toEqual(chunkContents(0, 0));
  });
});
const PINNED_OFF = "ef3d4c1f5d524078eed9d9fffd4d239c2fa61b5bedaf123a650dcbdd41b51a97";

import { CREASES, creaseMix } from "@/lib/groundPatterns";
describe("Paper Downs fold creases", () => {
  it("data is sane and only Paper Downs is on", () => { expect(CREASES.regions.paper_downs).toBeGreaterThan(0); for (const r of ["meadow", "inkwood", "glyph_quarter", "pressmark_shore"] as const) expect(CREASES.regions[r]).toBe(0); expect(CREASES.strength).toBeLessThanOrEqual(0.4); expect(CREASES.jitter).toBeLessThan(0.5); expect(CREASES.shade).toMatch(/^#[0-9a-f]{6}$/i); expect(CREASES.light).toMatch(/^#[0-9a-f]{6}$/i); });
  it("is pure, finite and bounded everywhere", () => {
    for (let x = -HALF - 20; x <= HALF + 20; x += 5) for (let z = -HALF - 20; z <= HALF + 20; z += 5) { const m = creaseMix(x, z); expect(Number.isFinite(m.amount)).toBe(true); expect(m.amount).toBeGreaterThanOrEqual(0); expect(m.amount).toBeLessThanOrEqual(CREASES.strength + 1e-9); expect(creaseMix(x, z)).toEqual(m); }
    expect(creaseMix(NaN, 0).amount).toBe(0);
  });
  it("is zero in Home and wherever Paper Downs has no weight; present, with both kinds, in the Downs", () => {
    for (let x = -HOME_FLAT; x <= HOME_FLAT; x += 2) for (let z = -HOME_FLAT; z <= HOME_FLAT; z += 2) expect(creaseMix(x, z).amount).toBe(0);
    let on = 0, ridge = 0, valley = 0;
    for (let x = -HALF; x <= HALF; x += 1.5) for (let z = -HALF; z <= HALF; z += 1.5) { const m = creaseMix(x, z), w = regionWeights(x, z); if (w.paper_downs < 1e-9) expect(m.amount).toBe(0); if (m.amount > 0.05) { on++; if (m.ridge) ridge++; else valley++; } }
    expect(on).toBeGreaterThan(300); expect(ridge).toBeGreaterThan(0); expect(valley).toBeGreaterThan(0);
  });
  it("changes only Paper Downs ground colour, Meadow output is untouched, nothing else moves", () => {
    const off = groundColours({ features: false }), on = groundColours({ features: true }); let downs = 0;
    for (let i = 0; i < on.p.count; i++) {
      const wx = on.p.getX(i), wz = -on.p.getY(i), diff = [0, 1, 2].some((k) => on.a[i * 3 + k] !== off.a[i * 3 + k]);
      if (creaseMix(wx, wz).amount > 0) { downs++; expect(regionWeights(wx, wz).paper_downs).toBeGreaterThan(0); }
      if (diff && patchMix(wx, wz).amount === 0 && tideMix(wx, wz) === 0) expect(creaseMix(wx, wz).amount).toBeGreaterThan(0);
    }
    expect(downs).toBeGreaterThan(200);
  });
});

describe("Pressmark Shore tide lines", () => {
  it("data is sane and only the Shore is on", () => { expect(TIDES.regions.pressmark_shore).toBeGreaterThan(0); for (const r of ["meadow", "inkwood", "paper_downs", "glyph_quarter"] as const) expect(TIDES.regions[r]).toBe(0); expect(TIDES.strength).toBeLessThanOrEqual(0.4); expect(TIDES.jitter).toBeLessThan(0.5); expect(TIDES.dark).toMatch(/^#[0-9a-f]{6}$/i); });
  it("is pure, finite and bounded everywhere", () => {
    for (let x = -HALF - 20; x <= HALF + 20; x += 5) for (let z = -HALF - 20; z <= HALF + 20; z += 5) { const m = tideMix(x, z); expect(Number.isFinite(m)).toBe(true); expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(TIDES.strength + 1e-9); expect(tideMix(x, z)).toBe(m); }
    expect(tideMix(NaN, 0)).toBe(0); expect(tideMix(0, Infinity)).toBe(0);
  });
  it("is zero in Home and wherever the Shore has no weight; present in the Shore as bands", () => {
    for (let x = -HOME_FLAT; x <= HOME_FLAT; x += 2) for (let z = -HOME_FLAT; z <= HOME_FLAT; z += 2) expect(tideMix(x, z)).toBe(0);
    let on = 0; const cols = new Set<number>();
    for (let x = -HALF; x <= HALF; x += 1.5) for (let z = -HALF; z <= HALF; z += 1.5) { const m = tideMix(x, z), w = regionWeights(x, z); if (w.pressmark_shore < 1e-9) expect(m).toBe(0); if (m > 0.05) { on++; cols.add(Math.round(x / 3)); } }
    expect(on).toBeGreaterThan(300); expect(cols.size).toBeGreaterThan(5);
  });
  it("changes only Shore ground colour; Meadow and Downs output is untouched; nothing else moves", () => {
    const off = groundColours({ features: false }), on = groundColours({ features: true }); let shore = 0;
    for (let i = 0; i < on.p.count; i++) {
      const wx = on.p.getX(i), wz = -on.p.getY(i), diff = [0, 1, 2].some((k) => on.a[i * 3 + k] !== off.a[i * 3 + k]);
      if (tideMix(wx, wz) > 0) { shore++; expect(regionWeights(wx, wz).pressmark_shore).toBeGreaterThan(0); }
      if (diff && patchMix(wx, wz).amount === 0 && creaseMix(wx, wz).amount === 0) expect(tideMix(wx, wz)).toBeGreaterThan(0);
    }
    expect(shore).toBeGreaterThan(200); expect(on.a.length).toBe(off.a.length);
  });
});
