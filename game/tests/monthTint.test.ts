// Month tint: a stable pick by UTC month, values within bounds, night and dusk untouched, sky and fog never moved, the switch, and the wiring.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/monthTint.json";
import { KEYS, lerpColor, lightingAt } from "@/lib/daynight";
import { dayWeight, tintAmount, tintEnabled, tintLight, tintOverride, utcMonth } from "@/lib/monthTint";

const hex = /^#[0-9a-f]{6}$/i;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("month tint: data", () => {
  it("has twelve months in order, each a plain colour and a strength between 0 and max", () => {
    expect(raw.months).toHaveLength(12);
    expect(raw.months.map((m) => m.name)).toEqual(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
    for (const m of raw.months) { expect(m.color).toMatch(hex); expect(m.strength).toBeGreaterThanOrEqual(0); expect(m.strength).toBeLessThanOrEqual(raw.max); }
  });
  it("keeps the effect subtle: max is small and the fade windows are ordered", () => {
    expect(raw.max).toBeGreaterThan(0); expect(raw.max).toBeLessThanOrEqual(0.15);
    expect(raw.none[0]).toBeLessThan(raw.full[0]); expect(raw.full[0]).toBeLessThan(raw.full[1]); expect(raw.full[1]).toBeLessThan(raw.none[1]);
  });
});

describe("month tint: the pick", () => {
  it("is the UTC month, the same on every call, whatever the time of day or the local zone", () => {
    for (let m = 0; m < 12; m++) for (const t of ["01T00:00:00Z", "15T12:00:00Z", "28T23:59:59Z"]) {
      const d = new Date(`2026-${String(m + 1).padStart(2, "0")}-${t}`);
      expect(utcMonth(d)).toBe(m); expect(utcMonth(d)).toBe(utcMonth(new Date(d.getTime())));
    }
  });
  it("gives 0 for a bad date and never throws", () => { expect(utcMonth(new Date(NaN))).toBe(0); });
  it("gives the same light twice for the same month and hour", () => {
    const L = lightingAt(12);
    expect(tintLight(L, 6, 12)).toEqual(tintLight(L, 6, 12));
  });
});

describe("month tint: bounds", () => {
  it("the amount stays within 0 and max for every month and every quarter hour, and for odd inputs", () => {
    for (let m = -13; m < 26; m++) for (let h = -2; h < 26; h += 0.25) { const a = tintAmount(m, h); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(raw.max); }
    expect(tintAmount(NaN, 12)).toBeGreaterThanOrEqual(0);
  });
  it("tinted colours are still plain colours and intensity, sky, fog and sun position are never changed", () => {
    for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h += 0.5) {
      const L = lightingAt(h), T = tintLight(L, m, h);
      for (const k of ["hemisphereSky", "hemisphereGround", "sun"] as const) expect(T[k]).toMatch(hex);
      expect(T.sky).toBe(L.sky); expect(T.fog).toBe(L.fog); expect(T.hemisphereIntensity).toBe(L.hemisphereIntensity);
      expect(T.sunIntensity).toBe(L.sunIntensity); expect(T.sunPosition).toEqual(L.sunPosition);
    }
  });
  it("moves each colour channel by at most max of the way (a slight shift)", () => {
    const ch = (c: string, s: number) => (parseInt(c.slice(1), 16) >> s) & 255;
    for (let m = 0; m < 12; m++) { const L = lightingAt(12), T = tintLight(L, m, 12); for (const s of [0, 8, 16]) expect(Math.abs(ch(T.hemisphereSky, s) - ch(L.hemisphereSky, s))).toBeLessThanOrEqual(Math.ceil(255 * raw.max) + 1); }
  });
});

