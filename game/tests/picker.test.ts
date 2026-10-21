// Slice 6e-2: the keepsake picker client. Pure logic plus pins on the wiring.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PICKER_ERRORS, STUB_OWNED, WEAR_NOTHING, canPick, choicesFor, ownedFromRows, pickerPreview, runPick, settlePick } from "@/lib/picker";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const ok = (worn: string | null) => async () => ({ data: [{ worn_cosmetic: worn }], error: null });

describe("what is listed", () => {
  it("wear nothing first, then owned keepsakes in the data order, with the worn one marked", () => {
    const c = choicesFor(["scarf", "ribbon"], "scarf");
    expect(c.map((x) => x.id)).toEqual([null, "ribbon", "scarf"]);
    expect(c[0].label).toBe(WEAR_NOTHING);
    expect(c.filter((x) => x.current).map((x) => x.id)).toEqual(["scarf"]);
  });
  it("wearing nothing marks the first choice; an unknown worn id counts as nothing", () => {
    expect(choicesFor(["ribbon"], null)[0].current).toBe(true);
    expect(choicesFor(["ribbon"], "nope")[0].current).toBe(true);
  });
  it("reads owned ids from rows, dropping unknown, repeated and malformed ones", () => {
    expect(ownedFromRows([{ cosmetic: "lantern" }, { cosmetic: "ribbon" }, { cosmetic: "ribbon" }, { cosmetic: "x" }, null, {}])).toEqual(["ribbon", "lantern"]);
    expect(ownedFromRows(null)).toEqual([]);
  });
  it("only an owned keepsake that is not already worn (or nothing) can be sent", () => {
    expect(canPick(["ribbon"], null, "ribbon")).toBe(true);
    expect(canPick(["ribbon"], "ribbon", "ribbon")).toBe(false);
    expect(canPick(["ribbon"], null, "scarf")).toBe(false);
    expect(canPick(["ribbon"], "ribbon", null)).toBe(true);
    expect(canPick(["ribbon"], null, null)).toBe(false);
  });
});

describe("making a choice", () => {
  it("sends the Print id and the keepsake, or null for nothing", async () => {
    const call = vi.fn(ok("ribbon"));
    expect(await runPick(call, "c1", "ribbon")).toEqual({ ok: true, worn: "ribbon" });
    expect(call).toHaveBeenCalledWith({ p_creature: "c1", p_cosmetic: "ribbon" });
    const none = vi.fn(ok(null));
    expect(await runPick(none, "c1", null)).toEqual({ ok: true, worn: null });
    expect(none).toHaveBeenCalledWith({ p_creature: "c1", p_cosmetic: null });
  });
  it("accepts a single-row answer too", async () => {
    expect(await runPick(async () => ({ data: { worn_cosmetic: "scarf" }, error: null }), "c1", "scarf")).toEqual({ ok: true, worn: "scarf" });
  });
});

describe("failure leaves the Print alone", () => {
  it("a server error, a mismatching answer, no answer and a thrown call all fail with one quiet line and keep the old value", async () => {
    const bad = [
      async () => ({ data: null, error: { message: "you do not have that keepsake" } }),
      ok("scarf"),
      async () => ({ data: [], error: null }),
      async () => ({ data: null, error: null }),
    ];
    for (const call of bad) {
      const o = await runPick(call, "c1", "ribbon");
      expect(o.ok).toBe(false);
      const s = settlePick(o, "lantern");
      expect(s.worn).toBe("lantern");
      expect(s.note).toBe(PICKER_ERRORS.other);
      expect(s.note).not.toMatch(/keepsake|exception|not signed/i); // the server's words are never shown
    }
    const thrown = await runPick(async () => { throw new Error("offline"); }, "c1", "ribbon");
    expect(settlePick(thrown, null)).toEqual({ worn: null, note: PICKER_ERRORS.network });
  });
  it("success clears the note and takes the stored value", () => {
    expect(settlePick({ ok: true, worn: null }, "ribbon")).toEqual({ worn: null, note: null });
  });
});

describe("pins on the wiring", () => {
  const page = src("../app/page.tsx");
  it("set_worn_cosmetic is called from exactly one place in the app, through runPick", () => {
    const files = ["../app/page.tsx", "../components/World.tsx", "../components/KeepsakePicker.tsx", "../lib/picker.ts", "../lib/margins-server.ts"];
    const hits = files.flatMap((f) => (src(f).match(/set_worn_cosmetic/g) ?? []).map(() => f));
    expect(hits).toEqual(["../app/page.tsx"]);
    expect(page.match(/set_worn_cosmetic/g)!.length).toBe(1);
    expect(page).toMatch(/runPick\(\(a\) => supabase\(\)\.rpc\("set_worn_cosmetic", a\)/);
  });
  it("the picker writes nothing else: no insert, update, upsert or delete on cosmetics, and the only new read is on opening", () => {
    expect(page).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src("../components/KeepsakePicker.tsx")).not.toMatch(/supabase|rpc\(|fetch\(/);
    expect(page.match(/owned_cosmetics/g)!.length).toBe(1);
  });
  it("the Print only changes after a confirmed answer, and the stub never calls the server", () => {
    expect(page).toMatch(/if \(out\.ok\) setCreatures/);
    expect(page).toMatch(/if \(stubPicker\) return setStubWorn\(choice\);/);
    expect(page).toMatch(/if \(stubPicker\) return setOwned\(STUB_OWNED\);/);
  });
  it("the preview is dev-only and the picker has no free text input", () => {
    expect(pickerPreview("?picker=stub", false)).toBe(true);
    expect(pickerPreview("?picker=stub", true)).toBe(false);
    expect(pickerPreview("?picker=1", false)).toBe(false);
    expect(STUB_OWNED.length).toBeGreaterThan(0);
    expect(src("../components/KeepsakePicker.tsx")).not.toMatch(/<input|<textarea/);
  });
});

describe("the card in a short window", () => {
  it("is capped to the window height and scrolls inside itself, so Close stays reachable", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const rule = css.match(/^\.picker\s*\{[^}]*\}/m)?.[0] ?? "";
    expect(rule).toMatch(/max-height:\s*calc\(100dvh - \d+px\)/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(css.match(/^\.picker\s*\{/gm)).toHaveLength(1);
    expect(css).toMatch(/^\.tray\s*\{[^}]*translate\(-50%, -50%\)/m); // still the same centred card at normal heights
  });
});
