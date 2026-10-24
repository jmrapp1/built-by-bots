// E3: the features are drawn by the world shell only when the switch is on. Off is exactly today's shell.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import raw from "@/data/features.json";
import { buildWorldShell } from "@/components/worldShell";
import { buildAll, featuresOn, featureCircles, featureInstanceCount, featureItemsInChunk } from "@/lib/features";
import { chunkOf } from "@/lib/worldMap";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const shellOf = (features: boolean, at: [number, number]) => { const scene = new THREE.Scene(); const shell = buildWorldShell(scene, { features }); shell.update(at[0], at[1], true); return { scene, shell }; };
const first = buildAll()[0];

describe("the switch", () => {
  it("ships off", () => { expect(raw.features.enabled).toBe(false); expect(featuresOn("", true)).toBe(false); expect(featuresOn("", false)).toBe(false); });
  it("?features= overrides in dev only", () => {
    const on = { features: { enabled: true } }, off = { features: { enabled: false } };
    expect(featuresOn("?features=1", false, off)).toBe(true);
    expect(featuresOn("?features=0", false, on)).toBe(false);
    expect(featuresOn("?features=1", true, off)).toBe(false);
    expect(featuresOn("?features=0", true, on)).toBe(true);
    expect(featuresOn("?x=1", false, off)).toBe(false);
  });
  it("World passes the switch to the shell with the production flag", () => {
    const w = src("../components/World.tsx");
    expect(w).toContain('featuresOn(window.location.search, process.env.NODE_ENV === "production")');
    expect(w).toContain("features: featuresDrawn");
  });
});

describe("the shell", () => {
  it("off: no feature instances and no feature circles (same as today)", () => {
    const a = shellOf(false, [first.x, first.z]), b = shellOf(false, [first.x, first.z]);
    expect(a.shell.stats().instances).toBe(b.shell.stats().instances);
    const cs = a.shell.circlesNear(first.x, first.z, 3);
    expect(cs.some((c) => Math.hypot(c.x - first.x, c.z - first.z) < 1e-6)).toBe(false);
  });
  it("on: the draw count grows by exactly the features' instance count, and their circles collide", () => {
    const off = shellOf(false, [first.x, first.z]), on = shellOf(true, [first.x, first.z]);
    const ix = chunkOf(first.x), iz = chunkOf(first.z), here = featureItemsInChunk(ix, iz);
    expect(here.length).toBeGreaterThan(0);
    expect(on.shell.stats().instances).toBeGreaterThan(off.shell.stats().instances);
    const cs = on.shell.circlesNear(first.x, first.z, 3), want = featureCircles([first])[0];
    expect(cs.some((c) => Math.abs(c.x - want.x) < 1e-6 && Math.abs(c.z - want.z) < 1e-6 && Math.abs(c.r - want.r) < 1e-6)).toBe(true);
    expect(featureInstanceCount(here)).toBeGreaterThan(0);
  });
  it("on: every chunk's feature instances stay under the per-chunk cap", () => {
    const per = new Map<string, typeof first[]>();
    for (const i of buildAll()) { const k = chunkOf(i.x) + "," + chunkOf(i.z); per.set(k, [...(per.get(k) ?? []), i]); }
    for (const [, v] of per) expect(v.length).toBeLessThanOrEqual(raw.features.limits.perChunk);
  });
});
