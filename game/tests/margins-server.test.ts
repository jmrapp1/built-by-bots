import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARGINS_ERRORS, QUIET, classifyError, foodOf, isLocalPreview, mapClaim, openedFromClaims, outcomeFrom } from "@/lib/margins-server";
import { marginsOverrides } from "@/lib/margins";

const day = "2026-10-21";
describe("mapping the server's answer", () => {
  it("reads each kind and keeps the day", () => {
    for (const k of ["ink", "glyph", "scrap", "egg"]) expect(mapClaim({ spot: 3, result: k, day })).toEqual({ spot: 3, kind: k, day });
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
    expect(page).toMatch(/rpc\("margins_unfold", \{ p_spot: spot \}\)/);
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
