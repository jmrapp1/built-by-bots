import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPOTS, REGIONS, allSpotsForDay, nearestSpot, regionRect, spotKey, spotsForDay, spotsOverride } from "@/lib/worldSpots";
import { blocked, chunkCircles, chunkContents, chunkOf, regionAt, distToPath } from "@/lib/worldMap";
import { openedWorldFromClaims, runWorldUnfold, worldOutcomeFrom } from "@/lib/spots-server";
import { settleUnfold } from "@/lib/margins-server";
import { SIGNPOSTS } from "@/lib/map";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "");
const sql = src("../supabase/migrations/20261021000001_world_spots.sql");
const days = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10));

describe("spot counts match the server's table", () => {
  it("meadow 4, inkwood 8, paper_downs 8 and glyph_quarter 8, exactly as seeded in the migrations", () => {
    expect(SPOTS.counts).toEqual({ meadow: 4, inkwood: 8, paper_downs: 8, glyph_quarter: 8 });
    expect(src("../supabase/migrations/20261021000002_paper_downs_spots.sql")).toMatch(/values \('paper_downs', 8\)/);
    expect(src("../supabase/migrations/20261021000003_glyph_quarter_spots.sql")).toMatch(/values \('glyph_quarter', 8\)/);
    expect(sql).toMatch(/values \('margins', 12\), \('meadow', 4\), \('inkwood', 8\)/);
    expect(REGIONS).toEqual(["meadow", "inkwood", "paper_downs", "glyph_quarter"]);
  });
});

describe("daily layout", () => {
  it("is the same for the same day and region, in any order", () => {
    const a = days.map((d) => allSpotsForDay(d)), b = [...days].reverse().map((d) => allSpotsForDay(d)).reverse();
    expect(b).toEqual(a);
  });
  it("differs from day to day", () => {
    expect(JSON.stringify(spotsForDay(days[0], "inkwood"))).not.toEqual(JSON.stringify(spotsForDay(days[1], "inkwood")));
  });
  it("always places the full count, with ids 0..n-1, inside the right region", () => {
    for (const d of days) for (const r of REGIONS) {
      const list = spotsForDay(d, r), R = regionRect(r);
      expect(list.map((s) => s.id)).toEqual(Array.from({ length: SPOTS.counts[r] }, (_, i) => i));
      for (const s of list) {
        expect(s.x).toBeGreaterThanOrEqual(R.x0); expect(s.x).toBeLessThanOrEqual(R.x1);
        expect(s.z).toBeGreaterThanOrEqual(R.z0); expect(s.z).toBeLessThanOrEqual(R.z1);
        expect(regionAt(s.z, s.x)).toBe(r);
      }
    }
  });
  it("keeps clear of the path, landmarks, signposts, the garden and every drawn tree, rock and bush", () => {
    for (const d of days) for (const s of allSpotsForDay(d)) {
      expect(blocked(s.x, s.z)).toBe(false);
      expect(SIGNPOSTS.every((p) => Math.hypot(p.x - s.x, p.z - s.z) > 2.5)).toBe(true);
      expect(distToPath(s.x, s.z)).toBeGreaterThan(3);
      const cx = chunkOf(s.x), cz = chunkOf(s.z);
      for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) for (const c of chunkCircles(chunkContents(a, b))) expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeGreaterThan(c.r + 1);
    }
  });
  it("spots are spread apart", () => {
    for (const d of days) for (const r of REGIONS) { const l = spotsForDay(d, r); for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) expect(Math.hypot(l[i].x - l[j].x, l[i].z - l[j].z)).toBeGreaterThanOrEqual(SPOTS.minGap); }
  });
  it("nearestSpot picks the closest unopened spot within reach", () => {
    const l = spotsForDay(days[0], "meadow"), s = l[0];
    expect(nearestSpot({ x: s.x + 1, z: s.z }, l, new Set())?.id).toBe(0);
    expect(nearestSpot({ x: s.x + 1, z: s.z }, l, new Set([spotKey("meadow", 0)]))).toBeNull();
    expect(nearestSpot({ x: s.x + SPOTS.reach + 1, z: s.z }, l, new Set())).toBeNull();
  });
  it("dev override is ignored in production", () => {
    expect(spotsOverride("?spots=off", false)).toBe("off");
    expect(spotsOverride("?spots=off", true)).toBeNull();
  });
});

