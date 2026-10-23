import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import rule from "@/data/shapeRule.json";
import { leaning, lathe, softBox, wobbleSphere } from "@/lib/shapes";

const ROOT = join(__dirname, "..");
const RAW = /new\s+(?:THREE\.)?(?:Sphere|Box|Cone|Cylinder)Geometry\b/g;
const baseline = rule.baseline as Record<string, number>;
const exempt = new Set(rule.exempt as string[]);

function scan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dir of ["components", "lib"]) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!/\.tsx?$/.test(f) || f === "shapes.ts") continue;
      const n = (readFileSync(join(ROOT, dir, f), "utf8").match(RAW) ?? []).length;
      if (n) out[`${dir}/${f}`] = n;
    }
  }
  return out;
}

describe("shape rule ratchet", () => {
  const counts = scan();
  it("no file goes above its baseline", () => {
    for (const [file, n] of Object.entries(counts)) {
      if (exempt.has(file)) continue;
      expect(n, `${file}: ${n} raw primitives, baseline ${baseline[file] ?? 0}. Use lib/shapes.ts`).toBeLessThanOrEqual(baseline[file] ?? 0);
    }
  });
  it("baseline has no stale files (lower or remove entries as counts drop)", () => {
    for (const file of Object.keys(baseline)) expect(counts[file] ?? 0, file).toBeGreaterThan(0);
  });
});

function box(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!.getSize(new THREE.Vector3());
}
function finite(g: THREE.BufferGeometry) {
  const a = g.attributes.position.array as ArrayLike<number>;
  expect(a.length).toBeGreaterThan(0);
  for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
}

describe("lib/shapes", () => {
  it("softBox keeps its size and is finite", () => {
    const g = softBox(2, 1, 0.5, 0.2);
    finite(g);
    const s = box(g);
    expect(s.x).toBeCloseTo(2, 2);
    expect(s.y).toBeCloseTo(1, 2);
    expect(s.z).toBeCloseTo(0.5, 2);
  });
  it("softBox has no sharp corner", () => {
    const g = softBox(1, 1, 1, 0.2);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(a, i);
      expect(Math.min(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) > 0.49 && Math.abs(v.x) > 0.49 && Math.abs(v.y) > 0.49 && Math.abs(v.z) > 0.49).toBe(false);
    }
  });
  it("softBox clamps an oversized radius", () => {
    finite(softBox(1, 1, 1, 9));
  });
  it("lathe matches its profile", () => {
    const g = lathe([[0.1, 0], [0.5, 0.4], [0.3, 1]], 12);
    finite(g);
    const s = box(g);
    expect(s.y).toBeCloseTo(1, 3);
    expect(s.x).toBeCloseTo(1, 1);
  });
  it("wobbleSphere is deterministic per seed, differs across seeds, stays near r", () => {
    const a = wobbleSphere(1, 0.1, 7), b = wobbleSphere(1, 0.1, 7), c = wobbleSphere(1, 0.1, 8);
    finite(a);
    expect(Array.from(a.attributes.position.array)).toEqual(Array.from(b.attributes.position.array));
    expect(Array.from(a.attributes.position.array)).not.toEqual(Array.from(c.attributes.position.array));
    const s = box(a);
    for (const d of [s.x, s.y, s.z]) {
      expect(d).toBeGreaterThan(1.7);
      expect(d).toBeLessThan(2.3);
    }
  });
  it("leaning tilts about Z", () => {
    const g = leaning(new THREE.BoxGeometry(1, 2, 1), 90);
    const s = box(g);
    expect(s.x).toBeCloseTo(2, 3);
    expect(s.y).toBeCloseTo(1, 3);
  });
  it("shapes.ts has no randomness, I/O or materials", () => {
    const src = readFileSync(join(ROOT, "lib/shapes.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random|fetch\(|localStorage|Material|addOutline/);
  });
});
