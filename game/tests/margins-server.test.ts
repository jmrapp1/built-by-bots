import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUND_EGG, MARGINS_ERRORS, QUIET, classifyError, foodOf, isLocalPreview, mapClaim, openedFromClaims, outcomeFrom } from "@/lib/margins-server";
import { marginsOverrides } from "@/lib/margins";

const day = "2026-10-21";
describe("mapping the server's answer", () => {
  it("reads each kind and keeps the day", () => {
    for (const k of ["ink", "glyph", "scrap", "egg"]) expect(mapClaim({ spot: 3, result: k, day })).toEqual({ spot: 3, kind: k, day, at: null });
  });
  it("rejects anything that is not a real answer", () => {
    for (const bad of [null, undefined, 5, "x", {}, { spot: "3", result: "ink" }, { spot: 1.5, result: "ink" }, { spot: 1, result: "leaflet" }, { spot: 1, result: "" }]) expect(mapClaim(bad)).toBeNull();
  });
  it("turns an answer into a find, never choosing one itself", () => {
    expect(outcomeFrom({ spot: 4, result: "scrap", day }, null, 4, day, false)).toEqual({ ok: true, kind: "scrap", spot: 4, duplicate: false });
    expect(outcomeFrom([{ spot: 4, result: "egg", day }], null, 4, day, false)).toMatchObject({ ok: true, kind: "egg" });
  });
  it("a duplicate claim shows the first answer and is flagged, not rerolled", () => {
    const o = outcomeFrom({ spot: 2, result: "glyph", day }, null, 2, day, true);
    expect(o).toEqual({ ok: true, kind: "glyph", spot: 2, duplicate: true });
  });
  it("an answer for another page or another day is not applied", () => {
    expect(outcomeFrom({ spot: 5, result: "ink", day }, null, 4, day, false)).toEqual({ ok: false, reason: "other" });
    expect(outcomeFrom({ spot: 4, result: "ink", day: "2026-10-22" }, null, 4, day, false)).toEqual({ ok: false, reason: "wrong-day" });
    expect(outcomeFrom(null, null, 4, day, false)).toEqual({ ok: false, reason: "other" });
  });
});

describe("failures are quiet and have no numbers", () => {
  const server = { ceiling: "enough pages for today", out: "not signed in", anon: "sign in with an account", starter: "collect your starter egg first", page: "no such page", net: "TypeError: Failed to fetch", weird: "boom" };
  it("classifies the server's refusals", () => {
    expect(classifyError(server.ceiling)).toBe("ceiling");
    expect(classifyError(server.out)).toBe("signed-out");
    expect(classifyError(server.anon)).toBe("signed-out");
    expect(classifyError("JWT expired")).toBe("signed-out");
    expect(classifyError(server.starter)).toBe("starter");
    expect(classifyError(server.page)).toBe("bad-page");
    expect(classifyError(server.net)).toBe("network");
    expect(classifyError(server.weird)).toBe("other");
    expect(classifyError(undefined)).toBe("other");
  });
  it("every failure becomes a failed outcome with a plain message", () => {
    for (const m of Object.values(server)) {
      const o = outcomeFrom(null, { message: m }, 1, day, false);
      expect(o.ok).toBe(false);
      if (!o.ok) { expect(MARGINS_ERRORS[o.reason]).toBeTruthy(); }
    }
  });
  it("the ceiling says nothing about numbers and never names the server's words", () => {
    expect(QUIET).toBe("The pages are quiet for now.");
    for (const m of Object.values(MARGINS_ERRORS)) { expect(m).not.toMatch(/\d/); expect(m).not.toMatch(/ceiling|limit|cap|enough pages|today/i); }
  });
});

describe("opened pages come from the server", () => {
  it("reads today's rows only and skips bad ones", () => {
    const rows = [{ spot: 0, result: "ink", day }, { spot: 5, result: "egg", day }, { spot: 7, result: "scrap", day: "2026-10-20" }, { spot: "x" }, null];
    expect([...openedFromClaims(rows, day)].sort()).toEqual([0, 5]);
    expect(openedFromClaims(null, day).size).toBe(0);
    expect(openedFromClaims("nope", day).size).toBe(0);
  });
  it("food maps to pouch kinds, scraps and eggs do not", () => {
    expect(foodOf("ink")).toBe("ink");
    expect(foodOf("glyph")).toBe("glyph");
    expect(foodOf("scrap")).toBeNull();
    expect(foodOf("egg")).toBeNull();
  });
});

