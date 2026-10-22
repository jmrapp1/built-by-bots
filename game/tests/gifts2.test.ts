// NPC gifts N5 (client): second-gift words are data, the claim sends only the neighbour id, the server's answer is only mapped.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GIFT_ERRORS, gift2Npc, gift2Strip, runClaimGift2 } from "@/lib/gifts";
import { MAX_LINE, NPCS, checkNpc } from "@/lib/npcs";
import { DECORATIONS, fitting, partsExtent } from "@/lib/decor";
import raw from "@/data/npcs.json";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const mig = readFileSync(new URL("../supabase/migrations/20261022000001_npc_gifts2.sql", import.meta.url), "utf8");
const GIFTS2: Record<string, string> = { binder: "page-stack", proofreader: "reading-lamp", wanderer: "pressed-leaf-frame" };
const reply = (data: unknown) => async () => ({ data, error: null });
const claimed = (npc: string, isNew: boolean) => [{ npc, decoration: GIFTS2[npc], is_new: isNew, state: "claimed" }];

describe("gift2 data", () => {
  it("each neighbour has short authored second-gift words with icons and one fixed waiting line", () => {
    for (const n of NPCS) {
      const g = n.gift2!; expect(g).toBeTruthy(); expect(gift2Npc(n.id)).toBe(n);
      for (const t of [g.line, g.thanks, g.waiting]) expect(t.length).toBeLessThanOrEqual(MAX_LINE);
      expect(g.line).not.toBe(g.thanks); expect(g.waiting).toBe("Come back another day.");
    }
    expect(gift2Npc("nobody")).toBeNull();
  });
  it("bad gift2 words drop only the second gift", () => {
    const v = (f: (g: any) => void) => { const n = JSON.parse(JSON.stringify(raw.npcs[0])); f(n.gift2); return checkNpc(n); };
    expect(v((g) => { g.waiting = ""; })?.gift2).toBeNull();
    expect(v((g) => { g.line = "x".repeat(MAX_LINE + 1); })?.gift2).toBeNull();
    expect(v((g) => { g.waitingIcons = ["nope"]; })?.gift2).toBeNull();
    expect(v(() => {})?.gift2).not.toBeNull(); expect(v(() => {})?.gift).not.toBeNull();
  });
  it("the three pieces exist, match the migration; the leaf frame is a second choice for the one wall plot", () => {
    for (const [npc, id] of Object.entries(GIFTS2)) { expect(DECORATIONS.some((d) => d.id === id)).toBe(true); expect(mig).toContain(`'${id}'`); expect(mig).toMatch(new RegExp(`when '${npc}' then '${id}'`)); }
    expect(DECORATIONS.find((d) => d.id === "pressed-leaf-frame")!.fits).toBe("wall");
    expect(fitting("west-wall").map((d) => d.id)).toContain("pressed-leaf-frame");
    expect(fitting("west-wall").map((d) => d.id)).toContain("framed-page"); // the starter stays
    for (const id of ["page-stack", "reading-lamp"]) { expect(fitting("north-left").map((d) => d.id)).toContain(id); expect(fitting("west-wall").map((d) => d.id)).not.toContain(id); }
    expect(fitting("north-left").map((d) => d.id)).not.toContain("pressed-leaf-frame");
  });
  it("pieces stay small and sit on the floor or wall", () => {
    for (const id of Object.values(GIFTS2)) { const d = DECORATIONS.find((x) => x.id === id)!; const e = partsExtent(d); expect(d.parts.length).toBeGreaterThan(2); expect(e.hx).toBeLessThan(0.6); expect(e.top).toBeLessThan(2.4); expect(e.low).toBeGreaterThanOrEqual(-0.001); }
  });
});

