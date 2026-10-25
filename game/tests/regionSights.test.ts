// Night sights in Paper Downs, Inkwood and Glyph Quarter: data checks, clear of every solid, the daily pick, the wiring. Looks only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/regionSights.json";
import shoreRaw from "@/data/shoreSights.json";
import { checkSights } from "@/lib/sights";
import { REGION_SALT, REGION_SIGHTS, SIGHT_REGIONS, regionBounds, regionSightsForDay, regionUsable } from "@/lib/regionSights";
import { SHORE_SALT } from "@/lib/shoreSights";
import { HALF, blocked, regionAt } from "@/lib/worldMap";
import { spotsForDay } from "@/lib/worldSpots";
import { SIGNPOSTS } from "@/lib/map";
import { reachability, reachedNear, worldColliders } from "@/lib/sight";
import { buildAll, buildHedges, featureCircles, hedgeTouches, keepClear } from "@/lib/features";

const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));
const key = (p: { x: number; z: number }) => `${p.x},${p.z}`;
const data = raw as unknown as Record<string, { points: unknown[] }>;

describe.each(SIGHT_REGIONS)("%s night sights", (region) => {
  const S = REGION_SIGHTS[region]!;
  it("loads, with every point kept (none dropped by the region bounds), of all three kinds", () => {
    expect(S).not.toBeNull();
    expect(S.points).toHaveLength(data[region].points.length);
    expect(S.points.length).toBeGreaterThanOrEqual(10); expect(S.points.length).toBeLessThanOrEqual(14);
    expect(new Set(S.points.map((p) => p.kind)).size).toBe(3);
    expect(new Set(S.points.map(key)).size).toBe(S.points.length);
  });
  it("matches the shore's hours, counts, clear distances and notice distances, with short fixed captions", () => {
    for (const k of ["window", "perNight", "clear", "notice"] as const) expect(S[k]).toEqual(shoreRaw[k]);
    for (const c of Object.values(S.captions)) { expect(c.length).toBeLessThanOrEqual(60); expect(c).not.toMatch(/reward|trade|gift|prize|coin|egg|food/i); }
  });
  it("every point is inside the region, inside the World, and clear of every solid, signpost, hedge, the path, Home and the gate", () => {
    const b = regionBounds(region), hp = buildHedges(), feats = featureCircles(buildAll());
    for (const p of S.points) {
      expect(regionAt(p.z, p.x), key(p)).toBe(region);
      expect(p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1, key(p)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThan(HALF); expect(Math.abs(p.z)).toBeLessThan(HALF);
      expect(blocked(p.x, p.z), key(p)).toBe(false); expect(keepClear(p.x, p.z, 2.5), key(p)).toBe(false);
      expect(regionUsable(p, [], S.clear), key(p)).toBe(true);
      expect(hedgeTouches(p.x, p.z, S.clear.scenery, hp, 0), key(p)).toBe(false);
      for (const c of feats) expect(Math.hypot(c.x - p.x, c.z - p.z), key(p)).toBeGreaterThan(c.r + 1);
      for (const s of SIGNPOSTS) expect(Math.hypot(s.x - p.x, s.z - p.z), key(p)).toBeGreaterThan(3);
    }
  });
  it("the daily pick gives 5 to 7 points from the list, the same for the same day, none on a folded-page spot", () => {
    for (const d of days) {
      const a = regionSightsForDay(d, region, S), pages = spotsForDay(d, region);
      expect(a.length).toBeGreaterThanOrEqual(5); expect(a.length).toBeLessThanOrEqual(7);
      expect(regionSightsForDay(d, region, S)).toEqual(a);
      for (const p of a) { expect(S.points.map(key)).toContain(key(p)); for (const q of pages) expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThanOrEqual(S.clear.pages); }
    }
  });
  it("varies by day and reaches every point over two months", () => {
    expect(new Set(days.map((d) => regionSightsForDay(d, region, S).map(key).sort().join("|"))).size).toBeGreaterThan(20);
    const seen = new Set<string>(); for (const d of days) for (const p of regionSightsForDay(d, region, S)) seen.add(key(p));
    expect(seen.size).toBe(S.points.length);
  });
  it("a point moved onto a landmark, a signpost or the path is refused", () => {
    expect(regionUsable({ x: SIGNPOSTS[0].x, z: SIGNPOSTS[0].z }, [], S.clear)).toBe(false);
    expect(regionUsable({ x: S.points[0].x, z: S.points[0].z }, [{ x: S.points[0].x, z: S.points[0].z + 0.5 }], S.clear)).toBe(false);
  });
});

describe("reachability", () => {
  const reach = reachability(worldColliders(), 0.5);
  it("the walk from the spawn reaches every sight point in all three regions", () => {
    for (const r of SIGHT_REGIONS) for (const p of REGION_SIGHTS[r]!.points) expect(reachedNear(reach, p.x, p.z, 1), `${r} ${key(p)}`).toBe(true);
  });
});

describe("the three regions together", () => {
  it("use different seeds from each other and from the shore", () => { expect(new Set([...Object.values(REGION_SALT), SHORE_SALT, 0]).size).toBe(5); });
  it("a bad block gives no sights for that region only", () => {
    const rb = regionBounds("inkwood");
    expect(checkSights(null, rb)).toBeNull();
    const d = JSON.parse(JSON.stringify(data.inkwood)); d.points[0].x = 9999;
    expect(checkSights(d, rb)!.points).toHaveLength(data.inkwood.points.length - 1);
  });
  it("a point from one region is rejected by another's bounds", () => {
    const d = checkSights(data.glyph_quarter, regionBounds("paper_downs"))!; expect(d.points).toHaveLength(0);
  });
  it("is wired into the World with looks only: no network, storage or reward calls in the module", () => {
    const s = readFileSync(new URL("../lib/regionSights.ts", import.meta.url), "utf8");
    expect(s).not.toMatch(/fetch\(|supabase|localStorage|sessionStorage|XMLHttp|https?:\/\/|Math\.random/);
    const w = readFileSync(new URL("../components/World.tsx", import.meta.url), "utf8");
    expect(w).toContain("buildRegionSights()"); expect(w).toContain("dropRegionSights()");
  });
});
