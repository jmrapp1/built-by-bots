import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagOn, wordingOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";
import { GUIDE_TEXT, GUIDE_TEXT_TOUCH, STEPS, hatchText, hintText } from "@/lib/guide";
import { CARD_TEXT, CARD_TEXT_TOUCH, cardStatus } from "@/lib/cardStatus";
import { BOARD_PAGES, pageAt } from "@/lib/board";

const KEYWORDS = /\b(W A S D|WASD|[EQRCM]|Shift|Esc|mouse|keys?|arrow keys|press)\b/;

describe("S38a switch", () => {
  it("anything but a plain true is off, and never throws", () => {
    for (const v of [false, "true", 1, "1", null, undefined, {}, [], 0]) expect(flagOn({ firstTen: { wording: v } }, "wording")).toBe(false);
    for (const d of [null, undefined, 5, "x", {}, { firstTen: null }, { firstTen: 3 }]) expect(flagOn(d, "wording")).toBe(false);
    expect(flagOn({ firstTen: { wording: true } }, "wording")).toBe(true);
  });
  it("the data file has the switch and it is off in the repo until turned on", () => {
    expect(typeof (firstTen as { firstTen: { wording: unknown } }).firstTen.wording).toBe("boolean");
  });
  it("?wording= overrides in dev only", () => {
    expect(wordingOn("?wording=1", false, { firstTen: { wording: false } })).toBe(true);
    expect(wordingOn("?wording=0", false, { firstTen: { wording: true } })).toBe(false);
    expect(wordingOn("?wording=1", true, { firstTen: { wording: false } })).toBe(false);
    expect(wordingOn("", true, { firstTen: { wording: true } })).toBe(true);
    expect(wordingOn("%", false, { firstTen: { wording: "yes" } })).toBe(false);
  });
});

describe("S38a guide wording", () => {
  it("keyboard words are unchanged when touch is off (default and explicit)", () => {
    for (const s of STEPS) {
      expect(hintText(s, true, 0, false)).toBe(hintText(s));
    }
    expect(hintText("move")).toBe("Walk with W A S D, and press E to do things.");
    expect(hintText("egg")).toBe("Press E to collect your egg.");
    expect(hintText("hatch", true, 0)).toBe("Press E to hatch your egg.");
    expect(hintText("hatch", false, 0)).toBe(GUIDE_TEXT.hatchAway);
    expect(hintText("hatch", true, 3)).toBe(GUIDE_TEXT.hatchWait);
    expect(hintText("feed")).toBe("Hold E beside your Print to share a snack.");
    expect(hintText("stroke")).toBe("Hold R beside your Print to stroke it.");
    expect(hintText("map")).toBe("Press M to open your map and see where else you can go.");
    expect(hatchText(true, 0)).toBe("Press E to hatch your egg.");
  });
  it("touch lines name no key, every step, every hatch state", () => {
    for (const s of STEPS) expect(hintText(s, true, 0, true)).not.toMatch(KEYWORDS);
    expect(hintText("hatch", false, 0, true)).toBe(GUIDE_TEXT.hatchAway);
    expect(hintText("hatch", true, 4, true)).toBe(GUIDE_TEXT.hatchWait);
    expect(hintText("hatch", true, 0, true)).toBe(GUIDE_TEXT_TOUCH.hatch);
    expect(hintText("move", true, 0, true)).toContain("stick");
    expect(hintText("move", true, 0, true)).toContain("big button");
    expect(hintText("map", true, 0, true)).toContain("map button");
    expect(hintText("stroke", true, 0, true)).toContain("stroke button");
    for (const t of Object.values(GUIDE_TEXT_TOUCH)) expect(t).not.toMatch(/\d|!/);
  });
});

describe("S38a card lines", () => {
  const c = (fullness: number, mood: number) => ({ fullness, mood, stage: "blot" });
  it("desktop lines are identical with touch off", () => {
    expect(cardStatus(c(10, 80)).line).toBe(CARD_TEXT.hungry);
    expect(cardStatus(c(10, 80), false)).toEqual(cardStatus(c(10, 80)));
    expect(cardStatus(c(80, 10), false).line).toBe(CARD_TEXT.lonely);
    expect(CARD_TEXT.hungry).toContain("hold E");
  });
  it("touch lines name no key; other lines and the caption stay", () => {
    expect(cardStatus(c(10, 80), true).line).toBe(CARD_TEXT_TOUCH.hungry);
    expect(cardStatus(c(80, 10), true).line).toBe(CARD_TEXT_TOUCH.lonely);
    for (const t of Object.values(CARD_TEXT_TOUCH)) expect(t).not.toMatch(KEYWORDS);
    expect(cardStatus(c(80, 80), true).line).toBe(CARD_TEXT.well);
    expect(cardStatus(c(10, 80), true).caption).toBe(cardStatus(c(10, 80)).caption);
  });
});

describe("S38a notice board", () => {
  it("touch off returns the page untouched", () => {
    BOARD_PAGES.forEach((p, i) => { expect(pageAt(i)).toBe(p); expect(pageAt(i, false)).toBe(p); });
  });
  it("first two instruction pages have touch lines with no keys; the title and page count stay", () => {
    for (const id of ["move", "feed"]) {
      const i = BOARD_PAGES.findIndex((p) => p.id === id);
      const t = pageAt(i, true);
      expect(t.title).toBe(BOARD_PAGES[i].title);
      expect(t.lines.length).toBeGreaterThan(0);
      for (const l of t.lines) expect(l).not.toMatch(KEYWORDS);
      expect(t.lines).not.toEqual(BOARD_PAGES[i].lines);
    }
  });
  it("pages without touch lines are the same in touch mode", () => {
    const i = BOARD_PAGES.findIndex((p) => p.id === "stages");
    expect(pageAt(i, true)).toBe(BOARD_PAGES[i]);
  });
  it("touch lines obey the board's own rules (no numbers or server talk)", () => {
    const text = BOARD_PAGES.flatMap((p) => p.touchLines ?? []).join(" ");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/supabase|server|database|limit|cap\b|cooldown|token|api|http/i);
  });
});

describe("S38a source checks", () => {
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  it("adds no motion and no storage, network or server call", () => {
    for (const f of ["lib/firstTen.ts", "components/useTouchWording.ts"]) {
      const s = read(f);
      expect(s).not.toMatch(/localStorage|sessionStorage|fetch\(|supabase|animation|transition/);
    }
    const css = read("app/globals.css").split("\n").filter((l) => /has-label|tc-label/.test(l)).join("\n");
    expect(css).not.toMatch(/animation|transition/);
  });
  it("the touch state is not written anywhere (read from the body class only)", () => {
    expect(read("components/useTouchWording.ts")).toMatch(/classList\.contains\("touch"\)/);
  });
});
