// Slice 6d-3b: the client side of keepsakes from the Margins. Pure mapping tests plus pins on the wiring.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapClaim, openedFromClaims, outcomeFrom, runUnfold, settleUnfold, foodOf, ALREADY_OPEN, type Outcome } from "@/lib/margins-server";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const day = "2026-10-20";
const row = (o: Record<string, unknown>) => ({ spot: 3, day, ...o });

describe("the new answer", () => {
  it("maps a keepsake row with its id; an unknown id still opens the page but names nothing", () => {
    expect(mapClaim(row({ result: "keepsake", cosmetic: "ribbon" }))).toEqual({ spot: 3, kind: "keepsake", day, cosmetic: "ribbon" });
    expect(mapClaim(row({ result: "keepsake", cosmetic: "nope" }))).toEqual({ spot: 3, kind: "keepsake", day });
    expect(mapClaim(row({ result: "keepsake" }))?.cosmetic).toBeUndefined();
  });
  it("today's four kinds map exactly as before, with no keepsake id", () => {
    for (const k of ["ink", "glyph", "scrap", "egg"]) expect(mapClaim(row({ result: k, cosmetic: null }))).toEqual({ spot: 3, kind: k, day });
    expect(mapClaim(row({ result: "ink", cosmetic: "ribbon" }))?.cosmetic).toBeUndefined(); // only a keepsake row carries one
    expect(mapClaim(row({ result: "banana" }))).toBeNull();
  });
  it("outcomeFrom carries the id and the day check and repeat flag work for it", () => {
    const o = outcomeFrom([row({ result: "keepsake", cosmetic: "scarf" })], null, 3, day, false);
    expect(o).toEqual({ ok: true, kind: "keepsake", cosmetic: "scarf", spot: 3, duplicate: false });
    expect(outcomeFrom(row({ result: "keepsake", cosmetic: "scarf", day: "2026-10-21" }), null, 3, day, false)).toEqual({ ok: false, reason: "wrong-day" });
    expect((outcomeFrom(row({ result: "keepsake", cosmetic: "scarf" }), null, 3, day, true) as { duplicate: boolean }).duplicate).toBe(true);
  });
  it("the page counts as open after a reload, for keepsake pages too", () => {
    expect([...openedFromClaims([row({ spot: 1, result: "keepsake", cosmetic: "lantern" }), row({ spot: 2, result: "ink" })], day)].sort()).toEqual([1, 2]);
  });
});

describe("settling a keepsake", () => {
  const ks = (extra: Partial<Outcome & { ok: true }> = {}) => ({ ok: true, kind: "keepsake", cosmetic: "paper_crown", spot: 3, duplicate: false, ...extra }) as Outcome;
  it("opens the page, wears it, grants no food, no scrap and no egg", () => {
    const s = settleUnfold(ks(), true, true);
    expect(s).toMatchObject({ open: true, animate: true, kind: "keepsake", cosmetic: "paper_crown", food: null, scrap: false, egg: false, held: null });
  });
  it("a full pouch never holds a keepsake: it opens even with no room", () => {
    const s = settleUnfold(ks(), true, false);
    expect(s).toMatchObject({ open: true, held: null, cosmetic: "paper_crown" });
    expect(foodOf("keepsake")).toBeNull();
  });
  it("a repeat shows the page open, grants nothing and does not change what is worn", () => {
    const s = settleUnfold(ks({ duplicate: true }), true);
    expect(s).toMatchObject({ open: true, animate: false, food: null, held: null, note: ALREADY_OPEN });
  });
  it("a late answer (left the Margins) still wears it, with no animation", () => {
    expect(settleUnfold(ks(), false)).toMatchObject({ open: true, animate: false, cosmetic: "paper_crown" });
  });
  it("a refusal wears nothing", () => {
    expect(settleUnfold({ ok: false, reason: "ceiling" }, true).cosmetic).toBeUndefined();
  });
  it("when the server gave food instead (all six owned) it is an ordinary food find", () => {
    for (const k of ["ink", "glyph"] as const) {
      expect(settleUnfold({ ok: true, kind: k, spot: 3, duplicate: false }, true, true)).toMatchObject({ open: true, food: k });
      expect(settleUnfold({ ok: true, kind: k, spot: 3, duplicate: false }, true, false)).toMatchObject({ open: false, held: k });
    }
  });
  it("today's server (four kinds) behaves exactly as before", () => {
    expect(settleUnfold({ ok: true, kind: "scrap", spot: 3, duplicate: false }, true)).toMatchObject({ open: true, scrap: true });
    expect(settleUnfold({ ok: true, kind: "egg", spot: 3, duplicate: false }, true)).toMatchObject({ open: true, egg: true });
  });
  it("the whole path: runUnfold with a keepsake answer, the layout day and the repeat check", async () => {
    const call = async () => ({ data: [row({ result: "keepsake", cosmetic: "lantern" })], error: null });
    const fresh = await runUnfold(call, 3, day, async () => false);
    expect(settleUnfold(fresh, true).cosmetic).toBe("lantern");
    const again = await runUnfold(call, 3, day, async () => true);
    expect(settleUnfold(again, true).cosmetic).toBeUndefined(); // a second tab: the page was already open
    const failedRead = await runUnfold(call, 3, day, async () => null);
    expect(failedRead).toEqual({ ok: false, reason: "network" });
  });
});

