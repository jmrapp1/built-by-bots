import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOOK, bookEntries, bookKeyAction, canOpenBook, chooseIndex, moveHighlight, startIndex, trapTab, type BookGate } from "@/lib/printBook";
import { COSMETICS } from "@/lib/cosmetics";

const open: BookGate = { typing: false, travelling: false, mapOpen: false, menuOpen: false, panelOpen: false, signedIn: true };
const key = (code: string, extra = {}) => ({ code, repeat: false, target: null, ...extra });
const pr = (id: string, mood = 80) => ({ id, species: "blotling", mood, stage: "blot", care: 0, age_seconds: 0 });

describe("printBook entries", () => {
  it("lists every owned Print in order, one entry each", () => {
    const e = bookEntries([pr("a"), pr("b"), pr("c")]);
    expect(e.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(e.map((x) => x.index)).toEqual([0, 1, 2]);
  });
  it("a single Print is one entry; none is empty", () => {
    expect(bookEntries([pr("a")])).toHaveLength(1);
    expect(bookEntries([])).toEqual([]);
  });
  it("shows mood face, stage, species and the worn keepsake name", () => {
    const k = COSMETICS[0];
    const [a, b] = bookEntries([{ ...pr("a", 90), worn_cosmetic: k.id }, pr("b", 10)]);
    expect(a.face).toBe("happy"); expect(b.face).toBe("sleepy");
    expect(a.worn).toBe(k.name); expect(b.worn).toBeNull();
    expect(a.stage).toBe("Blot"); expect(a.species.length).toBeGreaterThan(0);
  });
  it("unknown keepsake, species and stage fall back without throwing", () => {
    const [e] = bookEntries([{ id: "x", species: "nope", mood: 50, stage: "nope", worn_cosmetic: "nope" }]);
    expect(e.worn).toBeNull(); expect(e.progress).toBeGreaterThanOrEqual(0); expect(e.progress).toBeLessThanOrEqual(1);
  });
});

describe("printBook selection", () => {
  it("opens on the picked Print, or the newest when none is picked", () => {
    expect(startIndex(4, 1)).toBe(1);
    expect(startIndex(4, null)).toBe(3);
    expect(startIndex(4, 99)).toBe(3);
  });
  it("arrows move over the grid and stop at the edges", () => {
    const c = BOOK.columns;
    expect(moveHighlight(7, 0, "ArrowRight")).toBe(1);
    expect(moveHighlight(7, 0, "ArrowLeft")).toBe(0);
    expect(moveHighlight(7, 0, "ArrowDown")).toBe(c);
    expect(moveHighlight(7, 6, "ArrowDown")).toBe(6);
    expect(moveHighlight(7, 6, "ArrowRight")).toBe(6);
    expect(moveHighlight(7, 4, "ArrowUp")).toBe(4 - c);
    expect(moveHighlight(7, 3, "Home")).toBe(0);
    expect(moveHighlight(7, 3, "End")).toBe(6);
    expect(moveHighlight(7, 3, "KeyX")).toBe(3);
    expect(moveHighlight(1, 0, "ArrowDown")).toBe(0);
    expect(moveHighlight(0, 0, "ArrowDown")).toBe(0);
  });
  it("choosing sets the picked index within range", () => {
    expect(chooseIndex(3, 2)).toBe(2);
    expect(chooseIndex(3, 9)).toBe(2);
    expect(chooseIndex(3, -1)).toBe(0);
    expect(chooseIndex(0, 1)).toBe(0);
  });
  it("tab wraps inside the book", () => {
    expect(trapTab(4, 3, false)).toBe(0);
    expect(trapTab(4, 0, true)).toBe(3);
    expect(trapTab(4, 1, false)).toBe(2);
  });
});

describe("printBook key", () => {
  it("is data, and is not one of the keys already in use", () => {
    const used = ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ", "KeyR", "KeyC", "KeyM", "KeyF", "Escape"];
    expect(BOOK.key).toBe("KeyB");
    expect(used).not.toContain(BOOK.key);
  });
  it("opens when nothing else is up, including with one Print", () => {
    expect(bookKeyAction(key("KeyB"), false, open)).toBe("toggle");
  });
  it("is ignored while typing, travelling, or the map, menu or another panel is up", () => {
    expect(bookKeyAction(key("KeyB", { target: { tagName: "INPUT" } }), false, open)).toBeNull();
    for (const k of ["travelling", "mapOpen", "menuOpen", "panelOpen"] as const) expect(bookKeyAction(key("KeyB"), false, { ...open, [k]: true })).toBeNull();
    expect(bookKeyAction(key("KeyB"), false, { ...open, signedIn: false })).toBeNull();
    expect(canOpenBook(open)).toBe(true);
  });
  it("ignores held-down repeats and other keys", () => {
    expect(bookKeyAction(key("KeyB", { repeat: true }), false, open)).toBeNull();
    expect(bookKeyAction(key("KeyX"), false, open)).toBeNull();
  });
  it("pressing it again or Esc closes; Esc does nothing when closed", () => {
    expect(bookKeyAction(key("KeyB"), true, open)).toBe("toggle");
    expect(bookKeyAction(key("Escape"), true, open)).toBe("close");
    expect(bookKeyAction(key("Escape"), false, open)).toBeNull();
  });
  it("uses no Math.random and no network", () => {
    const src = readFileSync("lib/printBook.ts", "utf8");
    expect(src).not.toMatch(/Math\.random|fetch\(|supabase/);
  });
});
