import { describe, expect, it } from "vitest";
import { KEYS, hourOfDay, hourOverride, lerpColor, lightingAt } from "@/lib/daynight";

const key = (name: string) => KEYS.find((k) => k.name === name)!;

describe("key times", () => {
  it("are sorted, inside 0-24, and start at midnight", () => {
    expect(KEYS[0].hour).toBe(0);
    for (let i = 1; i < KEYS.length; i++) expect(KEYS[i].hour).toBeGreaterThan(KEYS[i - 1].hour);
    expect(KEYS[KEYS.length - 1].hour).toBeLessThan(24);
  });
  it("uses valid colours and a sun that is always above the horizon", () => {
    for (const k of KEYS) {
      for (const c of [k.sky, k.fog, k.hemisphereSky, k.hemisphereGround, k.sun]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(k.sunPosition[1]).toBeGreaterThan(3);
      expect(k.hemisphereIntensity).toBeGreaterThanOrEqual(0.9); // readable at night
    }
  });
});

describe("lightingAt", () => {
  it("returns a key exactly at its time", () => {
    const d = key("day");
    const l = lightingAt(d.hour);
    expect(l.sky).toBe(d.sky);
    expect(l.sunIntensity).toBeCloseTo(d.sunIntensity);
    expect(l.sunPosition).toEqual(d.sunPosition);
  });
  it("blends between two keys", () => {
    const a = key("dawn"), b = key("day");
    const mid = lightingAt((a.hour + b.hour) / 2);
    expect(mid.sunIntensity).toBeGreaterThan(a.sunIntensity);
    expect(mid.sunIntensity).toBeLessThan(b.sunIntensity);
    expect(mid.sky).toBe(lerpColor(a.sky, b.sky, 0.5));
  });
  it("is darker at night than at noon, but never black", () => {
    expect(lightingAt(0).hemisphereIntensity).toBeLessThan(lightingAt(12).hemisphereIntensity);
    expect(lightingAt(0).hemisphereIntensity).toBeGreaterThan(0.5);
  });
  it("wraps cleanly at midnight", () => {
    const before = lightingAt(23.999), at = lightingAt(0), after = lightingAt(0.001);
    expect(before.sky).toBe(at.sky);
    expect(after.sky).toBe(at.sky);
    expect(lightingAt(24).sky).toBe(at.sky);
    expect(lightingAt(-1).sky).toBe(lightingAt(23).sky);
  });
  it("changes smoothly: no big jump between neighbouring minutes", () => {
    let prev = lightingAt(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const cur = lightingAt(m / 60);
      expect(Math.abs(cur.hemisphereIntensity - prev.hemisphereIntensity)).toBeLessThan(0.05);
      expect(Math.abs(cur.sunIntensity - prev.sunIntensity)).toBeLessThan(0.05);
      prev = cur;
    }
  });
});

describe("clock helpers", () => {
  it("reads local hours and minutes", () => {
    expect(hourOfDay(new Date(2026, 9, 19, 18, 30, 0))).toBeCloseTo(18.5);
    expect(hourOfDay(new Date(2026, 9, 19, 0, 0, 0))).toBe(0);
  });
  it("parses the hour override and ignores junk", () => {
    expect(hourOverride("?hour=21.5")).toBe(21.5);
    expect(hourOverride("?hour=25")).toBe(1);
    expect(hourOverride("?hour=-1")).toBe(23);
    expect(hourOverride("?hour=abc")).toBeNull();
    expect(hourOverride("")).toBeNull();
  });
  it("lerps colours", () => {
    expect(lerpColor("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(lerpColor("#102030", "#102030", 0.7)).toBe("#102030");
  });
});
