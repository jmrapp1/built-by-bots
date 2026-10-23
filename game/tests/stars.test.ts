import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STARS, glare, moonDir, starAt, starHash, starLevel, starsEnabled, starsOverride, sunDir, twinkle } from "@/lib/sky";

const all = Array.from({ length: STARS.count }, (_, i) => starAt(i));

describe("stars (S31b)", () => {
  it("count is in the low hundreds, read from data", () => {
    expect(STARS.count).toBeGreaterThanOrEqual(100);
    expect(STARS.count).toBeLessThanOrEqual(400);
  });
  it("the hash and every star are deterministic", () => {
    for (let i = 0; i < 50; i++) { expect(starHash(i)).toBe(starHash(i)); expect(starAt(i)).toEqual(starAt(i)); }
    expect(new Set(Array.from({ length: 500 }, (_, i) => starHash(i))).size).toBe(500);
  });
  it("all stars are unit vectors above the horizon, spread round the compass", () => {
    for (const s of all) { expect(Math.hypot(s.dir.x, s.dir.y, s.dir.z)).toBeCloseTo(1, 9); expect(s.dir.y).toBeGreaterThanOrEqual(STARS.minElevation); }
    for (const q of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) expect(all.filter((s) => Math.sign(s.dir.x) === q[0] && Math.sign(s.dir.z) === q[1]).length).toBeGreaterThan(20);
  });
  it("two sizes plus about one in ten four-point marks", () => {
    const g = all.filter((s) => s.kind === "glyph").length / all.length;
    expect(g).toBeGreaterThan(0.04); expect(g).toBeLessThan(0.18);
    expect(new Set(all.filter((s) => s.kind !== "glyph").map((s) => s.size)).size).toBe(2);
    expect(all.some((s) => s.kind === "small")).toBe(true);
    expect(all.some((s) => s.kind === "big")).toBe(true);
  });
  it("opacity: 0 by day, full at deep night, monotone through dusk and dawn", () => {
    expect(starLevel(12)).toBe(0);
    expect(starLevel(14)).toBe(0);
    expect(starLevel(0)).toBeCloseTo(STARS.maxAlpha, 9);
    expect(starLevel(2)).toBeCloseTo(STARS.maxAlpha, 9);
    let prev = starLevel(18);
    for (let h = 18.05; h <= 21; h += 0.05) { const v = starLevel(h); expect(v).toBeGreaterThanOrEqual(prev - 1e-12); prev = v; }
    prev = starLevel(4);
    for (let h = 4.05; h <= 8; h += 0.05) { const v = starLevel(h); expect(v).toBeLessThanOrEqual(prev + 1e-12); prev = v; }
    for (let h = 0; h < 24; h += 0.25) { expect(starLevel(h)).toBeGreaterThanOrEqual(0); expect(starLevel(h)).toBeLessThanOrEqual(1); }
  });
  it("weather grey dims them but never hides them fully", () => {
    expect(starLevel(0, 1)).toBeLessThan(starLevel(0, 0));
    expect(starLevel(0, 1)).toBeGreaterThan(0);
    expect(starLevel(0, 5)).toBe(starLevel(0, 1));
  });
  it("twinkle is slow, bounded, per-star, and fixed with reduced motion", () => {
    const a = all[0], b = all.find((s) => Math.abs(s.phase - a.phase) > 0.2)!;
    for (let t = 0; t < 60; t += 0.7) { const v = twinkle(a, t, false); expect(v).toBeLessThanOrEqual(1); expect(v).toBeGreaterThanOrEqual(1 - STARS.twinkleDepth - 1e-9); expect(twinkle(a, t, true)).toBe(1); }
    expect(twinkle(a, 1, false)).not.toBe(twinkle(b, 1, false));
    expect(STARS.twinkleSeconds).toBeGreaterThanOrEqual(5);
  });
  it("stars near the sun are hidden while it is up, and untouched when it is down", () => {
    const sd = sunDir(7.2);
    expect(glare(sd, sd, 1)).toBeCloseTo(0, 9);
    expect(glare({ x: -sd.x, y: sd.y, z: -sd.z }, sd, 1)).toBe(1);
    expect(glare(sd, sd, 0)).toBe(1);
    const md = moonDir(1);
    expect(glare(md, sunDir(1), 0)).toBe(1);
  });
  it("?stars=off is dev only; stars: 0 would disable", () => {
    expect(starsOverride("?stars=off", true)).toBeNull();
    expect(starsOverride("?stars=off", false)).toBe("off");
    expect(starsOverride("?stars=x", false)).toBeNull();
    expect(starsEnabled("", false)).toBe(true);
    expect(starsEnabled("?stars=off", false)).toBe(false);
    expect(starsEnabled("?stars=off", true)).toBe(true);
  });
  it("stars sit behind the moon and sun and inside the camera far plane, and the scene stays clean", () => {
    const sky = JSON.parse(readFileSync("data/sky.json", "utf8"));
    expect(STARS.distance).toBeGreaterThan(sky.moon.distance);
    expect(STARS.distance).toBeLessThan(sky.dome.radius);
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const sc = strip(readFileSync("components/skyScene.ts", "utf8"));
    expect(sc).not.toMatch(/Math\.random/);
    expect(sc).toContain("starMesh.raycast = () => {}");
    const w = readFileSync("components/World.tsx", "utf8");
    expect(w).toContain("stars: !margins && starsOn");
  });
  it("the transparent star material is depth-tested (never transparent with depthTest off), and the dome, sun and moon stay opaque", () => {
    const src = readFileSync("components/skyScene.ts", "utf8");
    const mats = src.match(/new THREE\.Mesh\w*Material\(\{[^}]*\}\)/g) ?? [];
    expect(mats.length).toBeGreaterThanOrEqual(3);
    for (const m of mats) if (/transparent:\s*true/.test(m)) { expect(m).not.toMatch(/depthTest:\s*false/); expect(m).toMatch(/depthTest:\s*true/); expect(m).toMatch(/depthWrite:\s*false/); }
    expect(mats.filter((m) => /transparent:\s*true/.test(m))).toHaveLength(1); // only the stars
    const sky = JSON.parse(readFileSync("data/sky.json", "utf8")), world = JSON.parse(readFileSync("data/world.json", "utf8"));
    expect(sky.stars.distance).toBeLessThan(world.cameraFar);
  });
});
