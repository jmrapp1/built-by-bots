// S39: touch fixes. Pure checks plus wiring read from source (no browser).
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { anyPanelOpen, canActNow } from "@/lib/touchControls";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const ctl = readFileSync("components/TouchControls.tsx", "utf8");
const base = { tag: null, findable: false, feedTag: null, nearKind: null, hatchWait: 0, menu: false, npc: false };

describe("S39 interaction button: same test as the desktop prompt", () => {
  it("hidden with nothing nearby", () => expect(canActNow(base)).toBe(false));
  it("shown when a prompt is showing", () => expect(canActNow({ ...base, tag: "Take egg", nearKind: "egg" })).toBe(true));
  it("shown for feeding and for Found you", () => {
    expect(canActNow({ ...base, tag: "Hold to feed", feedTag: "Hold to feed" })).toBe(true);
    expect(canActNow({ ...base, tag: "Found you?", findable: true })).toBe(true);
  });
  it("a hatching countdown has no E key cap on desktop, so no button; at zero there is one", () => {
    expect(canActNow({ ...base, tag: "Hatching in 5s", nearKind: "nest", hatchWait: 5 })).toBe(false);
    expect(canActNow({ ...base, tag: "Hatch", nearKind: "nest", hatchWait: 0 })).toBe(true);
  });
  it("hidden while a board, picker or neighbour strip is open (the desktop prompt hides too)", () => {
    expect(canActNow({ ...base, tag: "Read the board", nearKind: "notice", menu: true })).toBe(false);
    expect(canActNow({ ...base, tag: "Hello", nearKind: "npc", npc: true })).toBe(false);
  });
  it("page.tsx feeds it the same tag, findable and feed values the desktop prompt reads", () => {
    expect(page).toMatch(/act: canActNow\(\{ tag: findable \? FOUND_PROMPT : feedPrompt\(/);
    expect(page).toMatch(/\{tag && !menu && !npcLine && \(/); // the desktop prompt's own gate is unchanged
  });
  it("the Do button is not rendered without act", () => expect(ctl).toMatch(/showDo && btn\("do", "tc-do"\)/));
  it("a Do button that disappears while held lets go of E", () => expect(ctl).toMatch(/\[showDo\]/));
});

describe("S39 joystick hides while any view is open", () => {
  const closed = { menu: false, menuOpen: false, mapOpen: false, bookOpen: false, npc: false };
  it("open when nothing is up", () => expect(anyPanelOpen(closed)).toBe(false));
  for (const k of Object.keys(closed)) it(`hidden for ${k}`, () => expect(anyPanelOpen({ ...closed, [k]: true })).toBe(true));
  it("page.tsx passes every view into panelOpen", () => expect(page).toMatch(/panelOpen=\{anyPanelOpen\(\{ menu: !!menu, menuOpen, mapOpen: mp\.open, bookOpen, npc: !!npcLine \}\)\}/));
  it("the stick is only rendered while the panel is closed, and keys are released on hide", () => {
    expect(ctl).toMatch(/\{!hidden && <div ref=\{base\} className="tc-stick"/);
    expect(ctl).toMatch(/if \(hidden\) \{ releaseAll\(\)/);
  });
  it("every route that closes a view clears the state that hides the stick", () => {
    // Close button
    expect(page).toMatch(/onClose=\{\(\) => \{ setMenu\(null\); setMenuOpen\(false\); mp\.setOpen\(false\); setBookOpen\(false\); setNpcLine\(null\)/);
    // Escape
    expect(page).toMatch(/e\.code === "Escape"\) \{ setMenu\(null\); setMenuOpen\(false\); mp\.setOpen\(false\); \}/);
    // each panel's own close
    expect(page).toMatch(/onClose=\{\(\) => setBookOpen\(false\)\}/);
    expect(page).toMatch(/onClose=\{\(\) => mp\.setOpen\(false\)\}/);
    expect(page).toMatch(/KeepsakePicker[^\n]*onClose=\{\(\) => setMenu\(null\)\}/);
    expect(page).toMatch(/PickerStrip[^\n]*onClose=\{\(\) => setMenu\(null\)\}/);
  });
  it("the HUD cards step aside while a view is open, touch mode only", () => {
    expect(css).toMatch(/body\.touch\.panel-open \.mood/);
    expect(readFileSync("components/MobileShell.tsx", "utf8")).toMatch(/classList\.toggle\("panel-open", touch && panelOpen\)/);
  });
});

describe("S39 print window, legend and selection", () => {
  it("the old Back/Next Print selector is gone and nothing refers to it (the Print book replaced it in S35)", () => {
    expect(page).toMatch(/<PrintBook /);
  });
  it("the board's own Back/Next pages are a different thing and stay", () => expect(page).toMatch(/board-nav/));
  it("the button legend is not mounted and its file is gone", () => {
    expect(page).not.toMatch(/<TouchLegend/);
    expect(existsSync("components/TouchLegend.tsx")).toBe(false);
  });
  it("the desktop key list is unchanged", () => expect(page).toMatch(/<dl className="keys">/));
  it("no selection, callout or tap highlight on touch, text fields excepted", () => {
    expect(css).toMatch(/body\.touch \*, body\.touch \{ user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; \}/);
    expect(css).toMatch(/body\.touch input, body\.touch textarea[^{]*\{ user-select: text/);
  });
  it("every S39 CSS rule is under body.touch", () => {
    const s39 = css.slice(css.indexOf("S39: touch fixes"), css.indexOf("/* S38d")).split("\n").filter((l) => l.includes("{") && !l.startsWith("/*"));
    expect(s39.length).toBeGreaterThan(2);
    for (const l of s39) expect(l).toMatch(/^body\.touch[ .]/);
  });
});
