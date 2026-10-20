import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORAGE, carried, dropOffset, inHand, inReach, pouchAdd, pouchSpend, shimmer, sinceReady, spotReady, spotsAreClear } from "@/lib/forage";
import { PLAY } from "@/lib/play";
import { FOODS } from "@/lib/rules";
import { GATHER_NUDGE, feedPrompt } from "@/lib/ui";
import { BOARD_PAGES } from "@/lib/board";

const order = FOODS.map((f) => f.id);

describe("pouch", () => {
  it("holds up to its size and then refuses, leaving the item where it is", () => {
    let p: string[] = [];
    for (let i = 0; i < FORAGE.pouchSize; i++) p = pouchAdd(p, "ink")!;
    expect(p).toHaveLength(FORAGE.pouchSize);
    expect(pouchAdd(p, "glyph")).toBeNull();
    expect(p).toHaveLength(FORAGE.pouchSize); // untouched
  });
  it("spends one item of the kind, and nothing if it isn't carried", () => {
    expect(pouchSpend(["ink", "glyph", "ink"], "ink")).toEqual(["glyph", "ink"]);
    expect(pouchSpend(["ink"], "glyph")).toEqual(["ink"]);
    expect(pouchSpend([], "ink")).toEqual([]);
  });
  it("does not change the original (a refused feed keeps the item)", () => {
    const p = ["ink", "glyph"];
    pouchSpend(p, "ink");
    expect(p).toEqual(["ink", "glyph"]);
  });
});

describe("food in hand follows the pouch", () => {
  it("lists only carried kinds, in food order", () => {
    expect(carried(["glyph", "ink", "glyph"], order)).toEqual(order.filter((id) => ["ink", "glyph"].includes(id)));
    expect(carried(["glyph"], order)).toEqual(["glyph"]);
    expect(carried([], order)).toEqual([]);
  });
  it("falls back to what is carried, and is empty with an empty pouch", () => {
    expect(inHand(["glyph"], "ink", order)).toBe("glyph");
    expect(inHand(["ink", "glyph"], "glyph", order)).toBe("glyph");
    expect(inHand([], "ink", order)).toBeNull();
  });
});

describe("pickups", () => {
  it("are ready at their stagger, taken ones return after the respawn time", () => {
    expect(spotReady(null, 0, 0)).toBe(true);
    expect(spotReady(null, 5, 12)).toBe(false);
    expect(spotReady(null, 12, 12)).toBe(true);
    expect(spotReady(100, 100 + FORAGE.respawnSeconds - 1, 0)).toBe(false);
    expect(spotReady(100, 100 + FORAGE.respawnSeconds, 0)).toBe(true);
  });
  it("respawn is about a minute", () => {
    expect(FORAGE.respawnSeconds).toBeGreaterThanOrEqual(45);
    expect(FORAGE.respawnSeconds).toBeLessThanOrEqual(90);
  });
  it("report how long they have been ready", () => {
    expect(sinceReady(null, 3, 12)).toBe(-1);
    expect(sinceReady(null, 13, 12)).toBeCloseTo(1);
    expect(sinceReady(10, 10 + FORAGE.respawnSeconds + 0.5, 0)).toBeCloseTo(0.5);
  });
  it("have a generous reach, bigger than the player's body", () => {
    expect(FORAGE.reach).toBeGreaterThanOrEqual(1);
    expect(inReach({ x: 0, z: 0 }, { x: FORAGE.reach - 0.01, z: 0 })).toBe(true);
    expect(inReach({ x: 0, z: 0 }, { x: FORAGE.reach + 0.01, z: 0 })).toBe(false);
  });
  it("have both kinds, with ids that are real foods and unique", () => {
    expect(new Set(FORAGE.spots.map((s) => s.kind))).toEqual(new Set(order));
    expect(new Set(FORAGE.spots.map((s) => s.id)).size).toBe(FORAGE.spots.length);
  });
  it("sit inside the garden, clear of trees, hedges and places", () => {
    expect(spotsAreClear()).toBe(true);
    expect(spotsAreClear([{ id: "x", kind: "ink", x: 8, z: -6, readyAfter: 0 }])).toBe(false); // on the inkwell
  });
  it("fall in then rest, and are still when motion is reduced", () => {
    expect(dropOffset(0)).toBeCloseTo(FORAGE.dropHeight);
    expect(dropOffset(FORAGE.dropSeconds)).toBe(0);
    expect(dropOffset(0.1, true)).toBe(0);
  });
  it("shimmer is calmer when reduced", () => {
    const wide = (r: boolean) => Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(shimmer(i * 0.1, 0, r).scale - 1)));
    expect(wide(true)).toBeLessThan(wide(false));
  });
});

describe("offering", () => {
  it("nudges to gather first, and only near a hatched Print", () => {
    expect(feedPrompt(true, true, false)).toBe(GATHER_NUDGE);
    expect(feedPrompt(true, true, true)).toBe("Hold to feed");
    expect(feedPrompt(true, false, false)).toBeNull();
    expect(feedPrompt(false, true, false)).toBeNull();
  });
  it("a hold that ends in a feed is still longer than the cooldown window", () => {
    expect(PLAY.reactionSeconds).toBeGreaterThan(3);
  });
});

describe("the client", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("makes no server call for gathering and keeps one feed call", () => {
    expect(src("../lib/forage.ts")).not.toMatch(/supabase|rpc|three|Date\.now|performance/);
    expect(src("../components/World.tsx")).not.toMatch(/supabase|\.rpc\(/);
    const calls = [...src("../app/page.tsx").matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold"]);
  });
  it("spends the item only after the server accepts the feed", () => {
    const page = src("../app/page.tsx");
    const feed = page.slice(page.indexOf("const feed = async"), page.indexOf("const feed = async") + 1200);
    expect(feed.indexOf("if (error)")).toBeGreaterThan(-1);
    expect(feed.indexOf("pouchSpend")).toBeGreaterThan(feed.indexOf("if (error)"));
  });
  it("the board mentions gathering without numbers", () => {
    const text = BOARD_PAGES.flatMap((p) => p.lines).join(" ");
    expect(text).toMatch(/gather/i);
    expect(JSON.stringify(BOARD_PAGES)).not.toMatch(/\d/);
  });
});
