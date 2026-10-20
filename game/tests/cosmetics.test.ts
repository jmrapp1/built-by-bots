import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "@/data/cosmetics.json";
import {
  ANCHOR_NAMES, COSMETIC_IDS, COSMETICS, cosmeticOverride, cosmeticsProblem, cycleAt, isCosmetic, lanternGlow, newestWorn, placementFor, putOnFrame, putOnSeconds,
} from "@/lib/cosmetics";
import { SPECIES } from "@/lib/species";

describe("keepsake data", () => {
  it("has the six, each with a placement, and every species has every anchor it needs", () => {
    expect(COSMETIC_IDS).toEqual(["leaf_sprig", "ribbon", "ink_cheeks", "paper_crown", "scarf", "lantern"]);
    expect(cosmeticsProblem()).toBeNull();
    for (const sp of SPECIES) for (const c of COSMETICS) expect(placementFor(c.id, sp.id, "round"), `${sp.id} ${c.id}`).not.toBeNull();
  });
  it("the data test fails if a species lacks an anchor or a keepsake lacks a placement", () => {
    const real = JSON.parse(JSON.stringify(data));
    // a copy of the check, run on broken data, to prove it bites
    const check = (d: typeof data) => {
      for (const sp of SPECIES) {
        const block = (d.anchors as Record<string, Record<string, unknown>>)[sp.id];
        if (!block) return `no anchors for ${sp.id}`;
        for (const c of d.cosmetics) {
          const p = (d.placement as Record<string, { anchor: string }>)[c.id];
          if (!p) return `no placement for ${c.id}`;
          if (!block[p.anchor]) return `${sp.id} lacks ${p.anchor}`;
        }
      }
      return null;
    };
    expect(check(real)).toBeNull();
    const noSpecies = JSON.parse(JSON.stringify(data)); delete noSpecies.anchors.leaflet;
    expect(check(noSpecies)).toMatch(/no anchors for leaflet/);
    const noAnchor = JSON.parse(JSON.stringify(data)); delete noAnchor.anchors.blotling.neck;
    expect(check(noAnchor)).toMatch(/blotling lacks neck/);
    const noPlace = JSON.parse(JSON.stringify(data)); delete noPlace.placement.ribbon;
    expect(check(noPlace)).toMatch(/no placement for ribbon/);
  });
  it("anchors sit on the body: above the ground, near the middle, sensible sizes", () => {
    for (const [sp, block] of Object.entries(data.anchors)) for (const [name, a] of Object.entries(block as Record<string, { x: number; y: number; z: number; scale: number }>)) {
      expect(ANCHOR_NAMES as readonly string[]).toContain(name);
      expect(a.y, `${sp} ${name}`).toBeGreaterThan(0.2);
      expect(a.y).toBeLessThan(1.5);
      expect(Math.hypot(a.x, a.z)).toBeLessThan(0.8);
      expect(a.scale).toBeGreaterThan(0.5);
      expect(a.scale).toBeLessThan(1.5);
    }
  });
  it("placement follows the body shape, and an unknown id shows nothing (never a crash)", () => {
    const round = placementFor("paper_crown", "blotling", "round")!, tall = placementFor("paper_crown", "blotling", "tall")!, wide = placementFor("paper_crown", "blotling", "wide")!;
    expect(tall.pos[1]).toBeGreaterThan(round.pos[1]); // a tall body is taller
    expect(wide.pos[1]).toBeLessThan(round.pos[1]);
    expect(placementFor("nope", "blotling", "round")).toBeNull();
    expect(placementFor(null, "blotling", "round")).toBeNull();
    expect(placementFor("ribbon", "unknown-species", "weird-shape")).not.toBeNull(); // falls back to the blotling block and round shape
    expect(isCosmetic("ribbon")).toBe(true);
    expect(isCosmetic("crown")).toBe(false);
  });
  it("the leaflet's flatter body gets its own anchors", () => {
    const a = placementFor("paper_crown", "blotling", "round")!, b = placementFor("paper_crown", "leaflet", "round")!;
    expect(b.flat).toBeLessThan(1);
    expect(JSON.stringify(a.pos)).not.toBe(JSON.stringify(b.pos));
  });
});

describe("one slot: the newest found is worn", () => {
  it("picks the latest, ignores unknown ids and bad dates", () => {
    expect(newestWorn([])).toBeNull();
    expect(newestWorn([{ id: "ribbon", found_at: "2026-10-20T10:00:00Z" }, { id: "scarf", found_at: "2026-10-21T10:00:00Z" }, { id: "lantern", found_at: "2026-10-19T10:00:00Z" }])).toBe("scarf");
    expect(newestWorn([{ id: "nope", found_at: "2026-10-22T10:00:00Z" }, { id: "ribbon", found_at: "2026-10-20T10:00:00Z" }])).toBe("ribbon");
    expect(newestWorn([{ id: "ribbon", found_at: "garbage" }])).toBeNull();
  });
});

describe("the dev-only preview switch", () => {
  it("wears one or cycles all in development, and is ignored in production", () => {
    expect(cosmeticOverride("?cosmetic=ribbon", false)).toEqual({ kind: "one", id: "ribbon" });
    expect(cosmeticOverride("?cosmetic=all", false)).toEqual({ kind: "all" });
    expect(cosmeticOverride("?cosmetic=nope", false)).toBeNull();
    expect(cosmeticOverride("", false)).toBeNull();
    expect(cosmeticOverride("?cosmetic=ribbon", true)).toBeNull();
    expect(cosmeticOverride("?cosmetic=all", true)).toBeNull();
  });
  it("the cycle visits all six in order and wraps", () => {
    const every = data.preview.cycleSeconds;
    expect(COSMETIC_IDS.map((_, i) => cycleAt(i * every + 0.1))).toEqual(COSMETIC_IDS);
    expect(cycleAt(COSMETIC_IDS.length * every + 0.1)).toBe(COSMETIC_IDS[0]);
    expect(cycleAt(-5)).toBe(COSMETIC_IDS[0]);
  });
});

