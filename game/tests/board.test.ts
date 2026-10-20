import { describe, expect, it } from "vitest";
import { BOARD_PAGES, nextPage, pageAt, pageLabel, prevPage } from "@/lib/board";
import { ripple } from "@/lib/ripple";
import board from "@/data/board.json";

describe("notice board", () => {
  it("has welcome, movement, feeding and all four stages", () => {
    const text = JSON.stringify(board).toLowerCase();
    for (const w of ["welcome", "w a s d", "press e", "blot", "sprout", "full form", "elder"]) expect(text).toContain(w);
  });
  it("shows no numbers, limits or server talk", () => {
    const text = BOARD_PAGES.flatMap((p) => [p.title, ...p.lines]).join(" ");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/supabase|server|database|limit|cap\b|cooldown|token|api|http/i);
  });
  it("pages never run off the ends", () => {
    expect(pageAt(-5)).toBe(BOARD_PAGES[0]);
    expect(pageAt(999)).toBe(BOARD_PAGES[BOARD_PAGES.length - 1]);
    expect(pageAt(NaN)).toBe(BOARD_PAGES[0]);
    expect(prevPage(0)).toBe(0);
    expect(nextPage(BOARD_PAGES.length - 1)).toBe(BOARD_PAGES.length - 1);
    expect(nextPage(0)).toBe(1);
    expect(pageLabel(0)).toBe(`1 of ${BOARD_PAGES.length}`);
  });
});

describe("ripple", () => {
  it("grows and fades inside bounds", () => {
    for (let p = 0; p <= 2; p += 0.05) {
      const r = ripple(p, 0.3, false);
      expect(r.scale).toBeGreaterThan(0);
      expect(r.scale).toBeLessThanOrEqual(1);
      expect(r.opacity).toBeGreaterThanOrEqual(0);
      expect(r.opacity).toBeLessThanOrEqual(0.35);
    }
  });
  it("is still for reduced motion", () => {
    expect(ripple(0, 0.5, true)).toEqual(ripple(0.8, 0.5, true));
  });
});
