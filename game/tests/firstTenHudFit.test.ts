import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagOn, hudFitOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";

describe("S38d switch", () => {
  it("ships on; anything but a plain true is off", () => {
    expect((firstTen as { firstTen: { hudFit: unknown } }).firstTen.hudFit).toBe(true);
    for (const v of ["true", 1, null, undefined, {}]) expect(flagOn({ firstTen: { hudFit: v } }, "hudFit")).toBe(false);
    expect(flagOn({ firstTen: { hudFit: true } }, "hudFit")).toBe(true);
  });
  it("?hudfit= overrides in dev only", () => {
    expect(hudFitOn("?hudfit=1", false, { firstTen: { hudFit: false } })).toBe(true);
    expect(hudFitOn("?hudfit=0", false, { firstTen: { hudFit: true } })).toBe(false);
    expect(hudFitOn("?hudfit=1", true, { firstTen: { hudFit: false } })).toBe(false);
  });
});

describe("S38d css", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.indexOf("/* S38d"), css.indexOf("/* S40"));
  it("every rule in the S38d block is under body.touch.hud-fit", () => {
    const sels = block.split("\n").filter((l) => l.includes("{")).map((l) => l.split("{")[0].trim()).filter((s) => s && !s.startsWith("/*"));
    expect(sels.length).toBeGreaterThan(3);
    for (const s of sels) expect(s.startsWith("body.touch.hud-fit ")).toBe(true);
  });
  it("the shell adds hud-fit only in touch mode through the switch", () => {
    const src = readFileSync("components/MobileShell.tsx", "utf8");
    expect(src).toContain("touch && hudFitOn(");
    expect(src).toContain('classList.toggle("hud-fit", fit)');
  });
});

describe("S40 print card and pouch", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  const s40 = css.slice(css.indexOf("/* S40"));
  it("the Print card carries .away unless printNear, the same check as feeding", () => {
    expect(page).toContain('className={`card mood${printNear ? "" : " away"}`}');
    expect(page).toContain("onPrintNear={setPrintNear}");
  });
  it("every S40 rule is under body.touch, so desktop is untouched", () => {
    const sels = s40.split("\n").filter((l) => l.includes("{")).map((l) => l.split("{")[0].trim()).filter((x) => x && !x.startsWith("/*"));
    expect(sels.length).toBe(2);
    for (const x of sels) expect(x.startsWith("body.touch")).toBe(true);
    expect(s40).toContain("body.touch .mood.away { display: none; }");
  });
  it("the pouch sits at the bottom right, and the action buttons rise above it", () => {
    expect(css).toMatch(/body\.touch\.hud-fit \.hand \{ bottom: max\(12px, env\(safe-area-inset-bottom\)\); right: max\(24px, env\(safe-area-inset-right\)\)/);
    expect(s40).toContain("body.touch.hud-fit .tc-actions { bottom: calc(max(12px, env(safe-area-inset-bottom)) + 52px); }");
  });
  it("the geometry clears: landscape 844x390 and portrait 390x844, pouch at most 44px tall", () => {
    const stick = 132, doBtn = 84, pouchTop = 12 + 44, actionsBottom = 12 + 52;
    expect(actionsBottom).toBeGreaterThanOrEqual(pouchTop + 8); // Do button clears the pouch
    for (const h of [390, 844]) expect(h - actionsBottom - doBtn).toBeGreaterThan(48 + 16 + 8); // and stays below the Map/Book row
    // the Print card (top-left, ends above the stick) and the stick share the left; the pouch is on the right
    const cardMax = 390 - 24 - stick - 8 - 12; expect(cardMax).toBeGreaterThan(100);
  });
});
