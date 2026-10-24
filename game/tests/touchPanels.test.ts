import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MOBILE, MOBILE_ENABLED, perfStart, perfStep, renderSettings } from "@/lib/touchInput";

describe("S37 step 3: render settings", () => {
  it("the flag is on (S37 step 3b)", () => {
    expect(MOBILE_ENABLED).toBe(true);
    expect(JSON.parse(readFileSync("data/mobile.json", "utf8")).mobile.enabled).toBe(true);
  });
  it("not touch: exactly today's renderer (ratio capped at 2, soft shadows, 1024 map)", () => {
    expect(renderSettings(false, 3)).toEqual({ pixelRatio: 2, shadowType: "soft", shadowMap: 1024 });
    expect(renderSettings(false, 1)).toEqual({ pixelRatio: 1, shadowType: "soft", shadowMap: 1024 });
    expect(renderSettings(false, NaN).pixelRatio).toBe(1);
  });
  it("touch: lower cap, basic shadows, never below the floor", () => {
    expect(renderSettings(true, 3)).toEqual({ pixelRatio: MOBILE.pixelRatioTouch, shadowType: "basic", shadowMap: MOBILE.shadowMapTouch });
    expect(renderSettings(true, 1).pixelRatio).toBe(1);
    expect(renderSettings(true, 0.5).pixelRatio).toBe(MOBILE.pixelRatioMin);
    expect(renderSettings(true, 2, { ...MOBILE, shadowsTouch: "soft" }).shadowType).toBe("soft");
  });
});

describe("S37 step 3: slow-frame step", () => {
  const run = (frames: number[], start = 1.5, m = MOBILE) => {
    let p = perfStart(start, 0), t = 0, drops = 0;
    for (const f of frames) { t += f; const r = perfStep(p, f, t, m); p = r.perf; if (r.dropped) drops++; }
    return { ratio: p.ratio, drops };
  };
  const secs = (ms: number, s: number) => Array(Math.ceil((s * 1000) / ms)).fill(ms);
  it("fast frames never drop", () => expect(run(secs(16, 30))).toEqual({ ratio: 1.5, drops: 0 }));
  it("slow frames drop one step per window and stop at the floor, never rising", () => {
    const r = run(secs(40, 40));
    expect(r.ratio).toBe(MOBILE.pixelRatioMin);
    expect(r.drops).toBe(2); // 1.5 -> 1.25 -> 1
  });
  it("a single huge hiccup (tab switch) is ignored", () => expect(run([2000, ...secs(16, 10)]).drops).toBe(0));
  it("recovering speed does not raise the ratio", () => {
    const r = run([...secs(40, 5), ...secs(10, 30)]);
    expect(r.ratio).toBeLessThan(1.5);
    expect(r.ratio).toBeGreaterThanOrEqual(MOBILE.pixelRatioMin);
  });
});

describe("S37 step 3: wiring read from source", () => {
  const world = readFileSync("components/World.tsx", "utf8");
  it("touch look in World.tsx is behind the flag", () => {
    expect(world).toMatch(/const lookOn = MOBILE_ENABLED/);
    expect(world).toMatch(/if \(!lookOn \|\| e\.pointerId !== lookId\) return;/);
  });
  it("every canvas pointer listener is removed on cleanup, including pointercancel", () => {
    for (const ev of ["pointercancel", "pointerdown", "pointerup", "pointermove"]) {
      expect(world).toContain(`dom.addEventListener("${ev}"`);
      expect(world).toContain(`dom.removeEventListener("${ev}"`);
    }
  });
  it("the touch code never calls fetch or touches storage", () => {
    for (const f of ["components/TouchControls.tsx", "components/MobileShell.tsx", "lib/touchInput.ts", "lib/touchControls.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/\bfetch\(|localStorage|sessionStorage|indexedDB/);
    }
  });
  it("all new touch CSS is gated by body.touch or touch-only classes", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const step3 = css.slice(css.indexOf("S37 step 3"));
    for (const line of step3.split("\n").filter((l) => l.includes("{") && !l.startsWith("/*"))) expect(line).toMatch(/^(body\.touch[ .]|html:has\(body\.touch\) |\.tc-close|\.legend)/);
  });
  it("the Close button only renders in touch mode (the button legend is gone on touch, S39)", () => {
    expect(readFileSync("components/TouchControls.tsx", "utf8")).toMatch(/\{hidden && <button[^>]*tc-close/);
  });
});
