import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import data from "@/data/dream.json";
import { DREAM, dreamAt, dreamLevel, dreamOverride, validGlyphs } from "@/lib/dream";
import { GLYPH_IDS } from "@/lib/scraps";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const lib = strip(readFileSync("lib/dream.ts", "utf8"));
const scene = strip(readFileSync("components/dreamGlyph.ts", "utf8"));
const cycle = data.rise + data.rest;

describe("dream glyph (S24)", () => {
  it("preview parser returns null in production and for junk", () => {
    expect(dreamOverride("?dream=1", true)).toBeNull();
    expect(dreamOverride("?dream=off", true)).toBeNull();
    expect(dreamOverride("?dream=1", false)).toBe("on");
    expect(dreamOverride("?dream=off", false)).toBe("off");
    expect(dreamOverride("?dream=x", false)).toBeNull();
    expect(dreamOverride("", false)).toBeNull();
  });
  it("glyph ids are valid", () => {
    expect(validGlyphs()).toBe(true);
    for (let k = 0; k < 40; k++) { const g = dreamAt(k * cycle + 1, true, false).glyph; expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(GLYPH_IDS.length); }
  });
  it("order is deterministic and shows at least 3 different glyphs", () => {
    const run = () => Array.from({ length: 8 }, (_, k) => dreamAt(k * cycle + 2, true, false).glyph);
    expect(run()).toEqual(run());
    expect(new Set(run()).size).toBeGreaterThanOrEqual(3);
  });
  it("opacity is 0 when not asleep and at both ends of each cycle", () => {
    for (const t of [0, 1, 5, 100]) expect(dreamAt(t, false, false).opacity).toBe(0);
    for (let k = 0; k < 4; k++) {
      expect(dreamAt(k * cycle, true, false).opacity).toBe(0);
      expect(dreamAt(k * cycle + data.rise, true, false).opacity).toBe(0);
      expect(dreamAt(k * cycle + data.rise + data.rest / 2, true, false).opacity).toBe(0); // the rest
      expect(dreamAt(k * cycle + data.rise / 2, true, false).opacity).toBeCloseTo(data.maxOpacity, 5);
    }
  });
  it("one glyph at a time: a single value per moment, never above max", () => {
    for (let t = 0; t < cycle * 3; t += 0.37) { const d = dreamAt(t, true, false); expect(d.opacity).toBeLessThanOrEqual(data.maxOpacity); expect(d.opacity).toBeGreaterThanOrEqual(0); }
  });
  it("rises and drifts, stays clear above the head", () => {
    const a = dreamAt(1, true, false), b = dreamAt(data.rise - 1, true, false);
    expect(b.y).toBeGreaterThan(a.y);
    expect(a.y).toBeGreaterThanOrEqual(data.startY);
  });
  it("reduced motion gives a constant position and a soft opacity", () => {
    const a = dreamAt(0, true, true), b = dreamAt(77.7, true, true);
    expect(a).toEqual(b);
    expect(a.opacity).toBe(data.reduced.opacity);
    expect(a.opacity).toBeLessThan(data.maxOpacity);
    expect(dreamAt(5, false, true).opacity).toBe(0);
  });
  it("the dev hold shows one glyph at its fullest, only while asleep", () => {
    expect(dreamAt(0, true, false, true).opacity).toBe(data.maxOpacity);
    expect(dreamAt(0, false, false, true).opacity).toBe(0);
  });
  it("the level fades in and out and never jumps", () => {
    expect(dreamLevel(0, true, 0.05)).toBeGreaterThan(0);
    expect(dreamLevel(0, true, 0.05)).toBeLessThan(0.1);
    expect(dreamLevel(1, false, 0.05)).toBeLessThan(1);
    expect(dreamLevel(1, false, 0.05)).toBeGreaterThan(0.9);
    expect(dreamLevel(0, false, 1)).toBe(0);
    expect(dreamLevel(1, true, 1)).toBe(1);
  });
  it("numbers are read from the data file", () => {
    expect(DREAM).toBe(data);
    expect(dreamAt(data.rise / 2, true, false).y).toBeCloseTo(data.startY + data.riseBy / 2, 5);
    expect(dreamAt(data.rise / 2, true, false).x).toBeCloseTo(data.driftX / 2, 5);
    expect(lib).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it("no network, storage, timers or dependencies", () => {
    for (const src of [lib, scene]) expect(src).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|supabase|WebSocket/i);
    expect(scene).toMatch(/raycast = \(\) => \{\}/);
  });
  it("is wired in World only through the preview parser and the garden", () => {
    const w = readFileSync("components/World.tsx", "utf8");
    expect(w).toContain('dreamOverride(window.location.search, process.env.NODE_ENV === "production")');
    expect(w).toContain("showDream()");
    expect(w).toContain("dropDream()");
  });
});