describe("the server answer", () => {
  const row = (region: string, spot: number, result = "ink", day = "2026-10-21") => ({ owner: "x", day, region, spot, result, egg_id: null, cosmetic: null });
  it("maps a row for the same region and spot", () => {
    expect(worldOutcomeFrom([row("inkwood", 3)], null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: true, kind: "ink", spot: 3, duplicate: false });
    expect(worldOutcomeFrom(row("inkwood", 3, "scrap"), null, "inkwood", 3, "2026-10-21", true)).toEqual({ ok: true, kind: "scrap", spot: 3, duplicate: true });
  });
  it("refuses a row for another region, spot or day", () => {
    expect(worldOutcomeFrom(row("meadow", 3), null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: false, reason: "other" });
    expect(worldOutcomeFrom(row("inkwood", 2), null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: false, reason: "other" });
    expect(worldOutcomeFrom(row("inkwood", 3, "ink", "2026-10-22"), null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: false, reason: "wrong-day" });
    expect(worldOutcomeFrom(row("inkwood", 3, "bogus"), null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: false, reason: "other" });
    expect(worldOutcomeFrom(null, null, "inkwood", 3, "2026-10-21", false)).toEqual({ ok: false, reason: "other" });
  });
  it("a keepsake names its cosmetic; old kinds gain no new fields", () => {
    const o = worldOutcomeFrom({ ...row("meadow", 1, "keepsake"), cosmetic: "lantern" }, null, "meadow", 1, "2026-10-21", false);
    expect(o).toMatchObject({ ok: true, kind: "keepsake" });
    expect(Object.keys(worldOutcomeFrom(row("meadow", 1), null, "meadow", 1, "2026-10-21", false)).sort()).toEqual(["duplicate", "kind", "ok", "spot"]);
  });
  it("the ceiling refusal is quiet and carries no numbers", () => {
    const o = worldOutcomeFrom(null, { message: "enough pages for today" }, "meadow", 1, "2026-10-21", false);
    expect(o).toEqual({ ok: false, reason: "ceiling" });
    const st = settleUnfold(o, true);
    expect(st.ceiling).toBe(true); expect(st.note).not.toMatch(/\d|cap|limit/i);
  });
  it("calls only after reading the claim row; a failed read calls nothing", async () => {
    let calls = 0;
    const call = async () => { calls++; return { data: row("meadow", 1), error: null }; };
    expect(await runWorldUnfold(call, "meadow", 1, "2026-10-21", async () => null)).toEqual({ ok: false, reason: "network" });
    expect(calls).toBe(0);
    expect(await runWorldUnfold(call, "meadow", 1, "2026-10-21", async () => true)).toMatchObject({ ok: true, duplicate: true });
    expect(await runWorldUnfold(async () => { throw new Error("x"); }, "meadow", 1, "2026-10-21", async () => false)).toEqual({ ok: false, reason: "network" });
  });
  it("sends the region and spot to the call and nothing else", async () => {
    const seen: unknown[][] = [];
    await runWorldUnfold(async (...a) => { seen.push(a); return { data: row("inkwood", 5), error: null }; }, "inkwood", 5, "2026-10-21", async () => false);
    expect(seen).toEqual([["inkwood", 5]]);
  });
  it("reads only World rows for today and skips the rest", () => {
    const rows = [row("margins", 2), row("meadow", 1), row("inkwood", 7), row("inkwood", 3, "ink", "2026-10-20"), { spot: 4, result: "ink", day: "2026-10-21" }, row("nowhere", 1), row("inkwood", 1.5)];
    expect(openedWorldFromClaims(rows, "2026-10-21").sort()).toEqual(["inkwood:7", "meadow:1"]);
    expect(openedWorldFromClaims(null, "2026-10-21")).toEqual([]);
  });
});

