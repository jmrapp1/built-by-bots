// Day scraps across the World: data checks, clear of every solid, the daily pick, the wiring. Looks only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/dayScraps.json";
import scraps from "@/data/scraps.json";
import { DAY_SCRAP_SALT, dayScrapBits, dayScrapUsable, dayScrapsInRegion } from "@/lib/dayScraps";
import { REGIONS, spotsForDay } from "@/lib/worldSpots";
import { HALF, blocked, regionAt } from "@/lib/worldMap";
import { SIGNPOSTS } from "@/lib/map";
import { reachability, reachedNear, worldColliders } from "@/lib/sight";
import { buildAll, buildHedges, featureCircles, hedgeTouches, keepClear } from "@/lib/features";

const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));
const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("day scraps data", () => {
  it("has a count for every region, small numbers, and the Garden's glyph marks to draw from", () => {
    for (const r of REGIONS) { expect(raw.counts[r]).toBeGreaterThanOrEqual(3); expect(raw.counts[r]).toBeLessThanOrEqual(6); }
    expect(Object.keys(raw.counts).sort()).toEqual([...REGIONS].sort());
    expect(scraps.glyphs.length).toBeGreaterThanOrEqual(3);
  });
});

describe.each(REGIONS)("%s day scraps", (region) => {
  it("gives the full count each day, in this region, in the World, the same on a reload", () => {
    for (const d of days) {
      const a = dayScrapsInRegion(d, region);
      expect(a).toHaveLength(raw.counts[region]);
      expect(dayScrapsInRegion(d, region)).toEqual(a);
      for (const p of a) { expect(regionAt(p.z, p.x), `${d} ${key(p)}`).toBe(region); expect(Math.abs(p.x)).toBeLessThan(HALF); expect(Math.abs(p.z)).toBeLessThan(HALF); }
    }
  });
  it("lies clear of every solid, hedge, signpost, the path, Home, the gate, the landmarks, today's folded pages and the Garden scraps", () => {
    const hp = buildHedges(), feats = featureCircles(buildAll());
    for (const d of days) {
      const pages = spotsForDay(d, region);
      for (const p of dayScrapsInRegion(d, region)) {
        expect(blocked(p.x, p.z), key(p)).toBe(false); expect(keepClear(p.x, p.z, 1), key(p)).toBe(false);
        expect(hedgeTouches(p.x, p.z, raw.clear.scenery, hp, 0), key(p)).toBe(false);
        for (const c of feats) expect(Math.hypot(c.x - p.x, c.z - p.z), key(p)).toBeGreaterThan(c.r + 1);
        for (const s of SIGNPOSTS) expect(Math.hypot(s.x - p.x, s.z - p.z), key(p)).toBeGreaterThan(2.5);
        for (const q of pages) expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThanOrEqual(raw.clear.pages);
        for (const g of scraps.points) expect(Math.hypot(g.x - p.x, g.z - p.z)).toBeGreaterThanOrEqual(raw.clear.garden);
        expect(dayScrapUsable(p, pages)).toBe(true);
      }
    }
  });
  it("keeps the scraps apart and changes from day to day", () => {
    for (const d of days) { const a = dayScrapsInRegion(d, region); for (const p of a) for (const q of a) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(raw.minGap); }
    expect(new Set(days.map((d) => dayScrapsInRegion(d, region).map(key).join("|"))).size).toBe(days.length);
  });
});

describe("day scraps together", () => {
  it("draw a fixed glyph, angle and phase from the day, and none sits on the same spot as another region's", () => {
    for (const d of days.slice(0, 10)) {
      const bits = dayScrapBits(d);
      expect(bits).toHaveLength(REGIONS.reduce((n, r) => n + raw.counts[r], 0));
      expect(dayScrapBits(d)).toEqual(bits);
      for (const b of bits) { expect(Number.isInteger(b.glyph) && b.glyph >= 0 && b.glyph < scraps.glyphs.length).toBe(true); expect(Number.isFinite(b.yaw)).toBe(true); }
      expect(new Set(bits.map(key)).size).toBe(bits.length);
    }
  });
  it("differ from one day to the next and use more than one glyph", () => {
    expect(new Set(days.map((d) => dayScrapBits(d).map(key).join("|"))).size).toBe(days.length);
    expect(new Set(dayScrapBits(days[0]).map((b) => b.glyph)).size).toBeGreaterThan(2);
  });
  it("the seed differs from the page spots' and sights' seeds", () => { expect(new Set([DAY_SCRAP_SALT, 0, 0x5d0e5, 0x1a4b0, 0x61f9]).size).toBe(5); });
  it("every scrap of a sample of days can be walked to from the spawn", () => {
    const reach = reachability(worldColliders(), 0.5);
    for (const d of days.filter((_, i) => i % 6 === 0)) for (const b of dayScrapBits(d)) expect(reachedNear(reach, b.x, b.z, 1), `${d} ${key(b)}`).toBe(true);
  });
});

describe("wiring and limits", () => {
  const lib = strip(readFileSync("lib/dayScraps.ts", "utf8"));
  const world = readFileSync("components/World.tsx", "utf8");
  it("has no network, storage, clock or Math.random, and nothing to collect", () => {
    expect(lib).not.toMatch(/fetch\(|localStorage|sessionStorage|XMLHttpRequest|https?:\/\/|Math\.random|Date\.now|new Date/);
    expect(lib).not.toMatch(/onGather|reward|food/i);
  });
  it("World builds them with the Garden scraps, drops them with them, and ?scraps=off hides them", () => {
    expect(world).toContain("dayScrapBits(utcDay(new Date()))");
    expect(world).toMatch(/scrapMode !== "off"[^\n]*dayScraps = buildGlyphScraps/);
    expect(world).toMatch(/dropScraps = \(\) => \{ try \{ if \(dayScraps\)/);
  });
});
