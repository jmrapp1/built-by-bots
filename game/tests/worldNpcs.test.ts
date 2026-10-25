// Neighbours in the open World (words only): the data check, placement clear of every solid and reachable on foot,
// the Margins neighbours unchanged, and the wiring. Nothing is given, saved or sent.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/worldNpcs.json";
import margRaw from "@/data/npcs.json";
import { MAX_LINE, NPCS, WORLD_NPCS, checkNpc, checkNpcs, npcSpot, talk, TALK0 } from "@/lib/npcs";
import { HALF, blocked, regionAt } from "@/lib/worldMap";
import { freeAt, spotsForDay } from "@/lib/worldSpots";
import { SIGNPOSTS } from "@/lib/map";
import { reachability, reachedNear, worldColliders } from "@/lib/sight";
import { buildAll, buildHedges, featureCircles, hedgeTouches, keepClear } from "@/lib/features";
import { REGION_SIGHTS } from "@/lib/regionSights";

const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const clone = (i = 0) => JSON.parse(JSON.stringify(raw.npcs[i]));

describe("World neighbours: data", () => {
  it("loads all of them, one each in Inkwood, Paper Downs and Glyph Quarter, with distinct ids, names and looks", () => {
    expect(WORLD_NPCS).toHaveLength(raw.npcs.length);
    expect(new Set(WORLD_NPCS.map((n) => n.id)).size).toBe(WORLD_NPCS.length);
    expect(new Set(WORLD_NPCS.map((n) => n.name)).size).toBe(WORLD_NPCS.length);
    expect(WORLD_NPCS.map((n) => regionAt(npcSpot(n).z, npcSpot(n).x)).sort()).toEqual(["glyph_quarter", "inkwood", "paper_downs"]);
    for (const n of WORLD_NPCS) expect(n.area).toBe("world");
  });
  it("only speak: short lines, 1 to 3 icons, no gift, no day list, nothing about rewards", () => {
    for (const n of WORLD_NPCS) {
      expect(n.gift).toBeNull(); expect(n.gift2).toBeNull(); expect(n.spots).toBeNull();
      expect(n.hints.length).toBeGreaterThanOrEqual(4);
      for (const h of n.hints) { expect(h.text.length).toBeLessThanOrEqual(MAX_LINE); expect(h.text).not.toMatch(/reward|errand|trade|gift|prize|coin|egg|food/i); }
    }
    expect(JSON.stringify(raw)).not.toMatch(/"gift2?"/);
  });
  it("the same notice and talk distances as the Margins neighbours", () => {
    const m = NPCS[0];
    for (const n of WORLD_NPCS) expect([n.noticeEnter, n.noticeLeave, n.talkEnter, n.talkLeave]).toEqual([m.noticeEnter, m.noticeLeave, m.talkEnter, m.talkLeave]);
  });
  it("each talk shows the next hint and loops", () => {
    const n = WORLD_NPCS[0]; let t = TALK0;
    for (let i = 0; i < n.hints.length; i++) { t = talk(t, n.hints.length); expect(t.shown).toBe(i); }
    expect(talk(t, n.hints.length).shown).toBe(0);
  });
  it("hints that name a night sight or a signpost match a region that has them", () => {
    for (const r of ["paper_downs", "inkwood", "glyph_quarter"] as const) expect(REGION_SIGHTS[r]).not.toBeNull();
    expect(SIGNPOSTS.length).toBeGreaterThanOrEqual(9);
  });
});

describe("World neighbours: placement", () => {
  const hp = buildHedges(), feats = featureCircles(buildAll());
  it("each stands inside the World and its region, clear of every solid, hedge, the path, Home, the gate, landmarks and signposts", () => {
    for (const n of WORLD_NPCS) {
      const p = npcSpot(n), id = n.id;
      expect(Math.abs(p.x), id).toBeLessThan(HALF - 2); expect(Math.abs(p.z), id).toBeLessThan(HALF - 2);
      expect(blocked(p.x, p.z), id).toBe(false); expect(keepClear(p.x, p.z, 3), id).toBe(false);
      expect(freeAt(p.x, p.z, 2.5), id).toBe(true);
      expect(hedgeTouches(p.x, p.z, 2.5, hp, 0), id).toBe(false);
      for (const c of feats) expect(Math.hypot(c.x - p.x, c.z - p.z), id).toBeGreaterThan(c.r + 2.5);
      for (const s of SIGNPOSTS) expect(Math.hypot(s.x - p.x, s.z - p.z), id).toBeGreaterThan(3);
    }
  });
  it("each can be walked to from the spawn, and none stands within talking distance of another", () => {
    const reach = reachability(worldColliders(), 0.5);
    for (const n of WORLD_NPCS) { const p = npcSpot(n); expect(reachedNear(reach, p.x, p.z, 1), n.id).toBe(true); }
    for (const a of WORLD_NPCS) for (const b of WORLD_NPCS) if (a !== b) { const p = npcSpot(a), q = npcSpot(b); expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(30); }
  });
    it("no day's folded page lies on top of one over two months", () => {
    for (const d of days) for (const n of WORLD_NPCS) { const p = npcSpot(n); for (const s of spotsForDay(d, regionAt(p.z, p.x))) expect(Math.hypot(s.x - p.x, s.z - p.z), `${d} ${n.id}`).toBeGreaterThan(2); }
  });
});

