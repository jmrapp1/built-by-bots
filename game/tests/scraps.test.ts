import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import data from "@/data/scraps.json";
import forage from "@/data/forage.json";
import { GLYPH_IDS, clearOfZones, liftAt, scrapOverride, scrapsFor, tiltAt } from "@/lib/scraps";
import { GARDEN } from "@/lib/world";
import { doorFrame } from "@/lib/home";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const lib = strip(readFileSync("lib/scraps.ts", "utf8"));
const scene = strip(readFileSync("components/glyphScraps.ts", "utf8"));
const world = readFileSync("components/World.tsx", "utf8");

describe("glyph scraps (S23)", () => {
  it("count is in range and numbers come from the data file", () => {
    expect(data.points.length).toBeGreaterThanOrEqual(data.count.min);
    expect(data.points.length).toBeLessThanOrEqual(data.count.max);
    expect(data.count.min).toBe(14);
    expect(data.count.max).toBe(20);
    expect(scrapsFor(null).bits).toHaveLength(data.points.length);
    expect(scrapsFor("many").scale).toBe(data.manyScale);
    expect(scrapsFor("many").bits).toHaveLength(data.points.length);
    expect(scrapsFor("off").bits).toHaveLength(0);
    expect(scrapsFor("near").bits).toHaveLength(6);
  });
  it("glyph ids are valid and several kinds appear", () => {
    const ok = (g: number) => Number.isInteger(g) && g >= 0 && g < GLYPH_IDS.length;
    for (const p of [...data.points, ...data.near]) expect(ok(p.glyph)).toBe(true);
    expect(new Set(data.points.map((p) => p.glyph)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(data.near.map((p) => p.glyph)).size).toBeGreaterThanOrEqual(3);
    expect(GLYPH_IDS).toEqual(["dot", "loop", "wave", "cross", "leaf", "star"]);
  });
  it("every position is clear of trees, hedges, props, pond, gate, door and forage spots", () => {
    for (const mode of [null, "many", "near"] as const) for (const b of scrapsFor(mode).bits) expect(clearOfZones(b), `${mode} ${b.x},${b.z}`).toBe(true);
    for (const f of forage.spots) for (const b of scrapsFor(null).bits) expect(Math.hypot(b.x - f.x, b.z - f.z)).toBeGreaterThan(data.clear.forage);
    const gate = GARDEN.places.find((p) => p.kind === "gate")!;
    const door = doorFrame("garden").g;
    for (const b of scrapsFor(null).bits) {
      expect(Math.hypot(b.x - gate.x, b.z - gate.z)).toBeGreaterThan(data.clear.gate);
      expect(Math.hypot(b.x - door.x, b.z - door.z)).toBeGreaterThan(data.clear.door);
    }
  });
  it("the check bites on bad spots", () => {
    expect(clearOfZones({ x: GARDEN.trees[0].x, z: GARDEN.trees[0].z })).toBe(false);
    expect(clearOfZones({ x: 17.5, z: -17.5 })).toBe(false);
    expect(clearOfZones({ x: forage.spots[0].x, z: forage.spots[0].z })).toBe(false);
    expect(clearOfZones({ x: -11, z: 8 })).toBe(false);
    expect(clearOfZones({ x: 80, z: 0 })).toBe(false);
  });
  it("some scraps are in view at the start; the near ring is 2 to 5 m ahead", () => {
    const [sx, sz] = GARDEN.player.start;
    for (const b of scrapsFor("near").bits) { const d = Math.hypot(b.x - sx, b.z - sz); expect(d).toBeGreaterThanOrEqual(2); expect(d).toBeLessThanOrEqual(5.5); expect(b.z).toBeLessThan(sz); }
    expect(scrapsFor(null).bits.filter((b) => Math.hypot(b.x - sx, b.z - sz) < 7 && b.z < sz).length).toBeGreaterThanOrEqual(3);
  });
  it("is the same on every call (no randomness)", () => {
    expect(scrapsFor(null)).toEqual(scrapsFor(null));
    expect(lib).not.toMatch(/Math\.random|Date\./);
  });
  it("preview parser is null in production and for junk", () => {
    for (const v of ["near", "many", "off"]) { expect(scrapOverride(`?scraps=${v}`, true)).toBeNull(); expect(scrapOverride(`?scraps=${v}`, false)).toBe(v); }
    expect(scrapOverride("?scraps=all", false)).toBeNull();
    expect(scrapOverride("", false)).toBeNull();
  });
  it("lift stays within the data bounds and reduced motion lies still", () => {
    for (let t = 0; t < 30; t += 0.37) { const y = liftAt(t, 1.2, false); expect(y).toBeGreaterThanOrEqual(data.motion.rest - 1e-9); expect(y).toBeLessThanOrEqual(data.motion.rest + data.motion.lift + 1e-9); }
    expect(liftAt(3.3, 2, true)).toBe(data.motion.rest);
    expect(tiltAt(3.3, 2, true)).toEqual({ x: 0, z: 0 });
    expect(Math.abs(liftAt(0, 0, false) - liftAt(data.motion.period, 0, false))).toBeLessThan(1e-9);
  });
  it("no network, storage, new dependency, or text", () => {
    for (const src of [lib, scene]) expect(src).not.toMatch(/fetch\(|supabase|localStorage|sessionStorage|document\.cookie|XMLHttpRequest|https?:\/\//);
    expect(scene).not.toMatch(/fillText|strokeText/);
    expect(scene).toMatch(/new THREE\.InstancedMesh/);
    expect(scene).toMatch(/mesh\.raycast = \(\) => \{\}/);
    expect(scene).toMatch(/if \(reduced \|\| !bits\.length\) return;/);
  });
  it("World builds them with the garden, frees them on leaving, and never in other zones", () => {
    expect(world).toMatch(/showScraps\(\); startSpots\(\); \};/);
    expect(world).toMatch(/const stopSpots = \(\) => \{ dropScraps\(\);/);
    expect(world).toMatch(/scrapOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    expect(world).toMatch(/glyphScraps && zones\.is\("garden"\)\) glyphScraps\.update\(t \/ 1000, reducedMotion\)/);
    expect(world.match(/showScraps\(\)/g)).toHaveLength(1); // the one call, in showShell
  });
  it("is a look only: the Margins find counter is untouched", () => {
    expect(world.match(/scraps\+\+/g)).toHaveLength(2);
    expect(lib + scene).not.toMatch(/onGather|onMargins|keepsake/i);
  });
});
