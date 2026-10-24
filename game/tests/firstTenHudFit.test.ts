import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagOn, hudFitOn } from "@/lib/firstTen";
import firstTen from "@/data/firstTen.json";

describe("S38d switch", () => {
  it("ships off; anything but a plain true is off", () => {
    expect((firstTen as { firstTen: { hudFit: unknown } }).firstTen.hudFit).toBe(false);
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
  const block = css.slice(css.indexOf("/* S38d"));
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