describe("the data check for a World neighbour", () => {
  it("accepts the shipped entries and refuses a gate form, a day list, a gift, a point outside the World, or a bad area", () => {
    for (let i = 0; i < raw.npcs.length; i++) expect(checkNpc(clone(i))).not.toBeNull();
    const v = (f: (n: any) => void) => { const n = clone(); f(n); return checkNpc(n); };
    expect(v((n) => { n.spot = { from: "gate", out: 3, side: 2 }; })).toBeNull();
    expect(v((n) => { n.spots = [n.spot, n.spot, n.spot]; })).toBeNull();
    expect(v((n) => { n.gift = { line: "x", thanks: "y", icons: ["leaf"] }; })).toBeNull();
    expect(v((n) => { n.spot = { at: [9999, 0], face: 0 }; })).toBeNull();
    expect(v((n) => { n.spot = { at: [1, 1] }; })).toBeNull();
    expect(v((n) => { n.area = "garden"; })).toBeNull();
    expect(v((n) => { n.hints = []; })).toBeNull();
  });
  it("one broken entry skips only that neighbour", () => {
    const bad = clone(1); bad.hints = [];
    expect(checkNpcs({ npcs: [raw.npcs[0], bad, raw.npcs[2]] }).map((n) => n.id)).toEqual([raw.npcs[0].id, raw.npcs[2].id]);
  });
});

describe("the Margins neighbours are unchanged", () => {
  it("the same three, in the same order, all in the Margins, none from the World file", () => {
    expect(NPCS.map((n) => n.id)).toEqual(["binder", "proofreader", "wanderer"]);
    for (const n of NPCS) expect(n.area).toBe("margins");
    expect(NPCS.map((n) => n.id).filter((id) => WORLD_NPCS.some((w) => w.id === id))).toEqual([]);
    expect(margRaw.npcs.every((n) => n.area === "margins")).toBe(true);
  });
  it("a Margins entry put in the World file is ignored, and a World entry put in the Margins file is not a Margins neighbour", () => {
    expect(checkNpcs({ npcs: [margRaw.npcs[0]] }).filter((n) => n.area === "world")).toHaveLength(0);
    const w = clone(); const list = checkNpcs({ npcs: [...margRaw.npcs, w] });
    expect(list.filter((n) => n.area === "margins").map((n) => n.id)).toEqual(NPCS.map((n) => n.id));
  });
  it("a Margins neighbour still refuses a point outside the Margins", () => {
    const n = JSON.parse(JSON.stringify(margRaw.npcs[1])); n.spot = { at: [500, 0], face: 0 };
    expect(checkNpc(n)).toBeNull();
  });
});

describe("wiring and limits", () => {
  const lib = strip(readFileSync("lib/npcs.ts", "utf8"));
  const world = readFileSync("components/World.tsx", "utf8");
  it("no network, storage, clock or randomness in the engine", () => {
    expect(lib).not.toMatch(/fetch\(|localStorage|sessionStorage|XMLHttpRequest|https?:\/\/|Math\.random|Date\.now|new Date/);
  });
  it("World builds them with the World shell, frees them with it, makes them solid and lets E and a tap talk to them", () => {
    expect(world).toContain("buildWorldNpcs();");
    expect(world).toMatch(/dropRegionSights\(\); dropWorldNpcs\(\);/);
    expect(world).toContain("...wNpcCircles()");
    expect(world).toContain("[...live_npcs, ...wNpcs].find");
    expect(world).toContain("wNear ?? wNpcNear");
    expect(world).not.toMatch(/WORLD_NPCS[^\n]*(onGather|npc_gifts|fetch)/);
  });
});
