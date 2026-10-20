// Pure day/night lighting. Given a local clock time, blend between the key
// times in data/daynight.json. No three.js here, so it is fully unit-tested.
import data from "@/data/daynight.json";

export type Key = {
  hour: number; name: string; sky: string; fog: string; hemisphereSky: string; hemisphereGround: string;
  hemisphereIntensity: number; sun: string; sunIntensity: number; sunPosition: [number, number, number];
};
export type Lighting = Omit<Key, "hour" | "name">;

export const KEYS = data.keys as Key[];

// Hours since local midnight, 0 <= h < 24.
export function hourOfDay(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// Optional ?hour=21.5 override, for looking at a time of day without waiting.
export function hourOverride(search: string): number | null {
  const v = new URLSearchParams(search).get("hour");
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return ((n % 24) + 24) % 24;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, t));
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// Smooth ease so the change starts and ends gently.
const ease = (t: number) => t * t * (3 - 2 * t);

export function lightingAt(hour: number, keys: Key[] = KEYS): Lighting {
  const h = ((hour % 24) + 24) % 24;
  // find the key at or before h, and the next one (wrapping past midnight)
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) if (keys[k].hour <= h) i = k;
  const a = keys[i], b = keys[(i + 1) % keys.length];
  const aH = a.hour <= h ? a.hour : a.hour - 24; // last key of the day, seen from after midnight
  const bH = b.hour > aH ? b.hour : b.hour + 24;
  const span = bH - aH;
  const t = span <= 0 ? 0 : ease(Math.min(1, Math.max(0, (h - aH) / span)));
  return {
    sky: lerpColor(a.sky, b.sky, t),
    fog: lerpColor(a.fog, b.fog, t),
    hemisphereSky: lerpColor(a.hemisphereSky, b.hemisphereSky, t),
    hemisphereGround: lerpColor(a.hemisphereGround, b.hemisphereGround, t),
    hemisphereIntensity: lerp(a.hemisphereIntensity, b.hemisphereIntensity, t),
    sun: lerpColor(a.sun, b.sun, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunPosition: [0, 1, 2].map((n) => lerp(a.sunPosition[n], b.sunPosition[n], t)) as [number, number, number],
  };
}
