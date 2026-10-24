import { describe, expect, it } from "vitest";
import { flagOn, snackHintOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";
import garden from "@/data/garden.json";
import { GUIDE_TEXT, currentHint, hintText, snackPointerOn, type Ctx } from "@/lib/guide";

const base: Ctx = { ready: true, inGarden: true, nearEgg: false, eggPending: false, printNear: false, hasSnack: false, hasCreature: true, dismissed: [] };
const done = ["move", "egg", "hatch"] as const;

describe("S38b switch", () => {
  it("ships on; anything but a plain true is off", () => {
    expect((firstTen as { firstTen: { snackHint: unknown } }).firstTen.snackHint).toBe(true);
    for (const v of ["true", 1, null, undefined, {}]) expect(flagOn({ firstTen: { snackHint: v } }, "snackHint")).toBe(false);
    expect(flagOn({ firstTen: { snackHint: true } }, "snackHint")).toBe(true);
  });
  it("?snackhint= overrides in dev only", () => {
    expect(snackHintOn("?snackhint=1", false, { firstTen: { snackHint: false } })).toBe(true);
    expect(snackHintOn("?snackhint=0", false, { firstTen: { snackHint: true } })).toBe(false);
    expect(snackHintOn("?snackhint=1", true, { firstTen: { snackHint: false } })).toBe(false);
  });
  it("the inkwell exists in the garden", () => { expect((garden as { places: { id: string }[] }).places.some((x) => x.id === "inkwell")).toBe(true); });
});

describe("S38b snack hint", () => {
  it("off: no hint, today's behaviour", () => {
    expect(currentHint(done, base)).toBeNull();
    expect(currentHint(done, { ...base, snackHint: false })).toBeNull();
  });
  it("on: shown with a Print and no snack, before feeding", () => {
    expect(currentHint(done, { ...base, snackHint: true })).toBe("snack");
  });
  it("on: not shown with a snack, after a feed, without a Print, or when dismissed", () => {
    const on = { ...base, snackHint: true };
    expect(currentHint(done, { ...on, hasSnack: true })).toBeNull();
    expect(currentHint(done, { ...on, fedThisSession: true })).toBeNull();
    expect(currentHint(done, { ...on, hasCreature: false })).toBeNull();
    expect(currentHint(done, { ...on, dismissed: ["snack"] })).toBeNull();
    expect(currentHint([...done, "feed"], on)).toBeNull();
    expect(currentHint(done, { ...on, ready: false })).toBeNull();
  });
  it("feed hint still wins with a snack and a Print near", () => {
    expect(currentHint(done, { ...base, snackHint: true, hasSnack: true, printNear: true })).toBe("feed");
  });
  it("arrow only for the snack hint and away from the inkwell", () => {
    const well = { x: 8, z: -6 };
    expect(snackPointerOn("snack", { x: 0, z: 0 }, well)).toBe(true);
    expect(snackPointerOn("snack", { x: 7, z: -5 }, well)).toBe(false);
    expect(snackPointerOn("feed", { x: 0, z: 0 }, well)).toBe(false);
    expect(snackPointerOn("snack", null, well)).toBe(false);
  });
  it("wording is the same for keys and touch", () => {
    expect(hintText("snack")).toBe(GUIDE_TEXT.snack);
    expect(hintText("snack", true, 0, true)).toBe(GUIDE_TEXT.snack);
    expect(GUIDE_TEXT.snack).not.toMatch(/\b(press|key)\b/i);
  });
});
