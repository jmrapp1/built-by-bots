import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MOBILE, MOBILE_ENABLED, canFullscreen, goFullscreen, isEnabled, isFullscreen, isPortrait, leaveFullscreen, showPortraitCover, touchMode, touchOverride } from "@/lib/touchInput";

describe("kill switch", () => {
  it("ships on (S37 step 3b), and only a plain true counts", () => {
    expect(MOBILE_ENABLED).toBe(true);
    expect(isEnabled({ mobile: { enabled: false } })).toBe(false);
    expect(isEnabled({ mobile: { enabled: true } })).toBe(true);
    for (const v of [false, "true", 1, null, undefined, {}]) expect(isEnabled({ mobile: { enabled: v } })).toBe(false);
    for (const d of [null, undefined, 5, "x", {}, { mobile: null }]) expect(isEnabled(d)).toBe(false);
  });
  it("has the numbers the spec lists", () => {
    expect(MOBILE.minTarget).toBeGreaterThanOrEqual(44);
    expect(MOBILE.hybridPrimaryOnly).toBe(true);
  });
});

describe("touchMode truth table", () => {
  it("off when disabled, whatever else", () => {
    for (const c of [true, false]) for (const li of [null, "touch", "mouse"] as const) expect(touchMode(c, 5, false, li)).toBe(false);
  });
  it("off with no touch points", () => {
    expect(touchMode(true, 0, true, null)).toBe(false);
    expect(touchMode(true, 0, true, "touch")).toBe(false);
  });
  it("a coarse primary pointer turns it on", () => {
    expect(touchMode(true, 5, true, null)).toBe(true);
    expect(touchMode(false, 5, true, null)).toBe(false); // laptop with a touch screen, mouse primary
  });
  it("a real mouse turns it off, a real touch turns it on", () => {
    expect(touchMode(true, 5, true, "mouse")).toBe(false);
    expect(touchMode(false, 5, true, "touch")).toBe(true);
  });
});

describe("orientation", () => {
  it("portrait only when clearly taller than wide", () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(500, 500)).toBe(false);
    expect(isPortrait(0, 0)).toBe(false);
    expect(isPortrait(NaN, 800)).toBe(false);
  });
  it("the cover needs touch, portrait and a signed-in game; a preview forces it", () => {
    expect(showPortraitCover(true, true, true)).toBe(true);
    expect(showPortraitCover(true, true, false)).toBe(false); // never over the sign-in form
    expect(showPortraitCover(true, false, true)).toBe(false);
    expect(showPortraitCover(false, true, true)).toBe(false);
    expect(showPortraitCover(false, false, false, true)).toBe(true);
  });
});

describe("dev preview switches", () => {
  it("work in dev, inert in production", () => {
    expect(touchOverride("?touch=1", false)).toEqual({ touch: true, portrait: false });
    expect(touchOverride("?touch=0&portrait=1", false)).toEqual({ touch: false, portrait: true });
    expect(touchOverride("?touch=yes", false)).toEqual({ touch: null, portrait: false });
    expect(touchOverride("?touch=1&portrait=1", true)).toEqual({ touch: null, portrait: false });
  });
});

describe("fullscreen", () => {
  it("enters, then tries the landscape lock", async () => {
    const req = vi.fn().mockResolvedValue(undefined), lock = vi.fn().mockResolvedValue(undefined);
    expect(await goFullscreen({ requestFullscreen: req }, { orientation: { lock } })).toBe(true);
    expect(req).toHaveBeenCalledOnce(); expect(lock).toHaveBeenCalledWith("landscape");
  });
  it("is silent when unsupported or refused", async () => {
    expect(canFullscreen({})).toBe(false);
    expect(await goFullscreen({}, {})).toBe(false);
    expect(await goFullscreen(null, null)).toBe(false);
    expect(await goFullscreen({ requestFullscreen: () => Promise.reject(new Error("no")) }, {})).toBe(false);
    expect(await goFullscreen({ requestFullscreen: () => { throw new Error("no"); } }, {})).toBe(false);
  });
  it("a refused lock still counts as full screen", async () => {
    const lock = vi.fn().mockRejectedValue(new Error("nope"));
    expect(await goFullscreen({ requestFullscreen: async () => {} }, { orientation: { lock } })).toBe(true);
  });
  it("reads and leaves full screen without throwing", async () => {
    expect(isFullscreen({ fullscreenElement: {} as Element })).toBe(true);
    expect(isFullscreen({ fullscreenElement: null })).toBe(false);
    expect(isFullscreen(null)).toBe(false);
    const exit = vi.fn().mockResolvedValue(undefined);
    await leaveFullscreen({ fullscreenElement: {} as Element, exitFullscreen: exit });
    expect(exit).toHaveBeenCalledOnce();
    await leaveFullscreen({ fullscreenElement: null, exitFullscreen: exit });
    expect(exit).toHaveBeenCalledOnce();
    await expect(leaveFullscreen({ fullscreenElement: {} as Element, exitFullscreen: () => Promise.reject(new Error("x")) })).resolves.toBeUndefined();
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("the lib and shell make no network call and touch no storage", () => {
    for (const f of ["lib/touchInput.ts", "components/MobileShell.tsx"]) {
      const s = read(f);
      expect(s).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon/);
    }
  });
  it("the shell mounts nothing when the flag is off, and the touch class is only set from it", () => {
    const s = read("components/MobileShell.tsx");
    expect(s).toMatch(/if \(!MOBILE_ENABLED\) return null/);
    expect(s).toMatch(/isTrusted/);
  });
  it("the viewport is set only when the flag is on", () => {
    expect(read("app/layout.tsx")).toMatch(/MOBILE_ENABLED \? \{[^}]*viewportFit: "cover"[^}]*interactiveWidget: "resizes-content"[^}]*\} : undefined/);
  });
  it("all new touch CSS is gated by body.touch or the cover", () => {
    const css = read("app/globals.css");
    const part = css.slice(css.indexOf("S37: phone support"));
    expect(part).not.toMatch(/^\.(iconbtn|stage|hud-root)\b/m); // desktop rules are never rewritten
    expect(part).toMatch(/^body\.touch \.iconbtn/m);
  });
});
