// S41: pull-to-refresh guard. CSS and wiring read from source (a real phone is the only true check).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const world = readFileSync("components/World.tsx", "utf8");
const s41 = css.slice(css.indexOf("/* S41"));

describe("S41 no pull-to-refresh", () => {
  it("every S41 rule is touch-mode only", () => {
    const sels = s41.split("\n").filter((l) => l.includes("{")).map((l) => l.split("{")[0].trim()).filter((x) => x && !x.startsWith("/*"));
    expect(sels.length).toBe(2);
    for (const x of sels) expect(x.includes("body.touch")).toBe(true);
  });
  it("the canvas takes the swipe itself, and html and body do not chain scrolling", () => {
    expect(s41).toContain("body.touch .hud-root canvas { touch-action: none; }");
    expect(s41).toContain("html:has(body.touch) { overscroll-behavior: none; }");
    expect(css).toMatch(/body\.touch \{ overscroll-behavior: none;/);
  });
  it("scrolling panels still pan and contain their scroll", () => {
    for (const sel of ["body.touch .tray, body.touch .printbook", "body.touch .picker, body.touch .strip", "body.touch .npc-strip"]) {
      const line = css.split("\n").find((l) => l.startsWith(sel))!;
      expect(line).toContain("touch-action: pan-y");
    }
    expect(css).toMatch(/body\.touch \.tray, body\.touch \.printbook \{[^}]*overscroll-behavior: contain/);
  });
  it("the game page is a fixed full-screen root, so the document itself cannot scroll", () => {
    expect(css).toMatch(/\.hud-root \{ position: fixed; inset: 0; \}/);
  });
  it("look handlers are pointer events on the canvas (no passive touch listeners to cancel); stick and buttons keep touch-action none", () => {
    expect(world).toContain('dom.addEventListener("pointermove", pm)');
    expect(world).not.toMatch(/addEventListener\("touch(move|start)"/);
    expect(css).toMatch(/\.tc-stick, \.tc-btn \{ touch-action: none;/);
  });
  it("the look gesture ignores a second finger, so the stick finger never turns the camera", () => {
    expect(world).toContain("e.pointerId !== lookId");
  });
});