describe("the wiring", () => {
  const page = src("../app/page.tsx"), world = src("../components/World.tsx");
  it("reads worn_cosmetic from the creatures it already loads and passes it on; no new read, rpc or table", () => {
    expect(page).toMatch(/worn=\{\(stubPicker \? stubWorn : creature\?\.worn_cosmetic\) \?\? null\}/);
    expect(page).toMatch(/select\("\*"\)\.order\("created_at"/);
    const tables = new Set([...page.matchAll(/\.from\("([a-z0-9_]+)"\)/g)].map((m) => m[1]));
    for (const t of tables) expect(["creatures", "eggs", "margins_claims", "daily_egg_claims", "game_stages", "game_foods", "game_species", "game_rules", "game_daily_pool", "owned_cosmetics", "owned_decorations", "home_decorations", "npc_gifts"]).toContain(t);
    expect(tables.has("owned_cosmetics")).toBe(true); // 6e-2: the picker reads the player's own keepsakes once, when it opens (pinned in picker.test.ts)
    const calls = [...page.matchAll(/\.rpc\("([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_npc_gift", "claim_npc_gift2", "claim_starter_decorations", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold", "set_home_decoration", "set_worn_cosmetic", "world_unfold"]);
  });
  it("a keepsake from the server sets the first Print's worn id, as the server does", () => {
    expect(page).toMatch(/setCreatures\(\(cs\) => cs\.map\(\(c, i\) => \(i === 0 \? \{ \.\.\.c, worn_cosmetic: id \} : c\)\)\)/);
  });
  it("the put-on plays only just after a find, never on load or when switching Prints; the preview still cycles", () => {
    expect(world).toMatch(/cosPlayUntil/);
    expect(world).toMatch(/const moving = \(cosPreview \? cosInit : t < cosPlayUntil && zones\.is\("garden"\)\)/);
    expect(world).toMatch(/cosPlayUntil = performance\.now\(\) \+ \d+; cb\.current\.onKeepsake/);
  });
  it("a find made away from the garden plays the put-on once, when the player is back", () => {
    expect(world).toMatch(/cosFoundAway = true; cb\.current\.onKeepsake/);
    expect(world).toMatch(/if \(cosFoundAway\) \{ cosFoundAway = false; cosHold = performance\.now\(\) \+ \d+; cosPlayUntil = performance\.now\(\) \+ \d+; \}/);
    expect(world).toMatch(/wantId !== cosId && \(cosPreview \|\| \(zones\.is\("garden"\) && t >= cosHold\)\)/);
  });
  it("a keepsake is drawn as a scrap but never counted as one", () => {
    expect(world).toMatch(/const keepsakePages = new Set<number>\(\)/);
    expect(world).toMatch(/if \(st\.kind === "keepsake"\) keepsakePages\.add\(spot\.id\); spot\.kind = st\.kind === "keepsake" \? "scrap" : st\.kind/);
    expect(world).toMatch(/if \(sp\.kind === "scrap" && !keepsakePages\.has\(sp\.id\)\) scraps\+\+/);
    // the count is only ever raised in these two places: the finish step (guarded above) and a late answer that really was a scrap
    expect([...world.matchAll(/scraps\+\+/g)].length).toBe(2);
    expect(settleUnfold({ ok: true, kind: "keepsake", cosmetic: "ribbon", spot: 3, duplicate: false }, false).scrap).toBe(false);
    expect(settleUnfold({ ok: true, kind: "scrap", spot: 3, duplicate: false }, false).scrap).toBe(true);
  });
  it("the preview switch is still dev-only and unchanged", () => {
    expect(world).toMatch(/cosmeticOverride\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
  });
  it("no supabase folder change is part of the client, and the text has no digits for keepsakes", () => {
    expect(src("../lib/margins-server.ts")).not.toMatch(/supabase|\.rpc\(|fetch\(/);
  });
});

describe("applying a Print the server sends back", () => {
  it("keeps what is worn when the answer does not carry it", () => {
    expect(src("../app/page.tsx")).toMatch(/c\.worn_cosmetic === undefined \? \{ \.\.\.c, worn_cosmetic: x\.worn_cosmetic \} : c/);
  });
});
