import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HAZE, HILLS, hazeAt, hazeEnabled, hazeFog, hazeHill, hazeOverride, hillColor, hillLayers } from "@/lib/sky";
import { lightingAt } from "@/lib/daynight";

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const L = hillLayers();

describe("distance haze (S31e)", () => {
  it("zero haze (or none) gives exactly today's fog and hills", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const fog = lightingAt(h).fog;
      expect(hazeFog(fog, null)).toBe(fog); expect(hazeFog(fog, undefined)).toBe(fog); expect(hazeFog(fog, { amount: 0, tint: "#ff0000" })).toBe(fog);
    }
    for (const [i, l] of L.entries()) {
      const base = hillColor("#d9e2ea", l);
      expect(hillColor("#d9e2ea", l, null)).toBe(base); expect(hillColor("#d9e2ea", l, { amount: 0, tint: "#ff0000" })).toBe(base);
      expect(hazeHill(base, { amount: 0, tint: "#00ff00" }, i)).toBe(base);
    }
  });
  it("the key set mirrors daynight hours, strengths are 0..1 and subtle", () => {
    expect(HAZE.keys.map((k) => k.hour)).toEqual([0, 5.5, 7, 11, 16.5, 18.5, 20.5, 22]);
    for (const k of HAZE.keys) { expect(k.haze).toBeGreaterThanOrEqual(0); expect(k.haze).toBeLessThanOrEqual(1); }
    expect(HAZE.fogMix).toBeLessThanOrEqual(0.5); expect(HAZE.hillMix).toBeLessThanOrEqual(0.6);
  });
  it("haze is strongest and warm at dawn and dusk, weak at night, and eases without jumps", () => {
    const dawn = hazeAt(7), dusk = hazeAt(18.5), noon = hazeAt(11), night = hazeAt(0);
    expect(dawn.amount).toBeGreaterThan(noon.amount); expect(dusk.amount).toBeGreaterThan(noon.amount); expect(night.amount).toBeLessThan(noon.amount);
    for (const t of [dawn.tint, dusk.tint]) { const [r, , b] = rgb(t); expect(r).toBeGreaterThan(b); } // warm
    let prev = hazeAt(0);
    for (let h = 0.05; h <= 24; h += 0.05) { const v = hazeAt(h); expect(Math.abs(v.amount - prev.amount)).toBeLessThan(0.1); expect(dist(v.tint, prev.tint)).toBeLessThan(40); prev = v; }
  });
  it("the fog only moves a little (never washes out) and always toward the tint", () => {
    for (let h = 0; h < 24; h += 0.5) {
      const fog = lightingAt(h).fog, hz = hazeAt(h), out = hazeFog(fog, hz);
      expect(dist(out, fog)).toBeLessThanOrEqual(dist(fog, hz.tint) * HAZE.fogMix * hz.amount + 2);
      expect(dist(out, hz.tint)).toBeLessThanOrEqual(dist(fog, hz.tint) + 1);
    }
  });
  it("hills keep their near-to-far contrast and darkness at night with haze on", () => {
    for (const hour of [7, 11, 18.5]) {
      const hz = hazeAt(hour), sky = lightingAt(hour).sky, cs = L.map((l) => hillColor(sky, l, hz));
      for (let i = 1; i < cs.length; i++) expect(dist(cs[i], sky)).toBeLessThan(dist(cs[i - 1], sky) + 1e-9); // farther is closer to the sky colour, as before
      expect(new Set(cs).size).toBe(cs.length);
    }
    const sum = (h: string) => rgb(h).reduce((a, b) => a + b, 0);
    for (const l of L) expect(sum(hillColor("#161a38", l, hazeAt(0)))).toBeLessThan(sum(hillColor("#d9e2ea", l, hazeAt(11))) * 0.5);
    const day = "#d9e2ea", hz = hazeAt(11), c = L.map((l) => rgb(hillColor(day, l, hz)));
    for (let i = 1; i < c.length; i++) { expect(c[i][0] + c[i][1] + c[i][2]).toBeGreaterThan(c[i - 1][0] + c[i - 1][1] + c[i - 1][2]); expect(c[i][2] - c[i][0]).toBeGreaterThan(c[i - 1][2] - c[i - 1][0]); }
    expect(HILLS.list.length).toBe(4);
  });
  it("kill switches: enabled false and ?haze=off (dev only)", () => {
    expect(hazeOverride("?haze=off", false)).toBe("off");
    expect(hazeOverride("?haze=off", true)).toBeNull();
    expect(hazeEnabled("?haze=off", false)).toBe(false);
    expect(hazeEnabled("?haze=off", true)).toBe(true);
    expect(HAZE.enabled).toBe(true);
  });
  it("source: data only (no new objects or materials), no random, garden only, daynight.json untouched", () => {
    const w = readFileSync("components/World.tsx", "utf8"), lib = readFileSync("lib/sky.ts", "utf8");
    expect(lib).not.toMatch(/Math\.random/);
    expect(w).toMatch(/hazeEnabled\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    expect(w).toContain('hazeOn && zones.is("garden")');
    expect(w).toContain("hazeFog(L.fog, haze)");
    expect(readFileSync("components/hillsScene.ts", "utf8")).not.toMatch(/transparent|depthTest/);
    for (const f of ["components/skyScene.ts", "components/worldShell.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/haze[A-Za-z]*\s*=\s*new THREE\.Mesh/);
  });
});