describe("wiring", () => {
  const page = strip(src("../app/page.tsx")), world = strip(src("../components/World.tsx"));
  it("page calls world_unfold with region and spot only, and margins_unfold is unchanged", () => {
    expect(page).toMatch(/rpc\("world_unfold", \{ p_region: r, p_spot: n \}\)/);
    expect(page).toMatch(/rpc\("margins_unfold", \{ p_spot: n \}\)/);
  });
  it("reads claims by region and day as lists, never .single()", () => {
    const w = page.slice(page.indexOf("const unfoldWorld"), page.indexOf("const loadOpened"));
    expect(w).toContain("margins_claims");
    expect(w).not.toMatch(/\.single\(|\.maybeSingle\(/);
    expect(page).toMatch(/\.eq\("region", region\)\.eq\("spot", spot\)\.eq\("day", day\)/);
    expect(page).toMatch(/\.eq\("day", day\)\.neq\("region", "margins"\)/);
  });
  it("the Margins reads are still the same two, now filtered to region margins", () => {
    expect(page).toMatch(/from\("margins_claims"\)\.select\("spot"\)\.eq\("region", "margins"\)\.eq\("spot", spot\)\.eq\("day", day\)/);
    expect(page).toMatch(/from\("margins_claims"\)\.select\("spot,result,day"\)\.eq\("region", "margins"\)\.eq\("day", day\);/);
  });
  it("no network or storage in the world, scene or libs", () => {
    for (const f of ["../components/World.tsx", "../components/spotsScene.ts", "../lib/worldSpots.ts", "../lib/spots-server.ts"]) expect(strip(src(f))).not.toMatch(/supabase|\.rpc\(|fetch\(|localStorage/);
  });
  it("no canvas text, no text in the scene", () => { expect(src("../components/spotsScene.ts")).not.toMatch(/fillText|strokeText|TextGeometry|CanvasTexture/); });
  it("the call is made only after the hold completes, the full-pouch and quiet checks first, and a refusal opens nothing", () => {
    const i = world.indexOf("let wNear: Place | null"), blockSrc = world.slice(i, world.indexOf("Third-person follow camera"));
    expect(blockSrc.indexOf("wHold >= 1")).toBeLessThan(blockSrc.indexOf("onWorldUnfold("));
    expect(blockSrc.indexOf("canGather")).toBeLessThan(blockSrc.indexOf("onWorldUnfold("));
    expect(blockSrc.indexOf("wQuiet")).toBeLessThan(blockSrc.indexOf("onWorldUnfold("));
    expect(blockSrc).toMatch(/if \(st\.open\) dayOpened\.add\(key\)/);
    expect(blockSrc).toMatch(/if \(st\.ceiling\) wQuiet = true/);
  });
  it("spots are built on entering the garden and freed on leaving, never in dev-preview mode", () => {
    expect(world).toMatch(/const leaveGardenZone = \(\) => \{ stopSpots\(\);/);
    expect(world).toMatch(/startSpots\(\); \};/);
    expect(world).toMatch(/\|\| local;/);
  });
  it("the map shows opened spots only where you have walked", () => {
    expect(src("../components/MapPage.tsx")).toMatch(/isWalked\(walked, o\.x, o\.z\)\) continue/);
  });
});

describe("the Margins gate reads stay on the margins region", () => {
  const page = strip(src("../app/page.tsx"));
  it("wasOpen and loadOpened filter by region margins", () => {
    expect(page).toContain('.select("spot").eq("region", "margins").eq("spot", spot).eq("day", day)');
    expect(page).toContain('.select("spot,result,day").eq("region", "margins").eq("day", day)');
  });
  it("no margins_claims read lacks a region filter", () => {
    const reads = page.split('from("margins_claims")').slice(1).map((r) => r.slice(0, 160));
    expect(reads.length).toBeGreaterThanOrEqual(4);
    for (const r of reads) expect(r).toMatch(/\.(eq|neq)\("region"/);
  });
});