describe("month tint: clear of night and dusk", () => {
  it("is exactly nothing from late dusk to early dawn, and at every night and dusk key time", () => {
    for (const h of [0, 3, 5.5, 7, 7.5, 17.5, 18.5, 20.5, 22, 23.9]) { expect(dayWeight(h)).toBe(0); for (let m = 0; m < 12; m++) expect(tintLight(lightingAt(h), m, h)).toEqual(lightingAt(h)); }
    for (const k of KEYS.filter((k) => ["night", "pre-dawn", "dusk", "twilight"].includes(k.name))) expect(dayWeight(k.hour)).toBe(0);
  });
  it("is full across midday and rises and falls smoothly without a step", () => {
    for (const h of [9, 12, 15]) expect(dayWeight(h)).toBe(1);
    let prev = dayWeight(7.5); for (let h = 7.5; h <= 9; h += 0.05) { const w = dayWeight(h); expect(w).toBeGreaterThanOrEqual(prev - 1e-9); expect(w - prev).toBeLessThan(0.1); prev = w; }
    prev = dayWeight(15); for (let h = 15; h <= 17.5; h += 0.05) { const w = dayWeight(h); expect(w).toBeLessThanOrEqual(prev + 1e-9); expect(prev - w).toBeLessThan(0.1); prev = w; }
  });
});

describe("month tint: the switch and the wiring", () => {
  it("?tint=off turns it off in dev builds only; production ignores it", () => {
    expect(tintOverride("?tint=off", false)).toBe("off"); expect(tintEnabled("?tint=off", false)).toBe(false);
    expect(tintEnabled("", false)).toBe(true); expect(tintEnabled("?tint=1", false)).toBe(true);
    expect(tintOverride("?tint=off", true)).toBeNull(); expect(tintEnabled("?tint=off", true)).toBe(true);
  });
  it("the module and the data have no network, storage, random or clock-of-the-device use", () => {
    const src = strip(readFileSync("lib/monthTint.ts", "utf8"));
    expect(src).not.toMatch(/fetch\(|localStorage|sessionStorage|Math\.random|XMLHttpRequest|document\.cookie|Date\.now|new Date\(\)/);
  });
  it("World.tsx applies it in the World only, from the UTC month, behind the switch", () => {
    const w = strip(readFileSync("components/World.tsx", "utf8"));
    expect(w).toMatch(/monthTintOn && zones\.is\("garden"\)\) L = tintLight\(L, utcMonth\(new Date\(\)\), hourNow\)/);
    expect(w).toMatch(/tintEnabled\(window\.location\.search, process\.env\.NODE_ENV === "production"\)/);
  });
});

describe("month tint: each month is pinned", () => {
  // Written out by hand, so swapping two months in the data file fails here. Changing a look on purpose means changing this table too.
  const PIN: [string, string, number][] = [
    ["January", "#cfe0f2", 0.1],
    ["February", "#d6e2ef", 0.08],
    ["March", "#d8efc8", 0.09],
    ["April", "#c8eed2", 0.11],
    ["May", "#c4f0b4", 0.12],
    ["June", "#fff0b0", 0.12],
    ["July", "#ffe6a0", 0.13],
    ["August", "#ffdc98", 0.12],
    ["September", "#f6d49a", 0.11],
    ["October", "#f2b98a", 0.13],
    ["November", "#dcc2b4", 0.1],
    ["December", "#c4d6ec", 0.11],
  ];
  it("has these twelve names, colours and strengths, in this order", () => {
    expect(raw.months.map((m) => [m.name, m.color, m.strength])).toEqual(PIN);
  });
  it.each(PIN.map((p, i) => [i, ...p] as const))("month %i (%s) tints toward %s at midday", (i, _name, color, strength) => {
    const L = lightingAt(12), T = tintLight(L, i, 12);
    expect(tintAmount(i, 12)).toBeCloseTo(strength, 10);
    expect(T).toEqual(tintLight(L, i, 12));
    expect(T.sun).toBe(lerpColor(L.sun, color, strength));
    expect(T.hemisphereSky).toBe(lerpColor(L.hemisphereSky, color, strength));
  });
  it("picks each month by its own number from a UTC date", () => {
    PIN.forEach(([, color, strength], i) => {
      const d = new Date(Date.UTC(2026, i, 15, 12)), L = lightingAt(12);
      expect(tintLight(L, utcMonth(d), 12).sun).toBe(lerpColor(L.sun, color, strength));
    });
  });
});