describe("dev previews never write real claims", () => {
  it("?day, ?finds=all and ?unfold skip the server; ?area and ?gate do not", () => {
    expect(isLocalPreview(marginsOverrides("?day=2026-10-21", false))).toBe(true);
    expect(isLocalPreview(marginsOverrides("?finds=all", false))).toBe(true);
    expect(isLocalPreview(marginsOverrides("?unfold=1", false))).toBe(true);
    expect(isLocalPreview(marginsOverrides("?area=margins", false))).toBe(false);
    expect(isLocalPreview(marginsOverrides("?gate=1", false))).toBe(false);
    expect(isLocalPreview(marginsOverrides("?unfold=1&day=2026-10-21", true))).toBe(false); // production: all off, so the server is used
  });
});

describe("the only server calls", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  it("pins the rpc list: margins_unfold is the one new call", () => {
    const calls = [...page.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(calls).toEqual(["claim_daily_egg", "claim_starter_egg", "feed_creature", "grow_creature", "hatch_egg", "margins_unfold"]);
  });
  it("margins_unfold is sent the page number and nothing else", () => {
    expect(page).toMatch(/rpc\("margins_unfold", \{ p_spot: n \}\)/);
  });
  it("reads margins_claims once, for the player's own rows", () => {
    expect([...page.matchAll(/from\("margins_claims"\)/g)].length).toBe(1);
  });
  it("the world and the lib stay free of the network", () => {
    for (const f of ["../components/World.tsx", "../lib/margins-server.ts", "../components/marginsScene.ts"]) {
      expect(readFileSync(new URL(f, import.meta.url), "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/supabase|\.rpc\(|fetch\(/);
    }
  });
});

import { ALREADY_OPEN, REPEAT_MS, afterClaimsRead, runUnfold, settleUnfold } from "@/lib/margins-server";

describe("day rollover (the real call path)", () => {
  const row = (spot: number, d: string, result = "ink", at = "2026-10-21T00:00:05Z") => ({ owner: "x", day: d, spot, result, egg_id: null, claimed_at: at });
  it("an answer for a newer day than the pages on screen is refused, nothing granted", async () => {
    // The pages were laid out for the 21st; the server's clock has moved on to the 22nd by the time the call lands.
    const o = await runUnfold(async () => ({ data: row(3, "2026-10-22"), error: null }), 3, "2026-10-21", () => Date.parse("2026-10-22T00:00:05Z"));
    expect(o).toEqual({ ok: false, reason: "wrong-day" });
    expect(settleUnfold(o, true)).toMatchObject({ open: false, food: null, scrap: false, egg: false, note: MARGINS_ERRORS["wrong-day"] });
  });
  it("the same day opens normally and rpc is called with the page only", async () => {
    const seen: unknown[] = [];
    const o = await runUnfold(async (n) => { seen.push(n); return { data: row(3, "2026-10-21"), error: null }; }, 3, "2026-10-21", () => Date.parse("2026-10-21T00:00:06Z"));
    expect(seen).toEqual([3]);
    expect(o).toEqual({ ok: true, kind: "ink", spot: 3, duplicate: false });
  });
  it("a thrown network error is a soft failure", async () => {
    const o = await runUnfold(async () => { throw new Error("offline"); }, 3, "2026-10-21");
    expect(o).toEqual({ ok: false, reason: "network" });
  });
  it("page.tsx passes the layout day, not the clock", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(page).toMatch(/runUnfold\(async \(n\) => supabase\(\)\.rpc\("margins_unfold", \{ p_spot: n \}\), spot, layoutDay\)/);
    expect(page.slice(page.indexOf("const unfoldPage"), page.indexOf("const loadOpened"))).not.toMatch(/new Date|utcDay/);
  });
});

describe("a repeat claim grants nothing", () => {
  const old = "2026-10-21T10:00:00Z";
  it("an answer older than the request is a repeat (reload or second tab): shown open, no food, no scrap, no egg", async () => {
    for (const result of ["ink", "glyph", "scrap", "egg"]) {
      const o = await runUnfold(async () => ({ data: { spot: 1, day: "2026-10-21", result, claimed_at: old }, error: null }), 1, "2026-10-21", () => Date.parse(old) + REPEAT_MS + 1000);
      expect(o).toMatchObject({ ok: true, duplicate: true });
      expect(settleUnfold(o, true)).toEqual({ open: true, animate: false, kind: result, food: null, scrap: false, egg: false, note: ALREADY_OPEN, ceiling: false });
    }
  });
  it("a fresh claim is granted once", async () => {
    const o = await runUnfold(async () => ({ data: { spot: 1, day: "2026-10-21", result: "glyph", claimed_at: old }, error: null }), 1, "2026-10-21", () => Date.parse(old) + 1000);
    expect(o).toMatchObject({ ok: true, duplicate: false });
    expect(settleUnfold(o, true)).toMatchObject({ animate: true, food: "glyph" });
  });
  it("a page already known to be open is a repeat whatever the timestamp says", () => {
    expect(outcomeFrom({ spot: 1, result: "ink", day, claimed_at: new Date().toISOString() }, null, 1, day, true)).toMatchObject({ duplicate: true });
  });
});

describe("a failed claims read", () => {
  it("keeps the ring from running, says so plainly, and does not claim anything is open", () => {
    const r = afterClaimsRead(null);
    expect(r).toEqual({ ready: false, opened: [], note: MARGINS_ERRORS.network });
    expect(r.note).toMatch(/stays folded/);
    expect(r.note).not.toMatch(/\d/);
  });
  it("a good read opens the ring and restores the pages", () => {
    expect(afterClaimsRead([0, 4])).toEqual({ ready: true, opened: [0, 4], note: null });
    expect(afterClaimsRead([])).toEqual({ ready: true, opened: [], note: null });
  });
  it("the world retries the read on every entry and gates the ring on it", () => {
    const w = readFileSync(new URL("../components/World.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(w).toMatch(/serverReady = local;/); // reset on each entry, so a failed read is retried quietly next time
    expect(w).toMatch(/!uBlocked && serverReady/);
    expect(w).toMatch(/serverReady = r\.ready/);
  });
});

describe("a late answer is not lost", () => {
  it("chosen: apply the find when it arrives, even after leaving the Margins (no animation)", () => {
    const o = { ok: true as const, kind: "glyph" as const, spot: 2, duplicate: false };
    expect(settleUnfold(o, false)).toEqual({ open: true, animate: false, kind: "glyph", food: "glyph", scrap: false, egg: false, note: null, ceiling: false });
    expect(settleUnfold({ ...o, kind: "scrap" }, false)).toMatchObject({ scrap: true, food: null, open: true });
    expect(settleUnfold({ ...o, kind: "egg" }, false)).toMatchObject({ egg: true, open: true });
    expect(settleUnfold({ ...o, kind: "egg" }, true).note).toBe(FOUND_EGG);
  });
  it("a late duplicate or refusal grants nothing and says nothing", () => {
    expect(settleUnfold({ ok: true, kind: "ink", spot: 2, duplicate: true }, false)).toMatchObject({ food: null, scrap: false, egg: false, note: null, open: true });
    expect(settleUnfold({ ok: false, reason: "network" }, false)).toMatchObject({ open: false, food: null, note: null });
    expect(settleUnfold({ ok: false, reason: "ceiling" }, true)).toMatchObject({ open: false, ceiling: true, note: QUIET });
  });
  it("the world no longer drops an answer that lands after leaving", () => {
    const w = readFileSync(new URL("../components/World.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(w).toMatch(/settleUnfold\(o, here\)/);
    expect(w).toMatch(/if \(!here\) \{/);
    expect(w).not.toMatch(/if \(myVisit !== visit \|\| !inMargins\) return;\s*uPending = false;/);
  });
});
