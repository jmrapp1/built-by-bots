// Decor S4: the server mapping for Home decorations. Pure functions; the calls are passed in.
import { describe, expect, it } from "vitest";
import { DECOR_ERRORS, loadHomeDecor, ownedFromDecorRows, placedFromRows, runPlace, settlePlaced } from "@/lib/decor-server";
import { decorChoicesFor, decorStrip } from "@/lib/decor";

const ok = (data: unknown) => async () => ({ data, error: null });
const bad = (message: string) => async () => ({ data: null, error: { message } });

describe("rows", () => {
  it("owned: valid ids only, no repeats", () => {
    expect(ownedFromDecorRows([{ decoration: "bench" }, { decoration: "bench" }, { decoration: "nope" }, null, {}])).toEqual(["bench"]);
    expect(ownedFromDecorRows(null)).toEqual([]);
  });
  it("placed: known plot and piece only", () => {
    expect(placedFromRows([{ plot: "north-mid", decoration: "bench" }, { plot: "x", decoration: "bench" }, { plot: "north-left", decoration: "x" }])).toEqual({ "north-mid": "bench" });
    expect(placedFromRows(undefined)).toEqual({});
  });
});
describe("loadHomeDecor", () => {
  it("claims once, then reads both", async () => {
    let claims = 0;
    const r = await loadHomeDecor(async () => { claims++; return { data: [], error: null }; }, ok([{ decoration: "bench" }]), ok([{ plot: "north-mid", decoration: "bench" }]));
    expect(claims).toBe(1); expect(r).toEqual({ owned: ["bench"], placed: { "north-mid": "bench" } });
  });
  it("a failed read, or a thrown call, gives null (quiet)", async () => {
    expect(await loadHomeDecor(ok([]), bad("x"), ok([]))).toBeNull();
    expect(await loadHomeDecor(ok([]), ok([]), bad("x"))).toBeNull();
    expect(await loadHomeDecor(async () => { throw new Error("offline"); }, ok([]), ok([]))).toBeNull();
  });
  it("a failed claim alone does not hide what the server holds", async () => {
    expect(await loadHomeDecor(bad("x"), ok([{ decoration: "bench" }]), ok([]))).toEqual({ owned: ["bench"], placed: {} });
  });
});
describe("runPlace", () => {
  it("confirms only a matching answer", async () => {
    expect(await runPlace(ok([{ plot: "north-mid", decoration: "bench" }]), "north-mid", "bench")).toEqual({ ok: true, plot: "north-mid", decoration: "bench" });
    expect(await runPlace(ok([{ plot: "north-mid", decoration: null }]), "north-mid", null)).toEqual({ ok: true, plot: "north-mid", decoration: null });
    expect(await runPlace(ok([{ plot: "north-mid", decoration: "books" }]), "north-mid", "bench")).toMatchObject({ ok: false });
    expect(await runPlace(ok([]), "north-mid", "bench")).toMatchObject({ ok: false });
  });
  it("errors give a plain line, never the server's words", async () => {
    const a = await runPlace(bad("you do not have that decoration"), "north-mid", "bench");
    expect(a).toEqual({ ok: false, note: DECOR_ERRORS.other });
    expect(await runPlace(bad("Failed to fetch"), "north-mid", "bench")).toEqual({ ok: false, note: DECOR_ERRORS.network });
    expect(await runPlace(async () => { throw new Error("x"); }, "north-mid", "bench")).toMatchObject({ ok: false });
  });
  it("a failed place leaves the room as it was; a success updates a copy", () => {
    const p = { "north-mid": "bench" };
    expect(settlePlaced(p, { ok: false, note: "x" })).toBe(p);
    expect(settlePlaced(p, { ok: true, plot: "north-left", decoration: "books" })).toEqual({ "north-mid": "bench", "north-left": "books" });
    expect(settlePlaced(p, { ok: true, plot: "north-mid", decoration: null })).toEqual({});
    expect(p).toEqual({ "north-mid": "bench" });
  });
});
describe("owned-only strip", () => {
  it("lists only owned pieces that fit; stub mode (no owned list) lists all", () => {
    expect(decorChoicesFor("north-mid", {}, ["bench", "framed-page"]).map((c) => c.id)).toEqual([null, "bench"]);
    expect(decorChoicesFor("north-mid", {}).length).toBe(10);
    expect(decorStrip("north-mid", {}, []).emptyText).toBeTruthy();
    expect(decorStrip("north-mid", {}, ["bench"]).emptyText).toBeNull();
  });
});
