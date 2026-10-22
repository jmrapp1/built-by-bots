// NPC gifts N4 (client): the words are fixed data, the claim sends only the neighbour id, a failure grants nothing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GIFT_ERRORS, giftNpc, giftStrip, runClaimGift, withOwned } from "@/lib/gifts";
import { MAX_LINE, NPCS, checkNpc } from "@/lib/npcs";
import { DECORATIONS, fitting, partsExtent } from "@/lib/decor";
import raw from "@/data/npcs.json";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const mig = readFileSync(new URL("../supabase/migrations/20261021000007_npc_gifts.sql", import.meta.url), "utf8");
const GIFTS: Record<string, string> = { binder: "bookmark-ribbon", proofreader: "quill-stand", wanderer: "travelling-lantern" };
const reply = (data: unknown) => async () => ({ data, error: null });
const row = (npc: string, isNew: boolean) => [{ npc, decoration: GIFTS[npc], is_new: isNew }];

describe("gift data", () => {
  it("each of the three neighbours has short authored words with icons", () => {
    expect(NPCS.map((n) => n.id).sort()).toEqual(Object.keys(GIFTS).sort());
    for (const n of NPCS) {
      expect(n.gift).not.toBeNull();
      expect(n.gift!.line.length).toBeLessThanOrEqual(MAX_LINE); expect(n.gift!.thanks.length).toBeLessThanOrEqual(MAX_LINE);
      expect(n.gift!.line).not.toBe(n.gift!.thanks);
      expect(giftNpc(n.id)).toBe(n);
    }
    expect(giftNpc("nobody")).toBeNull();
  });
  it("bad gift words drop only the gift, not the neighbour", () => {
    const v = (f: (g: any) => void) => { const n = JSON.parse(JSON.stringify(raw.npcs[0])); f(n.gift); return checkNpc(n); };
    expect(v((g) => { g.line = ""; })?.gift).toBeNull();
    expect(v((g) => { g.thanks = "x".repeat(MAX_LINE + 1); })?.gift).toBeNull();
    expect(v((g) => { g.icons = ["nope"]; })?.gift).toBeNull();
    expect(v(() => {})?.gift).not.toBeNull();
    const none = JSON.parse(JSON.stringify(raw.npcs[0])); delete none.gift;
    expect(checkNpc(none)?.gift).toBeNull();
  });
  it("the three pieces exist, match the migration, and the ribbon is the wall piece", () => {
    for (const id of Object.values(GIFTS)) { expect(DECORATIONS.some((d) => d.id === id)).toBe(true); expect(mig).toContain(`'${id}'`); }
    expect(DECORATIONS.find((d) => d.id === "bookmark-ribbon")!.fits).toBe("wall");
    expect(fitting("west-wall").map((d) => d.id)).toContain("bookmark-ribbon");
    expect(fitting("north-left").map((d) => d.id)).not.toContain("bookmark-ribbon");
    for (const id of ["quill-stand", "travelling-lantern"]) expect(fitting("north-left").map((d) => d.id)).toContain(id);
    for (const [npc, dec] of Object.entries(GIFTS)) expect(mig).toMatch(new RegExp(`when '${npc}' then '${dec}'`));
  });
  it("new pieces stay on their footprint-ish size and have a look", () => {
    for (const id of Object.values(GIFTS)) { const d = DECORATIONS.find((x) => x.id === id)!; const e = partsExtent(d); expect(d.parts.length).toBeGreaterThan(2); expect(e.hx).toBeLessThan(0.6); expect(e.top).toBeLessThan(2.4); expect(e.low).toBeGreaterThanOrEqual(-0.001); }
  });
});

describe("runClaimGift", () => {
  it("sends only the neighbour id", async () => {
    let args: unknown; await runClaimGift(async (a) => { args = a; return { data: row("binder", true), error: null }; }, "binder");
    expect(args).toEqual({ p_npc: "binder" });
  });
  it("first claim is new, a repeat is not", async () => {
    expect(await runClaimGift(reply(row("wanderer", true)), "wanderer")).toEqual({ ok: true, npc: "wanderer", decoration: "travelling-lantern", isNew: true });
    expect(await runClaimGift(reply(row("wanderer", false)), "wanderer")).toMatchObject({ ok: true, isNew: false });
  });
  it("a failed call grants nothing and says why", async () => {
    expect(await runClaimGift(async () => ({ data: null, error: { message: "TypeError: Failed to fetch" } }), "binder")).toEqual({ ok: false, note: GIFT_ERRORS.network });
    expect(await runClaimGift(async () => ({ data: null, error: { message: "no such neighbour" } }), "binder")).toEqual({ ok: false, note: GIFT_ERRORS.other });
    expect(await runClaimGift(async () => { throw new Error("offline"); }, "binder")).toEqual({ ok: false, note: GIFT_ERRORS.network });
  });
  it("an odd answer grants nothing", async () => {
    for (const d of [null, [], {}, [{ npc: "proofreader", decoration: "quill-stand", is_new: true }], [{ npc: "binder", decoration: "nope", is_new: true }], [{ npc: "binder", decoration: "bookmark-ribbon" }]])
      expect(await runClaimGift(reply(d), "binder")).toMatchObject({ ok: false });
  });
});

describe("giftStrip and owned", () => {
  const n = giftNpc("binder")!;
  it("shows the gift line the first time, the thank-you after, nothing on failure", () => {
    expect(giftStrip(n, { ok: true, npc: "binder", decoration: "bookmark-ribbon", isNew: true })!.text).toBe(n.gift!.line);
    expect(giftStrip(n, { ok: true, npc: "binder", decoration: "bookmark-ribbon", isNew: false })!.text).toBe(n.gift!.thanks);
    expect(giftStrip(n, { ok: false, note: "x" })).toBeNull();
    expect(giftStrip(null, { ok: true, npc: "binder", decoration: "bookmark-ribbon", isNew: true })).toBeNull();
  });
  it("withOwned never duplicates and does not mutate", () => {
    const o = ["bench"]; expect(withOwned(o, "quill-stand")).toEqual(["bench", "quill-stand"]); expect(withOwned(["bench"], "bench")).toEqual(["bench"]); expect(o).toEqual(["bench"]);
  });
});

describe("wiring", () => {
  it("lib/gifts is pure; the page makes the one new call and never grants locally", () => {
    expect(src("../lib/gifts.ts")).not.toMatch(/supabase|\.rpc\(|fetch\(|localStorage|Date\.now|performance|three/);
    const page = src("../app/page.tsx");
    expect((page.match(/"claim_npc_gift"/g) ?? []).length).toBe(1);
    expect(page).toContain("runClaimGift(");
    expect(page).not.toMatch(/p_decoration: *["'](bookmark|quill|travelling)/);
    expect(src("../components/World.tsx")).not.toMatch(/claim_npc_gift|supabase/);
  });
  it("?decor=stub never calls the gift and the button needs a signed-in account", () => {
    const page = src("../app/page.tsx");
    expect(page).toMatch(/!userId \|\| stubDecor/);
    expect(page).toMatch(/npcLine\.last && (npcLine\.g !== 2 && )?userId && !stubDecor/);
  });
});
