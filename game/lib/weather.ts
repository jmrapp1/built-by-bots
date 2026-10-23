// S25: ink drizzle. On some days, for a few hours, a soft drizzle of tiny ink drops falls in the Garden.
// A look only: no sound, no text, no collision, nothing saved or sent. No three.js, no clock and no randomness here;
// the answer is a function of the local date and hour, so a reload gives the same weather. Every number is in data/weather.json.
import raw from "@/data/weather.json";
import { lerpColor, type Lighting } from "@/lib/daynight";
import { dayNumber } from "@/lib/npcs";
import type { FidgetState } from "@/lib/fidget";

export const WEATHER = raw;
export type WeatherMode = "on" | "off";
export type Weather = { intensity: number; tint: number; density: number; opacity: number; speed: number };

// Dev-only preview: ?weather=1 forces full drizzle at once; ?weather=off forces dry. Ignored (null) in production. Nothing is saved.
export const weatherOverride = (search: string, isProduction: boolean): WeatherMode | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("weather");
  return v === "1" ? "on" : v === "off" ? "off" : null;
};

// The player's local calendar day as YYYY-MM-DD.
export const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const hash = (n: number): number => {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const unit = (n: number): number => hash(n) / 4294967296;
const smooth = (u: number): number => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };

export type Window = { start: number; end: number };
// Today's drizzle window (local hours), or null on a dry day. Days come in blocks; each block picks `wetPerBlock` of its
// days, so it is about one day in four, never a fixed rhythm. Start and length come from the day number.
export function windowFor(day: number): Window | null {
  const block = Math.floor(day / raw.blockDays), idx = day - block * raw.blockDays;
  const wet: number[] = [];
  for (let k = 0; wet.length < raw.wetPerBlock && k < 200; k++) {
    const i = Math.floor(unit(block * 977 + k) * raw.blockDays);
    if (!wet.includes(i)) wet.push(i);
  }
  if (!wet.includes(idx)) return null;
  const [lo, hi] = raw.lengthHours, [s0, s1] = raw.startHours;
  const length = lo + unit(day * 31 + 7) * (hi - lo);
  const start = s0 + unit(day * 53 + 11) * (s1 - s0);
  return { start, end: Math.min(24, start + length) };
}

// 0 by day .. 1 deep in the night, easing over easeHours either side of the night hours (wraps midnight).
export function nightness(hour: number): number {
  const n = raw.night, h = ((hour % 24) + 24) % 24;
  const up = smooth((h - n.from) / n.easeHours + 0.5), down = 1 - smooth((h - n.to) / n.easeHours + 0.5);
  return h >= 12 ? up : down;
}

const NONE: Weather = { intensity: 0, tint: 0, density: 0, opacity: 0, speed: 0 };
const fadeH = raw.fadeSeconds / 3600;
// Window strength: 0 outside, 0 at both ends, easing in and out over fadeSeconds, 1 in between.
export function windowLevel(w: Window | null, hour: number): number {
  if (!w) return 0;
  const h = ((hour % 24) + 24) % 24;
  if (h <= w.start || h >= w.end) return 0;
  return smooth((h - w.start) / fadeH) * smooth((w.end - h) / fadeH);
}

// What the weather is on this day (a day number) at this local hour. Reduced motion keeps the tint and shows a few still
// drops: the count is the small `reducedCount` and the scene draws them at fixed spots (see dropY).
export function weatherAt(day: number, hour: number, reduced: boolean, force: WeatherMode | null = null): Weather {
  if (force === "off") return NONE;
  const level = force === "on" ? 1 : windowLevel(windowFor(day), hour);
  if (level <= 0) return NONE;
  const night = nightness(hour), n = raw.night;
  const mix = (a: number, b: number) => a + (b - a) * night;
  const density = reduced ? raw.drops.reducedCount / raw.drops.count : level * mix(1, n.drops);
  return { intensity: level, tint: level * mix(1, n.tint), density, opacity: level * raw.opacity * mix(1, n.opacity), speed: mix(1, n.speed) };
}

// The existing lighting, a touch greyer. Blends toward one grey; daynight.json is not touched. tint 0 returns it unchanged.
export function weatherLight(L: Lighting, tint: number): Lighting {
  if (tint <= 0) return L;
  const t = raw.tint, c = t.color;
  return {
    ...L,
    sky: lerpColor(L.sky, c, t.sky * tint), fog: lerpColor(L.fog, c, t.fog * tint),
    hemisphereSky: lerpColor(L.hemisphereSky, c, t.hemisphere * tint), hemisphereGround: lerpColor(L.hemisphereGround, c, t.hemisphere * tint),
    sunIntensity: L.sunIntensity * (1 - t.sunDim * tint),
  };
}

// One drop's fixed cell in the box around the player (0..1 each) and a speed multiplier. Index only, no randomness.
export type DropBase = { x: number; z: number; y: number; s: number };
export function dropBase(i: number): DropBase {
  return { x: unit(i * 4 + 1), z: unit(i * 4 + 2), y: unit(i * 4 + 3), s: 1 + (unit(i * 4 + 4) - 0.5) * 2 * raw.drops.speedSpread };
}
// Height of a drop (0..height) at time t seconds. Reduced motion: constant, no falling.
export function dropY(b: DropBase, t: number, speed: number, reduced: boolean): number {
  const H = raw.drops.height, y0 = b.y * H;
  if (reduced) return y0;
  const y = (y0 - raw.drops.speed * speed * b.s * t) % H;
  return y < 0 ? y + H : y;
}

// While it drizzles, an awake Print now and then does the existing glance fidget (data/fidget.json). Nothing new is animated.
export const nextGlanceGap = (roll: number, preview: boolean): number => (preview ? raw.glance.previewGap : raw.glance.gap[0] + Math.min(1, Math.max(0, roll)) * (raw.glance.gap[1] - raw.glance.gap[0]));
export const startGlance = (s: FidgetState, roll: number): FidgetState => (s.kind ? s : { ...s, kind: "glance", t: 0, w: 0, wait: 0, side: roll < 0.5 ? -1 : 1 });