describe("the put-on motion", () => {
  const total = putOnSeconds();
  it("is about a second: a hop, a settle, then a squash with one wobble", () => {
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThan(1.3);
    const P = data.putOn;
    expect(putOnFrame(0).hop).toBe(0);
    expect(putOnFrame(P.hopSeconds).hop).toBeCloseTo(P.hopHeight, 5); // the top of the hop
    expect(putOnFrame(P.hopSeconds + P.settleSeconds).hop).toBeCloseTo(0, 5); // back on the ground
    expect(putOnFrame(P.hopSeconds + P.settleSeconds).newScale).toBeCloseTo(P.overshoot, 5); // new keepsake overshoots as it lands
    const landed = putOnFrame(P.hopSeconds + P.settleSeconds + 0.02);
    expect(landed.bodyY).toBeLessThan(1); // squashed
    expect(landed.bodyXZ).toBeGreaterThan(1); // and wider
    const end = putOnFrame(total + 0.01);
    expect(end).toMatchObject({ hop: 0, bodyY: 1, bodyXZ: 1, newScale: 1, done: true });
    expect(putOnFrame(0).done).toBe(false);
  });
  it("has a clear start, middle and end: the old one leaves while the new one arrives, with no jumps", () => {
    let prev = putOnFrame(0);
    expect(prev.oldScale).toBe(1);
    expect(prev.newScale).toBe(0);
    let wobbles = 0, lastSign = 0;
    for (let t = 0; t <= total + 0.05; t += 1 / 60) {
      const f = putOnFrame(t);
      for (const k of ["hop", "bodyY", "bodyXZ", "newScale", "oldScale"] as const) expect(Math.abs(f[k] - prev[k]), `${k} at ${t.toFixed(3)}`).toBeLessThan(0.1);
      const sign = Math.sign(f.bodyY - 1);
      if (sign !== 0 && lastSign !== 0 && sign !== lastSign) wobbles++;
      if (sign !== 0) lastSign = sign;
      prev = f;
    }
    expect(wobbles).toBeLessThanOrEqual(2); // one small wobble, not a spring
    expect(putOnFrame(data.putOn.hopSeconds).oldScale).toBeCloseTo(0, 5);
  });
  it("keeps the volume about the same on the squash", () => {
    for (let t = data.putOn.hopSeconds + data.putOn.settleSeconds; t <= total; t += 0.02) {
      const f = putOnFrame(t), vol = f.bodyY * f.bodyXZ * f.bodyXZ;
      expect(Math.abs(vol - 1)).toBeLessThan(0.05);
    }
  });
  it("asleep: only a gentle settle, no hop and no squash", () => {
    expect(putOnSeconds(false, true)).toBeLessThan(total);
    for (let t = 0; t <= putOnSeconds(false, true); t += 0.02) {
      const f = putOnFrame(t, false, true);
      expect(f.hop).toBe(0);
      expect(f.bodyY).toBe(1);
    }
    expect(putOnFrame(putOnSeconds(false, true) + 0.01, false, true)).toMatchObject({ newScale: 1, done: true });
  });
  it("reduced motion: no hop, no squash, no scaling; only a fade of about a third of a second", () => {
    expect(putOnSeconds(true)).toBeLessThan(0.5);
    for (let t = 0; t <= 0.4; t += 0.02) {
      const f = putOnFrame(t, true);
      expect(f.hop).toBe(0);
      expect(f.bodyY).toBe(1);
      expect(f.bodyXZ).toBe(1);
      expect(f.newScale).toBe(1);
      expect(f.newFade + f.oldFade).toBeCloseTo(1, 5);
    }
    expect(putOnFrame(0, true)).toMatchObject({ newFade: 0, oldFade: 1 });
    expect(putOnFrame(0.4, true)).toMatchObject({ newFade: 1, oldFade: 0, done: true });
  });
});

describe("the lantern glow", () => {
  it("is dark by day, lit at night, pulses gently, and is steady with reduced motion", () => {
    expect(lanternGlow(0, 1, false)).toBe(0);
    expect(lanternGlow(1, 1, false)).toBeGreaterThan(0.3);
    const vals = [0, 0.6, 1.3, 1.9].map((t) => lanternGlow(1, t, false));
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThan(0.3);
    expect(new Set([0, 0.6, 1.3, 1.9].map((t) => lanternGlow(1, t, true))).size).toBe(1);
  });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("keepsake code never touches the network, and adds no rpc or text on screen", () => {
    for (const f of ["../lib/cosmetics.ts", "../lib/cosmeticsBuild.ts"]) expect(src(f)).not.toMatch(/supabase|\.rpc\(|fetch\(|localStorage|Date\.now|performance/);
    const calls = [...src("../app/page.tsx").matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold"]);
    expect(src("../lib/cosmeticsBuild.ts")).not.toMatch(/FontLoader|TextGeometry|CanvasTexture|textures?\//);
  });
  it("the world reads the preview switch through cosmeticOverride", () => {
    expect(src("../components/World.tsx")).toMatch(/cosmeticOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
  });
  it("nothing in the data is shown as text, and nothing has digits in a name", () => {
    for (const c of COSMETICS) expect(c.name).not.toMatch(/\d/);
  });
});