describe("runClaimGift2 and gift2Strip", () => {
  const n = gift2Npc("binder")!;
  it("sends only the neighbour id", async () => {
    let args: unknown; await runClaimGift2(async (a) => { args = a; return { data: claimed("binder", true), error: null }; }, "binder");
    expect(args).toEqual({ p_npc: "binder" });
  });
  it("maps waiting, new, repeat", async () => {
    const w = await runClaimGift2(reply([{ npc: "binder", decoration: null, is_new: false, state: "waiting" }]), "binder");
    expect(w).toEqual({ ok: true, state: "waiting" });
    expect(gift2Strip(n, w)).toEqual({ name: n.name, text: "Come back another day.", icons: n.gift2!.waitingIcons });
    const a = await runClaimGift2(reply(claimed("wanderer", true)), "wanderer");
    expect(a).toEqual({ ok: true, state: "claimed", npc: "wanderer", decoration: "pressed-leaf-frame", isNew: true });
    expect(gift2Strip(gift2Npc("wanderer"), a)!.text).toBe(gift2Npc("wanderer")!.gift2!.line);
    const b = await runClaimGift2(reply(claimed("wanderer", false)), "wanderer");
    expect(gift2Strip(gift2Npc("wanderer"), b)!.text).toBe(gift2Npc("wanderer")!.gift2!.thanks);
  });
  it("failure grants nothing and shows no strip", async () => {
    expect(await runClaimGift2(async () => ({ data: null, error: { message: "TypeError: Failed to fetch" } }), "binder")).toEqual({ ok: false, note: GIFT_ERRORS.network });
    expect(await runClaimGift2(async () => ({ data: null, error: { message: "sign in with an account" } }), "binder")).toEqual({ ok: false, note: GIFT_ERRORS.other });
    expect(await runClaimGift2(async () => { throw new Error("offline"); }, "binder")).toEqual({ ok: false, note: GIFT_ERRORS.network });
    expect(gift2Strip(n, { ok: false, note: "x" })).toBeNull(); expect(gift2Strip(null, { ok: true, state: "waiting" })).toBeNull();
  });
  it("an odd answer grants nothing", async () => {
    for (const d of [null, [], {}, claimed("proofreader", true), [{ npc: "binder", decoration: "nope", is_new: true, state: "claimed" }], [{ npc: "binder", decoration: "page-stack", is_new: true }], [{ npc: "binder", decoration: "page-stack", state: "claimed" }]])
      expect(await runClaimGift2(reply(d), "binder")).toMatchObject({ ok: false });
  });
});

describe("unlock order lives on the server", () => {
  it("the chain is binder, proofreader, wanderer in the migration; the client has no clock or order logic", () => {
    expect(mig).toMatch(/when 'proofreader' then 'binder'/); expect(mig).toMatch(/when 'wanderer' then 'proofreader'/);
    expect(src("../lib/gifts.ts")).not.toMatch(/supabase|\.rpc\(|fetch\(|localStorage|Date\.now|new Date|performance|three/);
  });
});

describe("wiring", () => {
  it("one claim_npc_gift2 call, only through runClaimGift2, never in stub mode, never granted locally", () => {
    const page = src("../app/page.tsx");
    expect((page.match(/"claim_npc_gift2"/g) ?? []).length).toBe(1);
    expect(page).toContain("runClaimGift2(");
    expect(page).toMatch(/line\.g \|\| !userId \|\| stubDecor/);
    expect(page).not.toMatch(/p_decoration: *["'](page-stack|reading|pressed)/);
    expect(src("../components/World.tsx")).not.toMatch(/claim_npc_gift2|supabase/);
  });
});

describe("gift2 effect does not loop on a failed claim", () => {
  const page = src("../app/page.tsx");
  const effect = page.slice(page.indexOf("const gift2Tried"), page.indexOf("const signOut"));
  it("a failed claim leaves the neighbour marked as tried (only a new sign-in clears it)", () => {
    const fail = effect.slice(effect.indexOf("if (!out.ok)"), effect.indexOf("const s = gift2Strip"));
    expect(fail).toContain("setNpcLine");
    expect(fail).not.toMatch(/gift2Tried\.current\[[^\]]+\]\s*=\s*false/);
  });
  it("the tried map is cleared only when the signed-in user changes", () => {
    expect(effect).toMatch(/useEffect\(\(\) => \{ gift2Tried\.current = \{\}; \}, \[userId\]\)/);
    expect((effect.match(/gift2Tried\.current\[[^\]]+\]\s*=\s*false/g) ?? []).length).toBe(1); // only the "no first gift yet" read, which sets no state
  });
});
