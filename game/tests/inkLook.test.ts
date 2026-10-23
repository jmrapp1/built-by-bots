// S26 spec: ink look pass (shaders, paper texture, palette, lighting; client-only). Source checks only:
// a running Three.js scene can't be unit-tested, so this asserts the things a diff/text check can verify.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTE } from "@/lib/palette";

const worldSrc = () => readFileSync("components/World.tsx", "utf8");
const creatureSrc = () => readFileSync("lib/creature.ts", "utf8");
const pkg = () => JSON.parse(readFileSync("package.json", "utf8"));

describe("S26 ink look pass", () => {
  it("the palette has one small set of named ink/sepia/watercolor values", () => {
    expect(Object.keys(PALETTE).length).toBeGreaterThanOrEqual(6);
    for (const v of Object.values(PALETTE)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("old saturated primaries are gone from World.tsx and lib/creature.ts", () => {
    // The examples named in the spec: a few hard-coded hex call sites that used to be flat primaries.
    for (const hex of ["0x3b4a8c", "0x5b86d6", "0xf2b632", "0x1b1b2a", "0x5e9c76", "0xe3a83b"]) {
      expect(worldSrc()).not.toContain(hex);
      expect(creatureSrc()).not.toContain(hex);
    }
  });

  it("World.tsx reads palette values via PALETTE, not new inline hex at those call sites", () => {
    expect(worldSrc()).toContain("PALETTE.moss");
    expect(worldSrc()).toContain("PALETTE.ink");
  });

  it("the renderer turns on a shadow map and the sun casts, the ground receives", () => {
    const s = worldSrc();
    expect(s).toMatch(/renderer\.shadowMap\.enabled\s*=\s*true/);
    expect(s).toMatch(/sun\.castShadow\s*=\s*true/);
    expect(s).toMatch(/ground\.receiveShadow\s*=\s*true/);
  });

  it("paperTexture still returns a texture reused for the ground, now with grain/tint params", () => {
    expect(worldSrc()).toMatch(/function paperTexture\(grainStrength/);
  });

  it("no new dependency was added", () => {
    const before = ["three", "@supabase/supabase-js", "next", "react", "react-dom"];
    expect(Object.keys(pkg().dependencies).sort()).toEqual([...before].sort());
  });

  it("no geometry constructor in World.tsx or lib/creature.ts was touched (outline lines are EdgesGeometry only)", () => {
    const s = worldSrc() + creatureSrc();
    // every added-looking Geometry(...) call that isn't EdgesGeometry still has a sibling in the source
    // (a loose smoke check: the known geometry constructors used before S26 are all still present with their args)
    expect(s).toContain("new THREE.SphereGeometry(0.6, 32, 24)"); // creature body, unchanged
    expect(s).toContain("new THREE.CylinderGeometry(r * 0.35, r * 0.5, 2.6, 8)"); // tree trunk, unchanged
    expect(s).toContain("new THREE.BoxGeometry(h.w, 1.1, h.d)"); // hedge, unchanged
  });

  it("lighting helper is untouched: lightingAt still returns the same shape of value", () => {
    const daynight = readFileSync("lib/daynight.ts", "utf8");
    expect(daynight).toContain("export function lightingAt(hour: number, keys: Key[] = KEYS): Lighting {");
  });
});
