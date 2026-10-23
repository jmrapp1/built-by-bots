import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import data from "@/data/weather.json";
import { KEYS, lightingAt } from "@/lib/daynight";
import { bedYaw } from "@/lib/dream";
import { startState, seeded } from "@/lib/fidget";
import { GARDEN } from "@/lib/world";
import { NIGHT } from "@/lib/night";
import { dropBase, dropY, localDay, nextGlanceGap, nightness, startGlance, weatherAt, weatherLight, weatherOverride, windowFor, windowLevel } from "@/lib/weather";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const lib = strip(readFileSync("lib/weather.ts", "utf8"));
const scene = strip(readFileSync("components/drizzle.ts", "utf8"));
const world = readFileSync("components/World.tsx", "utf8");
const day0 = 20000;

describe("ink drizzle (S25)", () => {
  it("preview parser is null in production and for junk", () => {
    expect(weatherOverride("?weather=1", true)).toBeNull();
    expect(weatherOverride("?weather=off", true)).toBeNull();
    expect(weatherOverride("?weather=1", false)).toBe("on");
    expect(weatherOverride("?weather=off", false)).toBe("off");
    expect(weatherOverride("?weather=x", false)).toBeNull();
    expect(weatherOverride("", false)).toBeNull();
  });
  it("same day gives the same answer", () => {
    for (let d = day0; d < day0 + 60; d++) expect(windowFor(d)).toEqual(windowFor(d));
    expect(weatherAt(day0, 12, false)).toEqual(weatherAt(day0, 12, false));
  });
  it("about one day in four over a 28-day sweep and over a year", () => {
    let wet = 0;
    for (let d = day0; d < day0 + 28; d++) if (windowFor(d)) wet++;
    expect(wet).toBeGreaterThanOrEqual(5);
    expect(wet).toBeLessThanOrEqual(9);
    let year = 0;
    for (let d = day0; d < day0 + 360; d++) if (windowFor(d)) year++;
    expect(year / 360).toBeGreaterThan(0.2);
    expect(year / 360).toBeLessThan(0.3);
  });
  it("window length and start stay inside the data limits", () => {
    for (let d = day0; d < day0 + 800; d++) {
      const w = windowFor(d); if (!w) continue;
      expect(w.start).toBeGreaterThanOrEqual(data.startHours[0]);
      expect(w.start).toBeLessThanOrEqual(data.startHours[1]);
      const len = w.end - w.start;
      expect(len).toBeLessThanOrEqual(data.lengthHours[1] + 1e-9);
      if (w.end < 24) expect(len).toBeGreaterThanOrEqual(data.lengthHours[0] - 1e-9);
    }
  });
  it("intensity is 0 outside a window and at both fade ends, and eases in between", () => {
    const d = Array.from({ length: 40 }, (_, k) => day0 + k).find((x) => windowFor(x) && windowFor(x)!.end < 24)!;
    const w = windowFor(d)!, mid = (w.start + w.end) / 2, fh = data.fadeSeconds / 3600;
    expect(windowLevel(w, w.start)).toBe(0);
    expect(windowLevel(w, w.end)).toBe(0);
    expect(windowLevel(w, w.start - 0.5)).toBe(0);
    expect(windowLevel(w, w.end + 0.5)).toBe(0);
    expect(windowLevel(w, mid)).toBe(1);
    expect(windowLevel(w, w.start + fh / 2)).toBeGreaterThan(0);
    expect(windowLevel(w, w.start + fh / 2)).toBeLessThan(1);
    expect(windowLevel(w, w.start + fh)).toBeCloseTo(1, 6);
    let prev = 0; // never jumps: steps of one second move the level by a small amount
    for (let s = 0; s <= data.fadeSeconds; s++) { const l = windowLevel(w, w.start + s / 3600); expect(l - prev).toBeLessThan(0.15); expect(l).toBeGreaterThanOrEqual(prev); prev = l; }
    expect(weatherAt(d, w.start, false).intensity).toBe(0);
    expect(weatherAt(d, w.end, false).opacity).toBe(0);
    expect(weatherAt(d, mid, false).intensity).toBe(1);
  });
  it("the dev preview forces full drizzle, or dry", () => {
    for (const h of [3, 12, 23]) {
      expect(weatherAt(day0, h, false, "on").intensity).toBe(1);
      expect(weatherAt(day0, h, false, "off")).toEqual({ intensity: 0, tint: 0, density: 0, opacity: 0, speed: 0 });
    }
  });
  it("night is dimmer and sparser than day; both still drizzle", () => {
    const day = weatherAt(day0, 12, false, "on"), night = weatherAt(day0, 23, false, "on");
    expect(night.density).toBeGreaterThan(0);
    expect(night.density).toBeLessThan(day.density);
    expect(night.opacity).toBeLessThan(day.opacity);
    expect(night.speed).toBeLessThan(day.speed);
    expect(nightness(12)).toBe(0);
    expect(nightness(23)).toBe(1);
    expect(nightness(2)).toBe(1);
  });
  it("tint greys the existing lighting and leaves daynight alone", () => {
    const L = lightingAt(12), same = weatherLight(L, 0);
    expect(same).toBe(L);
    const g = weatherLight(L, 1);
    expect(g.sky).not.toBe(L.sky);
    expect(g.sunIntensity).toBeLessThan(L.sunIntensity);
    expect(g.sunPosition).toEqual(L.sunPosition);
    expect(KEYS.length).toBeGreaterThan(0);
    expect(weatherLight(L, 0.5).sunIntensity).toBeGreaterThan(g.sunIntensity);
  });
  it("reduced motion: constant positions, few still drops, tint kept", () => {
    const b = dropBase(7);
    expect(dropY(b, 0, 1, true)).toBe(dropY(b, 99.5, 1, true));
    expect(dropY(b, 0, 1, false)).not.toBe(dropY(b, 1, 1, false));
    const r = weatherAt(day0, 12, true, "on"), n = weatherAt(day0, 12, false, "on");
    expect(Math.round(r.density * data.drops.count)).toBe(data.drops.reducedCount);
    expect(r.density).toBeLessThan(n.density);
    expect(r.tint).toBe(n.tint);
  });
  it("drops stay inside the box height and wrap", () => {
    for (let i = 0; i < data.drops.count; i++) for (const t of [0, 1.3, 50, 1e4]) { const y = dropY(dropBase(i), t, 1, false); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(data.drops.height); }
  });
  it("the count is small and every number is read from the data file", () => {
    expect(data.drops.count).toBeLessThanOrEqual(400);
    expect(lib).toContain('@/data/weather.json');
    expect(lib).not.toMatch(/\b(0\.55|260|20)\b/);
    expect(scene).toContain("WEATHER");
    expect(scene).not.toMatch(/\b(260|2\.2|0\.5|0\.8|0\.22)\b/);
  });
  it("local day string pads", () => { expect(localDay(new Date(2026, 0, 5, 3))).toBe("2026-01-05"); });
  it("while it drizzles an awake Print gets the existing glance, once, never over a running fidget", () => {
    const s = startState(seeded(1));
    const g = startGlance(s, 0.2);
    expect(g.kind).toBe("glance"); expect(g.side).toBe(-1); expect(g.w).toBe(0);
    expect(startGlance(g, 0.9)).toBe(g);
    expect(nextGlanceGap(0.5, false)).toBeGreaterThanOrEqual(data.glance.gap[0]);
    expect(nextGlanceGap(0.5, false)).toBeLessThanOrEqual(data.glance.gap[1]);
    expect(nextGlanceGap(0.5, true)).toBe(data.glance.previewGap);
  });
  it("lib and scene: no network, storage, clock or randomness, and never a click target", () => {
    for (const src of [lib, scene]) expect(src).not.toMatch(/fetch\(|localStorage|sessionStorage|cookie|supabase|Math\.random|Date\.now|new Date|performance\.now/);
    expect(scene).toMatch(/raycast = \(\) => \{\}/);
    expect(scene).toMatch(/object\.visible = false/);
    expect(scene).toMatch(/dispose\(\)/);
  });
  it("World wires it: garden only, freed on leave, no touch to the pond/hide/stats, night data file untouched", () => {
    expect(world).toMatch(/weatherOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
    expect(world).toMatch(/showDream\(\); showDrizzle\(\); showScraps\(\); startSpots\(\); \}/);
    expect(world).toMatch(/stopSpots = \(\) => \{ dropScraps\(\); dropDream\(\); dropDrizzle\(\);/);
    expect(world).toMatch(/if \(zones\.is\("garden"\)\) drizzle\.update\(/);
    expect(world).toMatch(/else drizzle\.object\.visible = false/);
    expect(world).toMatch(/weatherLight\(lightingAt\(zones\.is\("home"\)/);
    expect(world).toMatch(/zones\.is\("garden"\) \? weatherNow\(hourNow\)\.tint : 0/);
  });
  it("no new request, dependency or storage key in the changed files", () => {
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/weather|drizzle/i);
    expect(JSON.stringify(data)).not.toMatch(/https?:|\.png|\.jpg|\.svg|\.mp3|\.ogg/);
  });
});

describe("dev preview: ?dream= starts facing the bed (S25 follow-up)", () => {
  it("the player faces the bed from the start for the four sides and the real start", () => {
    const face = (from: { x: number; z: number }, bed: { x: number; z: number }) => { const y = bedYaw(from, bed); return { x: -Math.sin(y), z: -Math.cos(y) }; };
    const bed = { x: 0, z: 0 };
    expect(face({ x: 0, z: 5 }, bed).z).toBeCloseTo(-1, 6);
    expect(face({ x: 0, z: -5 }, bed).z).toBeCloseTo(1, 6);
    expect(face({ x: 5, z: 0 }, bed).x).toBeCloseTo(-1, 6);
    expect(face({ x: -5, z: 0 }, bed).x).toBeCloseTo(1, 6);
    const s = { x: GARDEN.player.start[0], z: GARDEN.player.start[1] }, f = face(s, NIGHT.bed);
    const dx = NIGHT.bed.x - s.x, dz = NIGHT.bed.z - s.z, d = Math.hypot(dx, dz);
    expect(f.x).toBeCloseTo(dx / d, 6);
    expect(f.z).toBeCloseTo(dz / d, 6);
  });
  it("only the dev preview turns the camera: normal starts keep yaw 0", () => {
    expect(world).toMatch(/let yaw = dreamMode \? bedYaw\(\{ x: pos\.x, z: pos\.z \}, NIGHT\.bed\) : 0;/);
  });
});
